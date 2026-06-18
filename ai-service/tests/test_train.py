"""Tests for the training pipeline."""

import tempfile
from pathlib import Path

import pytest

from app.model.train import train


class TestTrain:
    def test_training_completes_and_saves_model(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = Path(tmpdir) / "test_model.joblib"
            result = train(
                n_normal=30,
                n_abnormal=10,
                seed=42,
                model_path=model_path,
            )
            assert model_path.exists()
            assert model_path.stat().st_size > 0

    def test_result_has_expected_keys(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = Path(tmpdir) / "test_model.joblib"
            result = train(
                n_normal=30, n_abnormal=10, seed=42, model_path=model_path
            )
            assert "model_path" in result
            assert "n_train" in result
            assert "n_eval" in result
            assert "classification_report" in result

    def test_train_count_matches_normal_only(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = Path(tmpdir) / "test_model.joblib"
            result = train(
                n_normal=30, n_abnormal=10, seed=42, model_path=model_path
            )
            assert result["n_train"] == 30
            assert result["n_eval"] == 40

    def test_precision_recall_above_threshold(self):
        """Model should achieve reasonable performance on synthetic data."""
        with tempfile.TemporaryDirectory() as tmpdir:
            model_path = Path(tmpdir) / "test_model.joblib"
            result = train(
                n_normal=100, n_abnormal=30, seed=42, model_path=model_path
            )
            report = result["classification_report"]
            # Normal class should be well-detected
            assert report["normal"]["precision"] > 0.5
            assert report["normal"]["recall"] > 0.5
            # Anomaly detection should be non-trivial
            assert report["anomaly"]["precision"] > 0.3
            assert report["anomaly"]["recall"] > 0.3
