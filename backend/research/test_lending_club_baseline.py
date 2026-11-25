import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from backend.research import lending_club_baseline as research


class LendingClubResearchTests(unittest.TestCase):
    def test_cohort_excludes_recent_and_unresolved_loans(self):
        rows = []
        for date, status in [
            ("Jun-2007", "Fully Paid"),
            ("Jul-2007", "Charged Off"),
            ("Aug-2007", "Current"),
            ("Jan-2016", "Fully Paid"),
            ("Jan-2008", "Fully Paid"),
            ("Jan-2009", "Fully Paid"),
        ]:
            row = {name: 1 for name in research.NUMERIC}
            row.update({name: "value" for name in research.CATEGORICAL})
            row["term"] = " 60 months" if date == "Jan-2009" else " 36 months"
            row.update(issue_d=date, loan_status=status, total_pymnt=1234)
            rows.append(row)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "loans.csv"
            pd.DataFrame(rows).to_csv(path, index=False)
            cohort, counts = research.load_cohort(path)
        self.assertEqual(cohort["target"].tolist(), [0, 1, 0])
        self.assertEqual(counts["after_cutoff"], 1)
        self.assertEqual(counts["excluded_status"], 1)
        self.assertEqual(counts["excluded_term"], 1)
        self.assertNotIn("total_pymnt", cohort.columns)

    def test_split_keeps_months_separate(self):
        dates = pd.to_datetime(["2008-06-01", "2011-07-01", "2012-06-01", "2015-07-01"])
        frame = pd.DataFrame([{"issue_d": date, "target": label} for date in dates for label in (0, 1)])
        splits = research.chronological_split(frame, research.SPLITS["expanded_windows"])
        self.assertGreater(splits["calibration"]["issue_d"].min(), splits["train"]["issue_d"].max() + pd.DateOffset(months=36))
        self.assertGreater(splits["test"]["issue_d"].min(), splits["threshold"]["issue_d"].max() + pd.DateOffset(months=36))

    def test_split_rejects_overlapping_calibration_and_threshold(self):
        windows = dict(research.SPLITS["expanded_windows"])
        windows["threshold"] = windows["calibration"]
        dates = pd.to_datetime(["2008-06-01", "2011-07-01", "2015-07-01"])
        frame = pd.DataFrame([{"issue_d": date, "target": label} for date in dates for label in (0, 1)])
        with self.assertRaisesRegex(ValueError, "must not overlap"):
            research.chronological_split(frame, windows)

    def test_evaluation_uses_supplied_threshold_and_reports_calibration(self):
        y = pd.Series([0, 1, 1])
        result = research.evaluate(y, np.array([0.1, 0.4, 0.8]), 0.5)
        self.assertEqual(result["precision"], 1.0)
        self.assertEqual(result["recall"], 0.5)
        self.assertEqual(result["roc_auc"], 1.0)
        self.assertEqual(sum(bucket["count"] for bucket in result["calibration_bins"]), 3)

    def test_sigmoid_input_handles_extreme_probabilities(self):
        self.assertTrue(np.isfinite(research.sigmoid_input(np.array([0.0, 1.0]))).all())

    def test_sigmoid_fit_depends_only_on_calibration_data(self):
        calibration = np.array([0.05, 0.1, 0.2, 0.8, 0.9, 0.95])
        target = pd.Series([0, 0, 0, 1, 1, 1])
        threshold = np.array([0.15, 0.6])
        test = np.array([0.1, 0.9])
        first_threshold, first_test = research.calibrate_sigmoid(calibration, target, threshold, test)
        second_threshold, second_test = research.calibrate_sigmoid(
            calibration, target, np.array([0.15, 0.6, 0.99]), np.array([0.1, 0.9, 0.99])
        )
        np.testing.assert_allclose(first_threshold, second_threshold[:2])
        np.testing.assert_allclose(first_test, second_test[:2])
        self.assertTrue(np.all((first_test > 0) & (first_test < 1)))

    def test_threshold_uses_validation_f1(self):
        y = pd.Series([0, 1, 1])
        self.assertAlmostEqual(research.choose_threshold(y, np.array([0.1, 0.4, 0.8])), 0.4)


if __name__ == "__main__":
    unittest.main()
