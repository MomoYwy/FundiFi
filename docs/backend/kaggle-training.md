# Training the Risk Model with Kaggle

`backend/train_model.py` currently trains on synthetic data only. It does not read any Kaggle dataset. This guide covers two things: running the existing script on Kaggle, and what is needed to train on a real Kaggle dataset.

## Option A: Run the existing script in a Kaggle Notebook

Useful for training on Kaggle's hardware. The output models are equivalent to a local run.

1. Sign in at kaggle.com, then **Create > New Notebook**.
2. In a code cell, write the script to the notebook. Either paste the contents of `backend/train_model.py` into a cell prefixed with `%%writefile train_model.py`, or upload the file via **Add Input > Upload**.
3. Kaggle already includes `xgboost`, `scikit-learn`, `pandas`, `numpy` and `joblib`. Install only if an import fails: `!pip install xgboost joblib`.
4. Run: `!python train_model.py`. Models are written to a `models/` folder next to the script (`/kaggle/working/models/`).
5. Download `risk_model.pkl` and `kmeans_model.pkl` from the notebook's **Output** tab and place them in `backend/models/` locally.

Use the same scikit-learn and xgboost versions locally as on Kaggle (compare with `!pip list | grep -E "scikit-learn|xgboost"`). `.pkl` files can fail or behave differently across versions. Only load `.pkl` files you created yourself, because unpickling untrusted files can execute code.

## Option B: Train on a real Kaggle dataset

### 1. Get a dataset

Choose a credit-risk dataset with a default/fraud label, for example "Give Me Some Credit" or a loan-default dataset. Check its licence and terms before use.

Download with the Kaggle CLI:

```powershell
pip install kaggle
# Create an API token at kaggle.com > Settings > API, save it to %USERPROFILE%\.kaggle\kaggle.json
kaggle datasets download -d <owner>/<dataset-slug> -p data --unzip
```

Keep `data/` and `kaggle.json` out of source control.

### 2. Adapt the script

Changes needed in `train_model.py` (not yet implemented):

- Replace `make_data` with a loader (`pd.read_csv`) that returns a frame with the columns `requested_amount`, `borrow_frequency`, `repayment_velocity` and a binary `default` label.
- Map dataset columns onto these three features. Real datasets rarely have them directly (for example, loan amount maps to `requested_amount`, but repayment velocity may need deriving from payment-history columns). Document each mapping you choose.
- Keep `FEATURES` identical to the API's feature order in `main.py`, or update both.
- Drop any personal identifiers before training; do not keep PII.
- Re-check the K-Means suspicious-cluster rule and thresholds, which were tuned for the synthetic escalation pattern.

### 3. Train and verify

```powershell
cd backend
python train_model.py
```

Check the printed ROC-AUC on the hold-out set, then smoke-test `/predict-risk` with a low-risk and a high-risk request. Do not report model accuracy beyond what the hold-out evaluation shows.

You can run the adapted script locally or in a Kaggle notebook (Option A, adding the dataset via **Add Input > Datasets**, where it appears under `/kaggle/input/<dataset-slug>/`).
