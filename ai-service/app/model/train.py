"""Isolation Forest training pipeline for SafeTrace.

Semi-supervised approach: train on normal data only, evaluate against
both normal and abnormal samples.

Usage:
    python -m app.model.train
"""

import os
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.metrics import classification_report

from app.data.simulate import DEFAULT_SAFE_ZONES, generate_dataset
from app.model.features import FEATURE_NAMES, extract_features, features_to_array

MODEL_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_PATH = MODEL_DIR / "trained_model.joblib"


def build_feature_matrix(
    samples: list,
    safe_zones: list | None = None,
) -> np.ndarray:
    """Convert a list of GPS trajectories into an (n_samples, 18) feature matrix."""
    safe_zones = safe_zones or DEFAULT_SAFE_ZONES
    rows: list[np.ndarray] = []
    for trajectory in samples:
        feats = extract_features(trajectory, safe_zones)
        rows.append(features_to_array(feats))
    return np.array(rows)


def train(
    n_normal: int = 200,
    n_abnormal: int = 50,
    seed: int = 42,
    model_path: Path | str = MODEL_PATH,
) -> dict:
    """Train the Isolation Forest and save it to disk.

    Returns:
        Dict with training metrics (precision, recall, f1 for each class).
    """
    model_path = Path(model_path)

    # Generate data
    samples, labels = generate_dataset(n_normal, n_abnormal, seed)
    labels_arr = np.array(labels)

    # Split: train on normal only, evaluate on everything
    normal_samples = [s for s, lbl in zip(samples, labels) if lbl == 0]
    X_train = build_feature_matrix(normal_samples)

    X_all = build_feature_matrix(samples)

    # Train
    model = IsolationForest(
        n_estimators=150,
        contamination=0.05,
        max_features=1.0,
        random_state=seed,
        n_jobs=-1,
    )
    model.fit(X_train)

    # Evaluate
    raw_preds = model.predict(X_all)  # 1 = inlier, -1 = outlier
    pred_labels = np.where(raw_preds == -1, 1, 0)  # 1 = anomaly

    report = classification_report(
        labels_arr,
        pred_labels,
        target_names=["normal", "anomaly"],
        output_dict=True,
        zero_division=0,
    )

    # Save model
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {"model": model, "feature_names": FEATURE_NAMES},
        model_path,
    )

    return {
        "model_path": str(model_path),
        "n_train": len(normal_samples),
        "n_eval": len(samples),
        "classification_report": report,
    }


if __name__ == "__main__":
    result = train()
    print(f"Model saved to: {result['model_path']}")
    print(f"Trained on {result['n_train']} normal samples")
    print(f"Evaluated on {result['n_eval']} total samples")
    print()
    report = result["classification_report"]
    for cls in ["normal", "anomaly"]:
        r = report[cls]
        print(
            f"  {cls}: precision={r['precision']:.2f}  "
            f"recall={r['recall']:.2f}  f1={r['f1-score']:.2f}"
        )
