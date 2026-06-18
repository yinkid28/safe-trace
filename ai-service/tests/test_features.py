"""Tests for feature extraction module."""

import math

import pytest

from app.model.features import (
    FEATURE_NAMES,
    bearing,
    bearing_change,
    extract_features,
    features_to_array,
    haversine,
)
from app.schemas import GPSPoint, SafeZone


class TestHaversine:
    def test_same_point_is_zero(self):
        assert haversine(6.5, 3.4, 6.5, 3.4) == 0.0

    def test_known_distance(self):
        # 1 degree of latitude ~ 111.32 km
        d = haversine(0.0, 0.0, 1.0, 0.0)
        assert 110.5 < d < 112.0

    def test_symmetry(self):
        d1 = haversine(6.5, 3.3, 6.6, 3.4)
        d2 = haversine(6.6, 3.4, 6.5, 3.3)
        assert abs(d1 - d2) < 1e-10


class TestBearing:
    def test_due_north(self):
        b = bearing(0.0, 0.0, 1.0, 0.0)
        assert abs(b - 0.0) < 0.01

    def test_due_east(self):
        b = bearing(0.0, 0.0, 0.0, 1.0)
        assert abs(b - 90.0) < 0.5

    def test_due_south(self):
        b = bearing(1.0, 0.0, 0.0, 0.0)
        assert abs(b - 180.0) < 0.01


class TestBearingChange:
    def test_same_bearing(self):
        assert bearing_change(90.0, 90.0) == 0.0

    def test_opposite(self):
        assert bearing_change(0.0, 180.0) == 180.0

    def test_wrap_around(self):
        # 350 -> 10 should be 20 degrees, not 340
        assert abs(bearing_change(350.0, 10.0) - 20.0) < 1e-10


class TestExtractFeatures:
    def test_returns_all_18_features(self, simple_trajectory, safe_zones):
        features = extract_features(simple_trajectory, safe_zones)
        assert set(features.keys()) == set(FEATURE_NAMES)
        assert len(features) == 18

    def test_all_values_are_float(self, simple_trajectory):
        features = extract_features(simple_trajectory)
        for name, val in features.items():
            assert isinstance(val, float), f"{name} is {type(val)}"

    def test_speed_is_reasonable_for_walk(self, simple_trajectory):
        # ~0.001 deg lat in 60s ~ 6.7 km/h
        features = extract_features(simple_trajectory)
        assert 5.0 < features["mean_speed"] < 8.0

    def test_night_flag_for_nighttime(self):
        # Timestamp at 2am UTC
        points = [
            GPSPoint(latitude=6.5, longitude=3.3, timestamp=1700006400 + 7200),
            GPSPoint(latitude=6.501, longitude=3.3, timestamp=1700006400 + 7260),
        ]
        features = extract_features(points)
        assert features["is_night"] == 1.0

    def test_night_flag_for_daytime(self):
        # Timestamp at 12pm UTC
        noon = 1700006400 + 43200
        points = [
            GPSPoint(latitude=6.5, longitude=3.3, timestamp=noon),
            GPSPoint(latitude=6.501, longitude=3.3, timestamp=noon + 60),
        ]
        features = extract_features(points)
        assert features["is_night"] == 0.0

    def test_cyclical_hour_encoding(self):
        features = extract_features([
            GPSPoint(latitude=6.5, longitude=3.3, timestamp=1700006400),
            GPSPoint(latitude=6.501, longitude=3.3, timestamp=1700006460),
        ])
        # sin^2 + cos^2 should equal 1
        assert abs(
            features["hour_sin"] ** 2 + features["hour_cos"] ** 2 - 1.0
        ) < 0.01

    def test_minimum_two_points(self):
        with pytest.raises(ValueError, match="at least 2"):
            extract_features([GPSPoint(latitude=6.5, longitude=3.3, timestamp=100)])

    def test_duplicate_timestamps(self):
        # Should not crash — speeds will be 0
        points = [
            GPSPoint(latitude=6.5, longitude=3.3, timestamp=100),
            GPSPoint(latitude=6.501, longitude=3.3, timestamp=100),
        ]
        features = extract_features(points)
        assert features["mean_speed"] == 0.0

    def test_features_to_array_order(self, simple_trajectory):
        features = extract_features(simple_trajectory)
        arr = features_to_array(features)
        assert arr.shape == (18,)
        for i, name in enumerate(FEATURE_NAMES):
            assert arr[i] == features[name]
