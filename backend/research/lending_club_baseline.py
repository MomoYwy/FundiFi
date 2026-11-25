"""Offline Lending Club research; not compatible with the FundiFi API."""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBClassifier

NUMERIC = [
    "loan_amnt",
    "annual_inc",
    "dti",
    "delinq_2yrs",
    "inq_last_6mths",
    "open_acc",
    "revol_util",
    "total_acc",
]
CATEGORICAL = ["term", "emp_length", "home_ownership", "purpose"]
FEATURES = NUMERIC + CATEGORICAL
STATUSES = {"Fully Paid": 0, "Charged Off": 1}
SEED = 42
LATEST_ISSUE = pd.Timestamp("2015-12-01")
SPLITS = {
    "original_windows": {
        "train": ("2007-06", "2007-12"),
        "calibration": ("2011-01", "2011-06"),
        "threshold": ("2011-07", "2011-12"),
        "test": ("2015-07", "2015-12"),
    },
    "expanded_windows": {
        "train": ("2007-06", "2008-06"),
        "calibration": ("2011-07", "2011-12"),
        "threshold": ("2012-01", "2012-06"),
        "test": ("2015-07", "2015-12"),
    },
}


def load_cohort(path: Path) -> tuple[pd.DataFrame, dict]:
    columns = FEATURES + ["issue_d", "loan_status"]
    chunks = []
    counts = {
        "rows_read": 0, "missing_issue_date": 0, "after_cutoff": 0,
        "excluded_term": 0, "excluded_status": 0,
    }
    terms_by_year = {}
    for frame in pd.read_csv(path, usecols=columns, chunksize=50000, low_memory=False):
        counts["rows_read"] += len(frame)
        frame["issue_d"] = pd.to_datetime(frame["issue_d"], format="%b-%Y", errors="coerce")
        counts["missing_issue_date"] += int(frame["issue_d"].isna().sum())
        counts["after_cutoff"] += int((frame["issue_d"] > LATEST_ISSUE).sum())
        eligible = frame["issue_d"].notna() & (frame["issue_d"] <= LATEST_ISSUE)
        by_term = frame.loc[eligible].groupby(
            [frame.loc[eligible, "issue_d"].dt.year, "term"], dropna=False
        ).size()
        for (year, term), count in by_term.items():
            key = f"{int(year)}: {str(term).strip()}"
            terms_by_year[key] = terms_by_year.get(key, 0) + int(count)
        is_36_month = frame["term"].fillna("").astype(str).str.strip() == "36 months"
        counts["excluded_term"] += int((eligible & ~is_36_month).sum())
        eligible &= is_36_month
        counts["excluded_status"] += int((eligible & ~frame["loan_status"].isin(STATUSES)).sum())
        frame = frame.loc[eligible & frame["loan_status"].isin(STATUSES)].copy()
        frame["target"] = frame["loan_status"].map(STATUSES).astype(int)
        chunks.append(frame.drop(columns="loan_status"))
    if not chunks:
        raise ValueError("The dataset has no readable rows.")
    data = pd.concat(chunks, ignore_index=True)
    if data.empty:
        raise ValueError("No eligible loans found; check the input dataset.")
    counts["terms_by_issue_year"] = terms_by_year
    return data, counts


def chronological_split(data: pd.DataFrame, windows: dict) -> dict:
    splits = {}
    for name, (start, end) in windows.items():
        start, end = pd.Timestamp(start), pd.Timestamp(end)
        split = data.loc[data["issue_d"].between(start, end)]
        if split.empty or split["target"].nunique() != 2:
            raise ValueError(f"{name} split must contain both classes.")
        splits[name] = split
    if splits["train"]["issue_d"].max() + pd.DateOffset(months=36) >= splits["calibration"]["issue_d"].min():
        raise ValueError("Training loans must mature before the calibration cohort.")
    if splits["calibration"]["issue_d"].max() >= splits["threshold"]["issue_d"].min():
        raise ValueError("Calibration and threshold cohorts must not overlap.")
    if splits["threshold"]["issue_d"].max() + pd.DateOffset(months=36) >= splits["test"]["issue_d"].min():
        raise ValueError("Threshold loans must mature before the test cohort.")
    return splits


def preprocessing() -> ColumnTransformer:
    return ColumnTransformer(
        [
            ("numeric", Pipeline([
                ("impute", SimpleImputer(strategy="median", keep_empty_features=True)),
                ("scale", StandardScaler()),
            ]), NUMERIC),
            ("categorical", Pipeline([
                ("impute", SimpleImputer(strategy="most_frequent", keep_empty_features=True)),
                ("encode", OneHotEncoder(handle_unknown="ignore")),
            ]), CATEGORICAL),
        ]
    )


def choose_threshold(y: pd.Series, probabilities: np.ndarray) -> float:
    precision, recall, thresholds = precision_recall_curve(y, probabilities)
    if len(thresholds) == 0:
        raise ValueError("Cannot choose a threshold without validation predictions.")
    denominator = precision[:-1] + recall[:-1]
    f1 = np.divide(2 * precision[:-1] * recall[:-1], denominator,
                   out=np.zeros_like(denominator), where=denominator != 0)
    return float(thresholds[np.argmax(f1)])


def evaluate(y: pd.Series, probabilities: np.ndarray, threshold: float) -> dict:
    predicted = probabilities >= threshold
    bins = []
    edges = np.linspace(0, 1, 11)
    indices = np.minimum(np.searchsorted(edges, probabilities, side="right") - 1, 9)
    for index in range(10):
        mask = indices == index
        if mask.any():
            bins.append({
                "range": [float(edges[index]), float(edges[index + 1])],
                "count": int(mask.sum()),
                "mean_prediction": float(probabilities[mask].mean()),
                "observed_rate": float(y.to_numpy()[mask].mean()),
            })
    return {
        "threshold_selected_on_validation": threshold,
        "precision": float(precision_score(y, predicted, zero_division=0)),
        "recall": float(recall_score(y, predicted, zero_division=0)),
        "average_precision_pr_auc": float(average_precision_score(y, probabilities)),
        "roc_auc": float(roc_auc_score(y, probabilities)),
        "brier_score": float(brier_score_loss(y, probabilities)),
        "calibration_bins": bins,
    }


def summary(frame: pd.DataFrame) -> dict:
    return {
        "rows": len(frame),
        "first_issue_month": frame["issue_d"].min().strftime("%Y-%m"),
        "last_issue_month": frame["issue_d"].max().strftime("%Y-%m"),
        "charged_off": int(frame["target"].sum()),
        "prevalence": float(frame["target"].mean()),
    }


def sigmoid_input(probabilities: np.ndarray) -> np.ndarray:
    probabilities = np.clip(probabilities, 1e-6, 1 - 1e-6)
    return np.log(probabilities / (1 - probabilities)).reshape(-1, 1)


def calibrate_sigmoid(
    calibration_probability: np.ndarray,
    calibration_target: pd.Series,
    threshold_probability: np.ndarray,
    test_probability: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    calibrator = LogisticRegression(random_state=SEED, max_iter=1000)
    calibrator.fit(sigmoid_input(calibration_probability), calibration_target)
    return (
        calibrator.predict_proba(sigmoid_input(threshold_probability))[:, 1],
        calibrator.predict_proba(sigmoid_input(test_probability))[:, 1],
    )


def run_scenario(data: pd.DataFrame, windows: dict) -> dict:
    splits = chronological_split(data, windows)
    train, calibration, threshold_set, test = (
        splits[name] for name in ("train", "calibration", "threshold", "test")
    )
    result = {
        "splits": {name: summary(frame) for name, frame in splits.items()},
        "missing_fraction": {key: float(value) for key, value in train[FEATURES].isna().mean().items()},
        "models": {},
    }
    prevalence = float(train["target"].mean())
    result["models"]["majority_prevalence"] = evaluate(
        test["target"], np.full(len(test), prevalence), 0.5
    )
    result["models"]["majority_prevalence"]["training_prevalence"] = prevalence
    result["models"]["majority_prevalence"]["threshold_selected_on_validation"] = None
    estimators = {
        "logistic_regression": LogisticRegression(max_iter=1000, random_state=SEED),
        "xgboost": XGBClassifier(
            n_estimators=150, max_depth=4, learning_rate=0.1,
            eval_metric="logloss", random_state=SEED, n_jobs=4,
        ),
    }
    for name, estimator in estimators.items():
        pipeline = Pipeline([("preprocess", preprocessing()), ("model", estimator)])
        pipeline.fit(train[FEATURES], train["target"])
        calibration_probability = pipeline.predict_proba(calibration[FEATURES])[:, 1]
        threshold_probability = pipeline.predict_proba(threshold_set[FEATURES])[:, 1]
        test_probability = pipeline.predict_proba(test[FEATURES])[:, 1]
        threshold = choose_threshold(threshold_set["target"], threshold_probability)
        result["models"][name + "_uncalibrated"] = evaluate(test["target"], test_probability, threshold)

        calibrated_threshold, calibrated_test = calibrate_sigmoid(
            calibration_probability, calibration["target"], threshold_probability, test_probability
        )
        threshold = choose_threshold(threshold_set["target"], calibrated_threshold)
        result["models"][name + "_sigmoid"] = evaluate(test["target"], calibrated_test, threshold)

    numeric = Pipeline([
        ("impute", SimpleImputer(strategy="median", keep_empty_features=True)),
        ("scale", StandardScaler()),
    ])
    scaled_train = numeric.fit_transform(train[NUMERIC])
    scaled_test = numeric.transform(test[NUMERIC])
    cluster = KMeans(n_clusters=4, n_init=10, random_state=SEED).fit(scaled_train)
    train_distance = cluster.transform(scaled_train).min(axis=1)
    test_distance = cluster.transform(scaled_test).min(axis=1)
    cutoff = float(np.quantile(train_distance, 0.99))
    labels = cluster.predict(scaled_test)
    result["anomaly_exploration"] = {
        "distance_threshold_train_99th_percentile": cutoff,
        "test_flagged_count": int((test_distance > cutoff).sum()),
        "test_flagged_fraction": float((test_distance > cutoff).mean()),
        "test_clusters": [
            {"cluster": i, "count": int((labels == i).sum()),
             "observed_chargeoff_rate": float(test["target"].to_numpy()[labels == i].mean())}
            for i in range(cluster.n_clusters) if (labels == i).any()
        ],
    }
    return result


def run(path: Path) -> dict:
    data, counts = load_cohort(path)
    return {
        "cohort": summary(data),
        "row_counts": counts,
        "scenarios": {name: run_scenario(data, windows) for name, windows in SPLITS.items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path, help="Local accepted-loan CSV or CSV.gz")
    parser.add_argument("--output", type=Path, required=True, help="Output aggregate JSON in an ignored directory")
    args = parser.parse_args()
    result = run(args.dataset)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
