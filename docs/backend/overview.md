# Backend — Current State

Location: [`requirements.txt`](../../requirements.txt), Python virtual environment at `.venv/`

## What exists today

Only the Python dependency list and virtual environment are set up. There is no application code yet:

- No FastAPI app, no `/predict-risk` or `/verify-applicant` endpoints.
- No trained XGBoost or scikit-learn model artifacts.
- No database models or migrations.

## Installed dependencies

```
fastapi
uvicorn[standard]
xgboost
scikit-learn
pandas
numpy
joblib
```

## Binding requirements for when this is built

From `AGENTS.md` and `.github/copilot-instructions.md` — do not implement a design that conflicts with these:

- `/predict-risk` must return a risk score in the inclusive range `0.0`–`1.0` and a status, responding in under 2 seconds.
- No MyKad numbers or other raw PII may be stored or logged; identity is the connected wallet address only.
- The API must validate request/response data and handle inference failures explicitly — a model score alone must not auto-approve a loan; documented business rules must also be applied.
- Model training and inference should be decoupled enough that the API can start and respond predictably even if training data is temporarily unavailable.

## How this connects to the smart contract

Per the contract's design (see [`../contracts/P2PLendingEscrow.md`](../contracts/P2PLendingEscrow.md)), the risk score produced here is not submitted by the borrower. It must be submitted on-chain by an account holding `RISK_ORACLE_ROLE` via `submitRiskAssessment(loanId, riskScore, riskHash)`, where `riskHash` is a cryptographic commitment to the off-chain assessment payload (never the raw payload itself). Whatever service ends up calling `submitRiskAssessment` needs to hold that role's private key, so its security should be treated with the same care as the contract's other privileged roles.
