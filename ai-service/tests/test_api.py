"""Tests for FastAPI endpoints."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.model.train import train


@pytest.fixture(scope="module")
def model_path():
    """Train a model into a temp dir for API tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "test_model.joblib"
        train(n_normal=30, n_abnormal=10, seed=42, model_path=path)
        yield path


@pytest.fixture
def client(model_path):
    """Create a TestClient with the model loaded."""
    with patch("app.main.MODEL_PATH", model_path):
        # Re-import to pick up the patched path via lifespan
        from app.main import app

        with TestClient(app) as c:
            yield c


@pytest.fixture
def client_no_model():
    """Create a TestClient without a trained model."""
    fake_path = Path("/nonexistent/model.joblib")
    with patch("app.main.MODEL_PATH", fake_path):
        from app.main import app

        with TestClient(app) as c:
            yield c


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        response = client.get("/api/v1/health")
        assert response.status_code == 200

    def test_health_model_loaded(self, client):
        data = client.get("/api/v1/health").json()
        assert data["status"] == "ok"
        assert data["model_loaded"] is True
        assert data["feature_count"] == 18

    def test_health_no_model(self, client_no_model):
        data = client_no_model.get("/api/v1/health").json()
        assert data["status"] == "no_model"
        assert data["model_loaded"] is False


class TestPredictEndpoint:
    def test_predict_returns_200(self, client):
        payload = {
            "points": [
                {"latitude": 6.5158, "longitude": 3.3775, "timestamp": 1700000000},
                {"latitude": 6.5168, "longitude": 3.3775, "timestamp": 1700000060},
                {"latitude": 6.5178, "longitude": 3.3775, "timestamp": 1700000120},
            ]
        }
        response = client.post("/api/v1/predict", json=payload)
        assert response.status_code == 200

    def test_predict_response_schema(self, client):
        payload = {
            "points": [
                {"latitude": 6.5158, "longitude": 3.3775, "timestamp": 1700000000},
                {"latitude": 6.5168, "longitude": 3.3775, "timestamp": 1700000060},
                {"latitude": 6.5178, "longitude": 3.3775, "timestamp": 1700000120},
            ]
        }
        data = client.post("/api/v1/predict", json=payload).json()
        assert "risk_score" in data
        assert "is_anomaly" in data
        assert "threshold" in data
        assert "explanations" in data
        assert "features" in data
        assert 0.0 <= data["risk_score"] <= 1.0
        assert len(data["features"]) == 18

    def test_predict_with_safe_zones(self, client):
        payload = {
            "points": [
                {"latitude": 6.5158, "longitude": 3.3775, "timestamp": 1700000000},
                {"latitude": 6.5168, "longitude": 3.3775, "timestamp": 1700000060},
            ],
            "safe_zones": [
                {"latitude": 6.5158, "longitude": 3.3775, "label": "Home"},
            ],
        }
        data = client.post("/api/v1/predict", json=payload).json()
        assert data["features"]["min_safe_zone_dist"] < 0.5  # Very close to safe zone

    def test_predict_invalid_input_returns_422(self, client):
        # Only 1 point (minimum is 2)
        payload = {
            "points": [
                {"latitude": 6.5158, "longitude": 3.3775, "timestamp": 1700000000},
            ]
        }
        response = client.post("/api/v1/predict", json=payload)
        assert response.status_code == 422

    def test_predict_empty_points_returns_422(self, client):
        payload = {"points": []}
        response = client.post("/api/v1/predict", json=payload)
        assert response.status_code == 422

    def test_predict_invalid_latitude_returns_422(self, client):
        payload = {
            "points": [
                {"latitude": 100.0, "longitude": 3.3775, "timestamp": 1700000000},
                {"latitude": 6.5168, "longitude": 3.3775, "timestamp": 1700000060},
            ]
        }
        response = client.post("/api/v1/predict", json=payload)
        assert response.status_code == 422
