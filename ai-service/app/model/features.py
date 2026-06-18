"""Feature extraction from GPS trajectories.

Extracts 18 features from a sequence of GPS points that capture movement
patterns relevant to personal safety anomaly detection.
"""

import math

import numpy as np

from app.schemas import GPSPoint, SafeZone

EARTH_RADIUS_KM = 6371.0

FEATURE_NAMES = [
    "mean_speed",
    "max_speed",
    "speed_std",
    "mean_acceleration",
    "max_acceleration",
    "mean_bearing_change",
    "max_bearing_change",
    "total_distance",
    "displacement",
    "distance_ratio",
    "min_safe_zone_dist",
    "mean_safe_zone_dist",
    "max_safe_zone_dist",
    "hour_sin",
    "hour_cos",
    "is_night",
    "duration_minutes",
    "stopped_fraction",
]


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    lat1_r, lon1_r = math.radians(lat1), math.radians(lon1)
    lat2_r, lon2_r = math.radians(lat2), math.radians(lon2)

    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    )
    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing from point 1 to point 2 in degrees [0, 360)."""
    lat1_r, lon1_r = math.radians(lat1), math.radians(lon1)
    lat2_r, lon2_r = math.radians(lat2), math.radians(lon2)

    dlon = lon2_r - lon1_r
    x = math.sin(dlon) * math.cos(lat2_r)
    y = math.cos(lat1_r) * math.sin(lat2_r) - math.sin(lat1_r) * math.cos(
        lat2_r
    ) * math.cos(dlon)

    initial = math.degrees(math.atan2(x, y))
    return initial % 360


def bearing_change(b1: float, b2: float) -> float:
    """Smallest angle between two bearings in degrees [0, 180]."""
    diff = abs(b2 - b1) % 360
    return diff if diff <= 180 else 360 - diff


def extract_features(
    points: list[GPSPoint],
    safe_zones: list[SafeZone] | None = None,
) -> dict[str, float]:
    """Extract all 18 features from a GPS trajectory.

    Args:
        points: At least 2 GPS points sorted by timestamp.
        safe_zones: Optional list of known safe locations.

    Returns:
        Dict mapping each of the 18 feature names to its float value.
    """
    if len(points) < 2:
        raise ValueError("Need at least 2 GPS points")

    safe_zones = safe_zones or []

    # Sort by timestamp to be safe
    pts = sorted(points, key=lambda p: p.timestamp)

    # --- Segment-level calculations ---
    distances_km: list[float] = []
    time_deltas_s: list[float] = []
    speeds_kmh: list[float] = []
    bearings: list[float] = []

    for i in range(1, len(pts)):
        d = haversine(
            pts[i - 1].latitude,
            pts[i - 1].longitude,
            pts[i].latitude,
            pts[i].longitude,
        )
        dt = pts[i].timestamp - pts[i - 1].timestamp
        distances_km.append(d)
        time_deltas_s.append(dt)

        if dt > 0:
            speeds_kmh.append(d / (dt / 3600))
        else:
            speeds_kmh.append(0.0)

        bearings.append(
            bearing(
                pts[i - 1].latitude,
                pts[i - 1].longitude,
                pts[i].latitude,
                pts[i].longitude,
            )
        )

    # --- Speed features ---
    speeds = np.array(speeds_kmh)
    mean_speed = float(np.mean(speeds))
    max_speed = float(np.max(speeds))
    speed_std = float(np.std(speeds))

    # --- Acceleration features (km/h per second) ---
    accelerations: list[float] = []
    for i in range(1, len(speeds_kmh)):
        dt = time_deltas_s[i]
        if dt > 0:
            accelerations.append(abs(speeds_kmh[i] - speeds_kmh[i - 1]) / dt)
        else:
            accelerations.append(0.0)

    if accelerations:
        accel_arr = np.array(accelerations)
        mean_acceleration = float(np.mean(accel_arr))
        max_acceleration = float(np.max(accel_arr))
    else:
        mean_acceleration = 0.0
        max_acceleration = 0.0

    # --- Bearing change features ---
    bearing_changes: list[float] = []
    for i in range(1, len(bearings)):
        bearing_changes.append(bearing_change(bearings[i - 1], bearings[i]))

    if bearing_changes:
        bc_arr = np.array(bearing_changes)
        mean_bearing_change = float(np.mean(bc_arr))
        max_bearing_change = float(np.max(bc_arr))
    else:
        mean_bearing_change = 0.0
        max_bearing_change = 0.0

    # --- Distance features ---
    total_distance = sum(distances_km)
    displacement = haversine(
        pts[0].latitude,
        pts[0].longitude,
        pts[-1].latitude,
        pts[-1].longitude,
    )
    distance_ratio = (
        displacement / total_distance if total_distance > 0 else 1.0
    )

    # --- Safe zone distance features ---
    if safe_zones:
        all_dists: list[float] = []
        for pt in pts:
            min_d = min(
                haversine(pt.latitude, pt.longitude, sz.latitude, sz.longitude)
                for sz in safe_zones
            )
            all_dists.append(min_d)
        min_safe_zone_dist = min(all_dists)
        mean_safe_zone_dist = float(np.mean(all_dists))
        max_safe_zone_dist = max(all_dists)
    else:
        min_safe_zone_dist = 0.0
        mean_safe_zone_dist = 0.0
        max_safe_zone_dist = 0.0

    # --- Time features ---
    mid_timestamp = (pts[0].timestamp + pts[-1].timestamp) / 2
    hour = (mid_timestamp % 86400) / 3600  # hour of day in UTC
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    is_night = 1.0 if (hour >= 22 or hour < 5) else 0.0

    # --- Duration ---
    duration_seconds = pts[-1].timestamp - pts[0].timestamp
    duration_minutes = duration_seconds / 60

    # --- Stopped fraction ---
    # A segment is "stopped" if speed < 0.5 km/h
    stopped_count = sum(1 for s in speeds_kmh if s < 0.5)
    stopped_fraction = stopped_count / len(speeds_kmh) if speeds_kmh else 0.0

    return {
        "mean_speed": round(mean_speed, 6),
        "max_speed": round(max_speed, 6),
        "speed_std": round(speed_std, 6),
        "mean_acceleration": round(mean_acceleration, 6),
        "max_acceleration": round(max_acceleration, 6),
        "mean_bearing_change": round(mean_bearing_change, 6),
        "max_bearing_change": round(max_bearing_change, 6),
        "total_distance": round(total_distance, 6),
        "displacement": round(displacement, 6),
        "distance_ratio": round(distance_ratio, 6),
        "min_safe_zone_dist": round(min_safe_zone_dist, 6),
        "mean_safe_zone_dist": round(mean_safe_zone_dist, 6),
        "max_safe_zone_dist": round(max_safe_zone_dist, 6),
        "hour_sin": round(hour_sin, 6),
        "hour_cos": round(hour_cos, 6),
        "is_night": is_night,
        "duration_minutes": round(duration_minutes, 6),
        "stopped_fraction": round(stopped_fraction, 6),
    }


def features_to_array(features: dict[str, float]) -> np.ndarray:
    """Convert feature dict to a numpy array in canonical order."""
    return np.array([features[name] for name in FEATURE_NAMES])
