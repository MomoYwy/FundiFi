# Backend — AI Risk Scoring API

Location: [`backend/`](../../backend/), dependencies in [`requirements.txt`](../../requirements.txt), virtual environment at `.venv/`.

## Files

| File                                                     | Purpose                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`backend/train_model.py`](../../backend/train_model.py) | Generates synthetic borrower data, trains the XGBoost classifier and K-Means model, writes `.pkl` artifacts. |
| [`backend/main.py`](../../backend/main.py)               | FastAPI app exposing `POST /predict-risk` and `GET /health`.                                                 |
| `backend/models/risk_model.pkl`                          | Trained `XGBClassifier` (generated).                                                                         |
| `backend/models/kmeans_model.pkl`                        | Dict with the K-Means model, scaler, suspicious cluster ids and distance threshold (generated).              |

To train on a Kaggle dataset, see [`kaggle-training.md`](./kaggle-training.md).

## Run

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
cd backend
python train_model.py
uvicorn main:app --reload
```

Interactive API docs: `http://127.0.0.1:8000/docs`.

## Training (`train_model.py`)

Features (in this order): `requested_amount` (RM), `borrow_frequency` (loans in the last 90 days), `repayment_velocity` (0–1, share of repayments made on time).

1. `make_data` creates 5,000 synthetic borrowers. A default label is drawn from a logistic function that rises with amount and borrowing frequency and falls with repayment velocity.
2. An `XGBClassifier` is trained on an 80/20 stratified split. The hold-out ROC-AUC is printed.
3. `make_bust_out` adds 150 escalation-pattern rows (large amounts, 10–20 loans, repayment velocity under 0.2). A `StandardScaler` and 4-cluster `KMeans` are fitted on normal plus escalation rows.
4. A cluster is suspicious if its centre has `borrow_frequency >= 8` and `repayment_velocity <= 0.3`. The distance threshold is the 99th percentile of distance to the nearest centroid over the normal rows.
5. Artifacts are saved with `joblib` to `backend/models/`.

The data is synthetic, so printed metrics describe the generator, not real-world credit risk.

## API (`main.py`)

### `POST /predict-risk`

Request:

```json
{
  "wallet_address": "0x<40 hex characters>",
  "requested_amount": 1000,
  "borrow_frequency": 1,
  "repayment_velocity": 0.9
}
```

Validation: wallet must match `^0x[a-fA-F0-9]{40}$`; amount must be RM 500–15,000 (Tier 1 and Tier 2 caps); frequency 0–1000; velocity 0.0–1.0. Invalid input returns 422.

Response:

```json
{ "risk_score": 0.0013, "approved": true, "risk_category": "LOW" }
```

Logic:

1. XGBoost `predict_proba` gives the default probability as `risk_score`.
2. K-Means flags bust-out behaviour if the request falls in a suspicious cluster or is farther than the distance threshold from every centroid. A flag raises the score to at least 0.9.
3. Category: `LOW` below 0.33, `MEDIUM` below 0.66, otherwise `HIGH`.
4. `approved` is true only if the category is not `HIGH` and no bust-out flag was raised.

Errors: 503 if models are not loaded (run training first), 500 on inference failure. The wallet address is validated but not used as a model feature and is not logged.

### `GET /health`

Returns `{"status": "ok", "models_loaded": bool}`.

CORS allows `http://localhost:3000` and `http://localhost:5173`.

## Constraints from project rules

From `AGENTS.md` and `.github/copilot-instructions.md`:

- Score range 0.0–1.0 with a response time target under 2 seconds (not yet benchmarked).
- No MyKad or other PII is accepted or stored; identity is the wallet address.
- A score alone does not approve a loan; the tier-cap and bust-out rules also apply.
- The API starts without models and returns 503 instead of fabricating scores.

## How this connects to the smart contract

Per the contract's design (see [`../contracts/P2PLendingEscrow.md`](../contracts/P2PLendingEscrow.md)), the risk score produced here is not submitted by the borrower. It must be submitted on-chain by an account holding `RISK_ORACLE_ROLE` via `submitRiskAssessment(loanId, riskScore, riskHash)`, where `riskHash` is a cryptographic commitment to the off-chain assessment payload (never the raw payload itself). Whatever service ends up calling `submitRiskAssessment` needs to hold that role's private key, so its security should be treated with the same care as the contract's other privileged roles.
