"""Pydantic models for SafeTrace AI service request/response validation."""

from typing import Optional

from pydantic import BaseModel, Field


class GPSPoint(BaseModel):
    """A single GPS reading with timestamp."""

    latitude: float = Field(ge=-90, le=90, description="Latitude in degrees")
    longitude: float = Field(ge=-180, le=180, description="Longitude in degrees")
    timestamp: float = Field(gt=0, description="Unix timestamp in seconds")


class SafeZone(BaseModel):
    """A known safe location (home, school, work)."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    label: str = Field(default="", description="Human-readable name")


class PredictRequest(BaseModel):
    """Input to the /predict endpoint."""

    points: list[GPSPoint] = Field(
        min_length=2,
        description="GPS trajectory, at least 2 points, ordered by timestamp",
    )
    safe_zones: list[SafeZone] = Field(
        default_factory=list,
        description="User's known safe locations",
    )


class PredictResponse(BaseModel):
    """Output from the /predict endpoint."""

    risk_score: float = Field(
        ge=0, le=1, description="0 = normal, 1 = maximum anomaly"
    )
    is_anomaly: bool = Field(description="True if risk_score >= threshold")
    threshold: float = Field(description="Decision threshold used")
    explanations: list[str] = Field(
        description="Human-readable reasons for the score"
    )
    features: dict[str, float] = Field(
        description="All 18 extracted features for transparency"
    )


class HealthResponse(BaseModel):
    """Output from the /health endpoint."""

    status: str
    model_loaded: bool
    feature_count: int


# --- Hardware tracker ---


class HardwareLocationRequest(BaseModel):
    """Incoming GPS ping from an ESP32 hardware tracker."""

    deviceId: str = Field(min_length=1, description="Device identifier, e.g. ST-0001")
    deviceKey: str = Field(min_length=1, description="Pre-shared secret for authentication")
    lat: float = Field(ge=-90, le=90, description="Latitude in degrees")
    lon: float = Field(ge=-180, le=180, description="Longitude in degrees")
    speed: float = Field(ge=0, default=0.0, description="Speed in km/h")
    sats: int = Field(ge=0, default=0, description="Number of GPS satellites")
    batt: float = Field(ge=0, default=0.0, description="Battery voltage")
    ts: Optional[int] = Field(default=None, gt=0, description="Unix timestamp in seconds; server timestamps if omitted")


class HardwareLocationResponse(BaseModel):
    """Minimal response for bandwidth-constrained 2G connections."""

    ok: bool
