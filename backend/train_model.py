"""Train the risk classifier and bust-out anomaly model on synthetic data.

Features: requested_amount (RM), borrow_frequency (loans in last 90 days),
repayment_velocity (0-1 share of repayments made on time / ahead of schedule).
The data is synthetic; replace with a real benchmark dataset before drawing conclusions.
"""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

SEED = 42
N_SAMPLES = 5000
FEATURES = ["requested_amount", "borrow_frequency", "repayment_velocity"]
MODEL_DIR = Path(__file__).resolve().parent / "models"


def make_data(n: int, rng: np.random.Generator) -> pd.DataFrame:
    amount = rng.uniform(500, 15000, n)
    frequency = rng.poisson(2, n).clip(0, 20)
    velocity = rng.beta(5, 2, n)

    # Latent default probability: large amounts, frequent borrowing and slow repayment raise risk.
    logit = (
        -1.0
        + 1.5 * (amount / 15000)
        + 0.25 * frequency
        - 4.0 * velocity
        + rng.normal(0, 0.5, n)
    )
    default = rng.random(n) < 1 / (1 + np.exp(-logit))
    return pd.DataFrame(
        {
            "requested_amount": amount,
            "borrow_frequency": frequency,
            "repayment_velocity": velocity,
            "default": default.astype(int),
        }
    )


def make_bust_out(n: int, rng: np.random.Generator) -> pd.DataFrame:
    """Rapid escalation: many loans, large amounts, little repayment."""
    return pd.DataFrame(
        {
            "requested_amount": rng.uniform(9000, 15000, n),
            "borrow_frequency": rng.integers(10, 21, n),
            "repayment_velocity": rng.uniform(0.0, 0.2, n),
        }
    )


def main() -> None:
    rng = np.random.default_rng(SEED)
    data = make_data(N_SAMPLES, rng)

    x_train, x_test, y_train, y_test = train_test_split(
        data[FEATURES], data["default"], test_size=0.2, random_state=SEED, stratify=data["default"]
    )

    clf = XGBClassifier(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.1,
        eval_metric="logloss",
        random_state=SEED,
    )
    clf.fit(x_train, y_train)
    auc = roc_auc_score(y_test, clf.predict_proba(x_test)[:, 1])
    print(f"XGBoost hold-out ROC-AUC on synthetic data: {auc:.3f}")

    # K-Means learns normal and escalation behaviour; clusters dominated by escalation are flagged.
    behaviour = pd.concat([data[FEATURES], make_bust_out(150, rng)], ignore_index=True)
    scaler = StandardScaler().fit(behaviour)
    scaled = scaler.transform(behaviour)
    kmeans = KMeans(n_clusters=4, n_init=10, random_state=SEED).fit(scaled)

    labels = kmeans.labels_
    suspicious = []
    for cluster in range(kmeans.n_clusters):
        centre = scaler.inverse_transform(kmeans.cluster_centers_[cluster : cluster + 1])[0]
        if centre[1] >= 8 and centre[2] <= 0.3:
            suspicious.append(cluster)

    distances = np.min(kmeans.transform(scaled), axis=1)
    distance_threshold = float(np.percentile(distances[: len(data)], 99))
    print(f"Suspicious clusters: {suspicious}; distance threshold: {distance_threshold:.3f}")
    print(f"Rows in suspicious clusters: {int(np.isin(labels, suspicious).sum())}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, MODEL_DIR / "risk_model.pkl")
    joblib.dump(
        {
            "model": kmeans,
            "scaler": scaler,
            "suspicious_clusters": suspicious,
            "distance_threshold": distance_threshold,
            "features": FEATURES,
        },
        MODEL_DIR / "kmeans_model.pkl",
    )
    print(f"Saved models to {MODEL_DIR}")


if __name__ == "__main__":
    main()
