"""Shared test fixtures for SafeTrace AI service."""

import pytest

from app.data.simulate import DEFAULT_SAFE_ZONES, generate_normal_sample, generate_abnormal_sample
from app.schemas import GPSPoint, SafeZone


@pytest.fixture
def simple_trajectory() -> list[GPSPoint]:
    """Two points ~111m apart, 60s between them (~6.7 km/h walk)."""
    return [
        GPSPoint(latitude=6.5158, longitude=3.3775, timestamp=1700000000),
        GPSPoint(latitude=6.5168, longitude=3.3775, timestamp=1700000060),
    ]


@pytest.fixture
def safe_zones() -> list[SafeZone]:
    return list(DEFAULT_SAFE_ZONES)


@pytest.fixture
def normal_trajectory() -> list[GPSPoint]:
    return generate_normal_sample(rng_seed=100)


@pytest.fixture
def abnormal_trajectory() -> list[GPSPoint]:
    return generate_abnormal_sample(scenario="speed_spike", rng_seed=200)
