# SafeTrace

AI-powered personal safety system that learns a user's normal movement patterns and flags anomalies in real time. Built for the Lagos context — where personal security is a daily concern — SafeTrace detects situations like possible abductions, forced movement, or travel into unfamiliar areas.

## Core Idea

A user's phone continuously records GPS location. SafeTrace learns what "normal" looks like for that user (commute routes, usual hours, familiar areas) and raises an alert when movement deviates significantly from the pattern.

## Architecture

```
safe-trace/
├── ai-service/       # Python FastAPI + scikit-learn anomaly detection
├── (backend/)        # Node.js/Express API (future)
├── (mobile/)         # React Native app (future)
└── (dashboard/)      # Web dashboard (future)
```

Phase 1 (current) focuses on the AI service — the project's core differentiator — which can be developed and tested independently.

## AI Service — How It Works

### Feature Extraction

18 features are extracted from each GPS trajectory, each with a clear safety rationale:

| Feature | Why It Detects Danger |
|---------|----------------------|
| `mean_speed`, `max_speed`, `speed_std` | High speed = in a vehicle (possible abduction). Erratic speed = struggle. |
| `mean_acceleration`, `max_acceleration` | Sudden braking/acceleration = vehicle event |
| `mean_bearing_change`, `max_bearing_change` | Erratic direction = evasion or being driven around |
| `total_distance`, `displacement`, `distance_ratio` | High distance + low displacement = circling (suspicious) |
| `min/mean/max_safe_zone_dist` | Far from known safe zones = unfamiliar territory |
| `hour_sin`, `hour_cos` | Cyclical time encoding (23:00 and 01:00 are close, not 22 apart) |
| `is_night` | Binary flag for 22:00–05:00 (inherently higher risk in Lagos) |
| `duration_minutes` | Context for other features |
| `stopped_fraction` | High stop fraction after movement = possible forced stop |

### Model

**Isolation Forest** (semi-supervised) — trained on normal movement data only. Anomalies are detected as deviations from learned normal patterns.

```python
IsolationForest(
    n_estimators=150,      # Stable scores
    contamination=0.05,    # ~5% noise tolerance in training data
    max_features=1.0,      # All 18 features per tree
    random_state=42,       # Reproducible
    n_jobs=-1              # Use all CPU cores
)
```

**Score normalization:** Isolation Forest `score_samples()` returns roughly [-1, 0] where lower = more abnormal. We negate and clip: `risk = clip(-score, 0, 1)`.

**Explanations:** Rule-based on feature thresholds (not SHAP/LIME). Each rule maps directly to a safety concept — easy to understand and defend.

### Simulated Training Data

- Centred on real Yaba/Lagos coordinates (Yabatech campus, Sabo, Tejuosho Market, UNILAG, Jibowu)
- **Normal:** commute patterns at walking/bus speeds during expected hours
- **Abnormal** (5 scenarios): speed spikes, route deviation, unusual hours, unfamiliar areas, sudden stops
- ~200 normal + ~50 abnormal samples
- GPS noise (5–20m jitter) for realism

### API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/predict` | POST | Score a movement sample, return risk 0–1 with explanations |
| `/api/v1/health` | GET | Health check + model status |

## Tech Stack

| Component | Technology |
|-----------|------------|
| AI Service | Python, FastAPI, scikit-learn, NumPy |
| Model serialization | joblib |
| Testing | pytest, httpx |

## Running the AI Service

```bash
cd safe-trace/ai-service
pip install -r requirements.txt
python -m app.model.train          # generates trained_model.joblib
python -m pytest tests/ -v         # 50 tests
uvicorn app.main:app --port 8000   # start server
```

Swagger UI at http://localhost:8000/docs

## Current Status

- **Phase 1 (AI Service):** Complete — model trained, 50 tests passing, API functional
- **Phase 2 (Backend + Mobile):** Not started
