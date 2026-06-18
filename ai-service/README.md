# SafeTrace AI Service

Anomaly detection for personal safety based on GPS movement patterns. Uses an Isolation Forest trained on normal movement data to flag unusual trajectories.

## Setup

```bash
cd ai-service
pip install -r requirements.txt
```

## Train the model

```bash
python -m app.model.train
```

This generates `trained_model.joblib` in the `ai-service/` directory.

## Run tests

```bash
python -m pytest tests/ -v
```

## Start the server

```bash
uvicorn app.main:app --port 8000
```

API docs available at http://localhost:8000/docs

## API Endpoints

### `GET /api/v1/health`

Returns model status and feature count.

### `POST /api/v1/predict`

Score a GPS trajectory. Request body:

```json
{
  "points": [
    {"latitude": 6.5158, "longitude": 3.3775, "timestamp": 1700000000},
    {"latitude": 6.5168, "longitude": 3.3775, "timestamp": 1700000060}
  ],
  "safe_zones": [
    {"latitude": 6.5158, "longitude": 3.3775, "label": "Home"}
  ]
}
```

Response includes `risk_score` (0-1), `is_anomaly`, `explanations`, and all 18 extracted features.
