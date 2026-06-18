"""Tests for prediction and explanation module."""

import tempfile
from pathlib import Path

import pytest

from app.model.features import FEATURE_NAMES
from app.model.predict import (
    generate_explanations,
    load_model,
    predict,
    score_sample,
)
from app.model.train import train


@pytest.fixture(scope="module")
def trained_model_bundle():
    """Train a small model once for all tests in this module."""
    with tempfile.TemporaryDirectory() as tmpdir:
        model_path = Path(tmpdir) / "test_model.joblib"
        train(n_normal=50, n_abnormal=15, seed=42, model_path=model_path)
        bundle = load_model(model_path)
        yield bundle


class TestScoreSample:
    def test_risk_score_in_range(self, trained_model_bundle, normal_trajectory, safe_zones):
        from app.model.features import extract_features

        features = extract_features(normal_trajectory, safe_zones)
        risk = score_sample(trained_model_bundle["model"], features)
        assert 0.0 <= risk <= 1.0

    def test_abnormal_scores_higher(
        self, trained_model_bundle, normal_trajectory, abnormal_trajectory, safe_zones
    ):
        from app.model.features import extract_features

        normal_feats = extract_features(normal_trajectory, safe_zones)
        abnormal_feats = extract_features(abnormal_trajectory, safe_zones)

        normal_risk = score_sample(trained_model_bundle["model"], normal_feats)
        abnormal_risk = score_sample(trained_model_bundle["model"], abnormal_feats)

        # Abnormal should generally score higher (more risky)
        # This isn't guaranteed for every sample, but with our synthetic data it should hold
        assert abnormal_risk > normal_risk


class TestGenerateExplanations:
    def test_low_risk_returns_normal(self):
        features = {name: 0.0 for name in FEATURE_NAMES}
        explanations = generate_explanations(features, 0.1)
        assert len(explanations) == 1
        assert "normal" in explanations[0].lower()

    def test_high_speed_triggers_explanation(self):
        features = {name: 0.0 for name in FEATURE_NAMES}
        features["max_speed"] = 80.0
        explanations = generate_explanations(features, 0.7)
        assert any("speed" in e.lower() for e in explanations)

    def test_night_triggers_explanation(self):
        features = {name: 0.0 for name in FEATURE_NAMES}
        features["is_night"] = 1.0
        explanations = generate_explanations(features, 0.6)
        assert any("hour" in e.lower() or "night" in e.lower() for e in explanations)

    def test_far_from_safe_zones(self):
        features = {name: 0.0 for name in FEATURE_NAMES}
        features["max_safe_zone_dist"] = 10.0
        explanations = generate_explanations(features, 0.6)
        assert any("safe zone" in e.lower() for e in explanations)


class TestPredict:
    def test_returns_predict_response(
        self, trained_model_bundle, normal_trajectory, safe_zones
    ):
        response = predict(trained_model_bundle, normal_trajectory, safe_zones)
        assert 0.0 <= response.risk_score <= 1.0
        assert isinstance(response.is_anomaly, bool)
        assert isinstance(response.explanations, list)
        assert len(response.explanations) >= 1

    def test_response_has_all_features(
        self, trained_model_bundle, normal_trajectory, safe_zones
    ):
        response = predict(trained_model_bundle, normal_trajectory, safe_zones)
        assert set(response.features.keys()) == set(FEATURE_NAMES)

    def test_is_anomaly_matches_threshold(
        self, trained_model_bundle, normal_trajectory, safe_zones
    ):
        response = predict(
            trained_model_bundle, normal_trajectory, safe_zones, threshold=0.0
        )
        # With threshold 0, everything is an anomaly
        assert response.is_anomaly is True

        response = predict(
            trained_model_bundle, normal_trajectory, safe_zones, threshold=1.1
        )
        # With threshold above max, nothing is an anomaly
        assert response.is_anomaly is False
