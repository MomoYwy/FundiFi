# Lending Club offline credit-risk research

This experiment is independent of `/predict-risk` and does not produce an API model.
Default and charge-off are not fraud labels. K-Means distances are exploratory
signals, not a basis for blocking applicants.

## Data and access

The approved source is Kaggle's
[`wordsforthewise/lending-club`](https://www.kaggle.com/datasets/wordsforthewise/lending-club),
version 3, accepted loans (`accepted_2007_to_2018Q4.csv.gz`). Kaggle lists
CC0; the uploader warns about LendingClub's original terms, and the original
download link now redirects. Those underlying terms have not been independently
verified; review them before redistribution or other uses.
The downloaded file's SHA-256 is
`55c16f75120f897683f02e7aabcf080d0e4a20c4832feb1d592cfa941bd62a2d`.

Store raw data and derived artifacts in the ignored `data/` and
`research-artifacts/` directories, not Git. Do not copy credentials or raw
records into logs, reports, or on-chain data.

## Cohort and leakage controls

- The source contains 2,260,701 rows and 151 columns, with issuance dates from
  June 2007 to December 2018 and 33 missing issue dates.
- Across the full file, 150 columns contain at least one missing value and 44
  are over 50% missing. Per-column missing fractions are available in the local
  `research-artifacts/lending-club/schema-missingness.json` inspection output.
- Include only 36-month loans issued through December 2015. Windows described
  below use scheduled-maturity gaps between training and calibration, and
  between threshold selection and test. The latest test loan would have
  matured by December 2018, the last issuance month in the dataset. These gaps
  are only a proxy: the snapshot date and actual label-availability dates are
  unknown, and outcomes could become known after maturity. They do not prove
  a leakage-free historical simulation or establish a fixed default horizon.
- Compare `Charged Off` (1) with `Fully Paid` (0). Exclude other statuses,
  including current, late and policy-exception records. Outcomes and their
  timing are not independently validated; excluding unresolved loans and
  rejected applications creates selection bias.
- Use only the explicit feature allowlist in the script: `loan_amnt`,
  `annual_inc`, `dti`, `delinq_2yrs`, `inq_last_6mths`, `open_acc`,
  `revol_util`, `total_acc`, `term`, `emp_length`, `home_ownership` and
  `purpose`. They are intended to be available around origination; their
  exact timing and provenance have not been independently verified. `term` is
  constant within this experiment because only 36-month loans are retained.
- Exclude all fields outside that allowlist. In particular, do not use
  `loan_status` as a feature, nor `total_pymnt`, `out_prncp`, `recoveries`,
  `last_pymnt_d`, `last_pymnt_amnt`, `last_fico_range_low`, `hardship_*`
  or `settlement_*`. IDs, free text, geography and lender-assigned `grade`,
  `int_rate` and `installment` are also excluded. `issue_d` is used only
  for splitting.
- `loan_amnt` is a USD loan amount, not an RM-equivalent input. The current
  90-day borrowing frequency and share of repayments on time or early have
  no verified mapping. The API's history fields are currently self-reported.
  Do not substitute inquiry counts or unrelated repayment proxies.

The model is not validated for Malaysian borrowers, microloans, rejected
applicants, or FundiFi's data collection. Sensitive inputs such as income and
employment require privacy and fairness review before any future integration.

## Run and interpret

Install the project's Python dependencies, then run from the repository root:

```powershell
.\.venv\Scripts\python.exe backend\research\lending_club_baseline.py data\lending-club\accepted_2007_to_2018Q4.csv.gz --output research-artifacts\lending-club\calibration-diagnostics.json
```

The two fixed windows below use the same test cohort. Each model and its
preprocessing are fitted on training data only. Sigmoid calibration is fitted
on the calibration cohort's model scores and labels, then a separate later
threshold cohort selects the F1-maximizing threshold. Neither uses test labels.
Uncalibrated models select their threshold from the same threshold cohort.
The threshold is a research convention, not an operational approval policy.
The prevalence baseline predicts the training positive rate for everyone
and classifies everyone as non-charge-off at threshold 0.5.

The JSON reports test precision, recall, average precision (PR-AUC), ROC-AUC,
Brier score and calibration bins. It includes both calibrated and uncalibrated
results so calibration is not mistaken for improved discrimination.

K-Means fits scaled numeric training features independently; its 99th-percentile
training distance is an exploratory cutoff. Test cluster charge-off rates are
descriptive associations, not fraud detection performance. Models are not
exported. Because borrower grouping is not established, repeated borrowers
could span splits; the temporal split alone does not remove that risk.

## Cohort and embargo sensitivity

The local run used Python 3.12.4, pandas 3.1.1, NumPy 2.5.5,
scikit-learn 1.9.1 and XGBoost 3.4.1. In the original experiment the
training window included only June-December 2007: all 603 records had a
36-month term, but 352 were excluded for policy-exception statuses. Of the
remaining 251, 206 were fully paid and 45 charged off. Therefore the term
filter did not cause the 251-row count. Across the whole file, 2010 is the
first issuance year with 60-month loans in this inspection.

The original experiment used all of 2011 for validation and all of 2015 for
testing. Here, we split the validation year into calibration and threshold
halves and use only July-December 2015 as a **common test cohort** for a fair
comparison. This differs from the original full-2015 results.

| Scenario | Role | Issue months | Loans | Charged off |
| --- | --- | --- | ---: | ---: |
| Original windows | Train | Jun-Dec 2007 | 251 | 17.93% |
| Original windows | Calibration | Jan-Jun 2011 | 5,780 | 9.88% |
| Original windows | Threshold | Jul-Dec 2011 | 8,321 | 11.15% |
| Expanded windows | Train | Jun 2007-Jun 2008 | 1,124 | 16.46% |
| Expanded windows | Calibration | Jul-Dec 2011 | 8,321 | 11.15% |
| Expanded windows | Threshold | Jan-Jun 2012 | 14,967 | 13.78% |
| Both | Test | Jul-Dec 2015 | 162,236 | 14.71% |

The expanded training cohort has 185 charge-offs, still a small and old
sample. The 36-month gap is a scheduled-maturity proxy, not verified label
availability. The model was calibrated before threshold selection, but those
two validation subsets are adjacent: their labels need only be available before
the test period for this offline analysis, which is not independently proven.
Policy-exception and unresolved outcomes, rejected applications and all
60-month loans are excluded; their omission introduces selection bias.

## Test results

The same held-out test set was used for both scenarios. AP is average precision
(PR-AUC); the no-skill AP is the test prevalence, 0.1471. Precision and recall
are zero for the majority classifier because it predicts no positive cases.

| Training window | Model | Threshold | Precision | Recall | AP | ROC-AUC | Brier |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original | Majority/prevalence | 0.5 | 0 | 0 | 0.1471 | 0.5000 | 0.1265 |
| Original | Logistic, uncalibrated | 0.1483 | 0.1674 | 0.6415 | 0.1774 | 0.5658 | 0.1534 |
| Original | Logistic, sigmoid | 0.0974 | 0.1674 | 0.6415 | 0.1774 | 0.5658 | 0.1264 |
| Original | XGBoost, uncalibrated | 0.0186 | 0.1483 | 0.8060 | 0.1517 | 0.5068 | 0.1703 |
| Original | XGBoost, sigmoid | 0.0833 | 0.1483 | 0.8060 | 0.1517 | 0.5068 | 0.1277 |
| Expanded | Majority/prevalence | 0.5 | 0 | 0 | 0.1471 | 0.5000 | 0.1258 |
| Expanded | Logistic, uncalibrated | 0.1546 | 0.1626 | 0.6940 | 0.1734 | 0.5565 | 0.1412 |
| Expanded | Logistic, sigmoid | 0.1091 | 0.1626 | 0.6940 | 0.1734 | 0.5565 | 0.1255 |
| Expanded | XGBoost, uncalibrated | 0.0420 | 0.1521 | 0.9172 | 0.1653 | 0.5471 | 0.1603 |
| Expanded | XGBoost, sigmoid | 0.0968 | 0.1521 | 0.9172 | 0.1653 | 0.5471 | 0.1259 |

The sigmoid fits improved test Brier scores relative to the uncalibrated
models, but are close to the prevalence baseline. For example, expanded
logistic's calibrated 0.1-0.2 bin averaged 0.130 versus an observed 0.156
(121,765 loans). Full bins are in the aggregate JSON. These sigmoid mappings
preserved ranking here, so AP and ROC-AUC are unchanged; F1 threshold selection
also selected the same cases in these runs.

K-Means remains independent and exploratory. It flagged 8,132 test loans
(5.01%) with original windows and 3,827 (2.36%) with expanded windows.
These are distance flags, not fraud detections.

These are research comparisons, not evidence of suitability for FundiFi.
The historical US population, tiny training cohort, changed prevalence,
unverified feature timing and labels, unknown snapshot date and possible
repeat borrowers limit interpretation. Calibration here is not transferable
to Malaysian borrowers or the API's self-reported features.
