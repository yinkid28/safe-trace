"""SafeTrace AI Service — FastAPI application.

Endpoints:
    POST /api/v1/predict             — Score a GPS trajectory for anomalies.
    POST /api/v1/hardware/location   — Receive a GPS ping from a hardware tracker.
    POST /api/v1/notify              — Send push notifications for alerts.
    GET  /api/v1/health              — Health check + model status.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.model.features import FEATURE_NAMES
from app.model.predict import DEFAULT_THRESHOLD, load_model, predict
from app.model.train import MODEL_PATH
from app.schemas import HealthResponse, PredictRequest, PredictResponse
from app.routes.hardware import router as hardware_router
from app.routes.notifications import router as notifications_router

_model_bundle: dict | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the trained model and initialize Firebase on startup."""
    global _model_bundle
    if MODEL_PATH.exists():
        _model_bundle = load_model(MODEL_PATH)

    # Firebase is needed for the hardware endpoint but optional —
    # the predict endpoint should still work without it.
    try:
        from app.firebase import init_firebase
        init_firebase()
    except Exception as exc:
        logging.warning("Firebase init failed (hardware endpoint disabled): %s", exc)

    yield
    _model_bundle = None


app = FastAPI(
    title="SafeTrace AI Service",
    description="Anomaly detection for personal safety based on GPS movement patterns",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hardware_router)
app.include_router(notifications_router)


@app.get("/api/v1/health", response_model=HealthResponse)
async def health():
    """Health check — reports whether the model is loaded."""
    return HealthResponse(
        status="ok" if _model_bundle is not None else "no_model",
        model_loaded=_model_bundle is not None,
        feature_count=len(FEATURE_NAMES),
    )


@app.post("/api/v1/predict", response_model=PredictResponse)
async def predict_endpoint(request: PredictRequest):
    """Score a GPS trajectory and return risk assessment."""
    if _model_bundle is None:
        raise RuntimeError(
            "Model not loaded. Train the model first: python -m app.model.train"
        )

    return predict(
        model_bundle=_model_bundle,
        points=request.points,
        safe_zones=request.safe_zones or None,
        threshold=DEFAULT_THRESHOLD,
    )
