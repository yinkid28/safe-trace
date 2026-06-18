"""Tests for synthetic GPS data generation."""

import pytest

from app.data.simulate import (
    generate_abnormal_sample,
    generate_dataset,
    generate_normal_sample,
)
from app.model.features import extract_features, haversine


# Lagos bounding box (generous)
LAT_MIN, LAT_MAX = 6.35, 6.65
LON_MIN, LON_MAX = 3.25, 3.55


class TestGenerateNormal:
    def test_returns_multiple_points(self):
        pts = generate_normal_sample(rng_seed=1)
        assert len(pts) >= 2

    def test_coordinates_within_lagos(self):
        pts = generate_normal_sample(rng_seed=1)
        for p in pts:
            assert LAT_MIN < p.latitude < LAT_MAX, f"Lat {p.latitude} out of range"
            assert LON_MIN < p.longitude < LON_MAX, f"Lon {p.longitude} out of range"

    def test_timestamps_increase(self):
        pts = generate_normal_sample(rng_seed=1)
        for i in range(1, len(pts)):
            assert pts[i].timestamp >= pts[i - 1].timestamp

    def test_reasonable_speed(self):
        pts = generate_normal_sample(rng_seed=1)
        features = extract_features(pts)
        # Walking or bus: should be under 50 km/h
        assert features["max_speed"] < 50

    def test_deterministic_with_seed(self):
        pts1 = generate_normal_sample(rng_seed=42)
        pts2 = generate_normal_sample(rng_seed=42)
        assert len(pts1) == len(pts2)
        assert pts1[0].latitude == pts2[0].latitude


class TestGenerateAbnormal:
    def test_all_scenarios_produce_points(self):
        for scenario in [
            "speed_spike",
            "route_deviation",
            "unusual_hours",
            "unfamiliar_area",
            "sudden_stop",
        ]:
            pts = generate_abnormal_sample(scenario=scenario, rng_seed=1)
            assert len(pts) >= 2, f"Scenario {scenario} produced < 2 points"

    def test_random_scenario_works(self):
        pts = generate_abnormal_sample(scenario="random", rng_seed=1)
        assert len(pts) >= 2

    def test_invalid_scenario_raises(self):
        with pytest.raises(ValueError, match="Unknown scenario"):
            generate_abnormal_sample(scenario="nonexistent", rng_seed=1)


class TestGenerateDataset:
    def test_correct_counts(self):
        samples, labels = generate_dataset(n_normal=20, n_abnormal=5, seed=1)
        assert len(samples) == 25
        assert len(labels) == 25
        assert sum(1 for l in labels if l == 0) == 20
        assert sum(1 for l in labels if l == 1) == 5

    def test_all_samples_have_enough_points(self):
        samples, _ = generate_dataset(n_normal=10, n_abnormal=3, seed=1)
        for i, s in enumerate(samples):
            assert len(s) >= 2, f"Sample {i} has only {len(s)} points"
