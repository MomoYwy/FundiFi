from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_DIR = Path(__file__).resolve().parent / "models"
FEATURES = ["requested_amount", "borrow_frequency", "repayment_velocity"]

MIN_AMOUNT = 500.0
MAX_AMOUNT = 15000.0  # Tier 2 cap
LOW_THRESHOLD = 0.33
HIGH_THRESHOLD = 0.66

models: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        models["risk"] = joblib.load(MODEL_DIR / "risk_model.pkl")
        models["kmeans"] = joblib.load(MODEL_DIR / "kmeans_model.pkl")
    except FileNotFoundError:
        models.clear()  # /predict-risk returns 503 until train_model.py is run
    yield
    models.clear()


app = FastAPI(title="FundiFi AI Risk API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class RiskRequest(BaseModel):
    wallet_address: str = Field(pattern=r"^0x[a-fA-F0-9]{40}$")
    requested_amount: float = Field(ge=MIN_AMOUNT, le=MAX_AMOUNT)
    borrow_frequency: int = Field(ge=0, le=1000)
    repayment_velocity: float = Field(ge=0.0, le=1.0)


class RiskResponse(BaseModel):
    risk_score: float
    approved: bool
    risk_category: Literal["LOW", "MEDIUM", "HIGH"]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "models_loaded": bool(models)}


@app.post("/predict-risk", response_model=RiskResponse)
def predict_risk(req: RiskRequest) -> RiskResponse:
    if not models:
        raise HTTPException(status_code=503, detail="Models not loaded; run train_model.py first.")

    try:
        row = pd.DataFrame([[getattr(req, f) for f in FEATURES]], columns=FEATURES)
        score = float(models["risk"].predict_proba(row)[0, 1])

        km = models["kmeans"]
        scaled = km["scaler"].transform(row)
        cluster = int(km["model"].predict(scaled)[0])
        distance = float(km["model"].transform(scaled).min())
        bust_out = cluster in km["suspicious_clusters"] or distance > km["distance_threshold"]
    except Exception:
        raise HTTPException(status_code=500, detail="Risk inference failed.")

    if bust_out:
        score = max(score, 0.9)
    score = min(max(score, 0.0), 1.0)

    if score < LOW_THRESHOLD:
        category = "LOW"
    elif score < HIGH_THRESHOLD:
        category = "MEDIUM"
    else:
        category = "HIGH"

    return RiskResponse(
        risk_score=round(score, 4),
        approved=category != "HIGH" and not bust_out,
        risk_category=category,
    )
