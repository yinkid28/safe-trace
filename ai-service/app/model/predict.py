"""Prediction and explanation module for SafeTrace.

Loads a trained Isolation Forest, scores new GPS trajectories,
and generates human-readable explanations.
"""

from pathlib import Path

import joblib
import numpy as np

from app.model.features import (
    FEATURE_NAMES,
    extract_features,
    features_to_array,
)
from app.schemas import GPSPoint, PredictResponse, SafeZone

DEFAULT_THRESHOLD = 0.55


def load_model(model_path: Path | str) -> dict:
    """Load a trained model bundle from disk.

    Returns:
        Dict with 'model' (IsolationForest) and 'feature_names' (list[str]).
    """
    return joblib.load(model_path)


def score_sample(
    model,
    features: dict[str, float],
) -> float:
    """Compute risk score in [0, 1] from extracted features.

    Isolation Forest score_samples() returns roughly [-1, 0] where
    lower = more anomalous. We negate and clip to [0, 1].
    """
    arr = features_to_array(features).reshape(1, -1)
    raw = model.score_samples(arr)[0]
    risk = float(np.clip(-raw, 0, 1))
    return round(risk, 4)


def generate_explanations(
    features: dict[str, float],
    risk_score: float,
) -> list[str]:
    """Generate human-readable explanations based on feature thresholds.

    Rule-based: each rule maps directly to a safety concept.
    Only triggers if risk is above a baseline.
    """
    explanations: list[str] = []

    if risk_score < 0.3:
        explanations.append("Movement appears normal")
        return explanations

    if features["max_speed"] > 60:
        explanations.append(
            f"Very high speed detected ({features['max_speed']:.1f} km/h) "
            "— possible vehicle movement"
        )
    elif features["max_speed"] > 30:
        explanations.append(
            f"Elevated speed ({features['max_speed']:.1f} km/h) "
            "— faster than walking"
        )

    if features["speed_std"] > 15:
        explanations.append(
            "Erratic speed changes — possible struggle or forced movement"
        )

    if features["max_acceleration"] > 5:
        explanations.append(
            "Sudden acceleration/braking detected"
        )

    if features["max_bearing_change"] > 120:
        explanations.append(
            "Sharp direction changes — possible evasive driving"
        )
    elif features["mean_bearing_change"] > 60:
        explanations.append(
            "Frequent direction changes — erratic path"
        )

    if features["distance_ratio"] < 0.3 and features["total_distance"] > 0.5:
        explanations.append(
            "Circling pattern detected (moving far but staying in same area)"
        )

    if features["max_safe_zone_dist"] > 5:
        explanations.append(
            f"Far from known safe zones "
            f"(up to {features['max_safe_zone_dist']:.1f} km away)"
        )

    if features["is_night"] == 1.0:
        explanations.append(
            "Movement during high-risk hours (10pm-5am)"
        )

    if features["stopped_fraction"] > 0.5 and features["total_distance"] > 0.2:
        explanations.append(
            "Prolonged stop after significant movement — possible forced stop"
        )

    if not explanations:
        explanations.append(
            "Combination of features is unusual compared to normal patterns"
        )

    return explanations


def predict(
    model_bundle: dict,
    points: list[GPSPoint],
    safe_zones: list[SafeZone] | None = None,
    threshold: float = DEFAULT_THRESHOLD,
) -> PredictResponse:
    """Full prediction pipeline: extract features, score, explain.

    Args:
        model_bundle: Output of load_model().
        points: GPS trajectory (>= 2 points).
        safe_zones: User's known safe locations.
        threshold: Risk score above which is_anomaly=True.

    Returns:
        PredictResponse with risk_score, is_anomaly, explanations, features.
    """
    features = extract_features(points, safe_zones)
    risk = score_sample(model_bundle["model"], features)
    explanations = generate_explanations(features, risk)

    return PredictResponse(
        risk_score=risk,
        is_anomaly=risk >= threshold,
        threshold=threshold,
        explanations=explanations,
        features=features,
    )
