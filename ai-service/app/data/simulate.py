"""Synthetic GPS data generator for SafeTrace model training.

Generates realistic movement trajectories centred on Yaba/Lagos landmarks.
Normal data simulates commutes at walking/bus speeds during expected hours.
Abnormal data simulates five threat scenarios.
"""

import math
import random
import time

from app.schemas import GPSPoint, SafeZone

# --- Lagos landmarks (latitude, longitude) ---
YABATECH_CAMPUS = (6.5158, 3.3775)
SABO_YABA = (6.5095, 3.3810)
TEJUOSHO_MARKET = (6.5190, 3.3680)
UNILAG = (6.5158, 3.3985)
JIBOWU = (6.5250, 3.3700)

DEFAULT_SAFE_ZONES = [
    SafeZone(latitude=YABATECH_CAMPUS[0], longitude=YABATECH_CAMPUS[1], label="Yabatech"),
    SafeZone(latitude=SABO_YABA[0], longitude=SABO_YABA[1], label="Sabo"),
    SafeZone(latitude=TEJUOSHO_MARKET[0], longitude=TEJUOSHO_MARKET[1], label="Tejuosho"),
]

# Approximate metres per degree at Lagos latitude
METRES_PER_DEG_LAT = 111_320
METRES_PER_DEG_LON = 111_320 * math.cos(math.radians(6.52))


def _add_noise(lat: float, lon: float, noise_m: float = 10.0) -> tuple[float, float]:
    """Add GPS jitter (uniform noise in metres)."""
    dlat = random.uniform(-noise_m, noise_m) / METRES_PER_DEG_LAT
    dlon = random.uniform(-noise_m, noise_m) / METRES_PER_DEG_LON
    return lat + dlat, lon + dlon


def _generate_trajectory(
    start: tuple[float, float],
    end: tuple[float, float],
    num_points: int,
    duration_s: float,
    base_timestamp: float,
    noise_m: float = 10.0,
) -> list[GPSPoint]:
    """Generate a straight-line trajectory with GPS noise between two points."""
    points: list[GPSPoint] = []
    for i in range(num_points):
        frac = i / max(num_points - 1, 1)
        lat = start[0] + frac * (end[0] - start[0])
        lon = start[1] + frac * (end[1] - start[1])
        lat, lon = _add_noise(lat, lon, noise_m)
        ts = base_timestamp + frac * duration_s
        points.append(GPSPoint(latitude=lat, longitude=lon, timestamp=ts))
    return points


def generate_normal_sample(
    rng_seed: int | None = None,
) -> list[GPSPoint]:
    """Generate a single normal movement trajectory.

    Simulates walking or bus commute between known Lagos landmarks
    during daytime hours (6am-9pm).
    """
    if rng_seed is not None:
        random.seed(rng_seed)

    landmarks = [YABATECH_CAMPUS, SABO_YABA, TEJUOSHO_MARKET, UNILAG, JIBOWU]
    start = random.choice(landmarks)
    end = random.choice([lm for lm in landmarks if lm != start])

    # Daytime: 6am-9pm WAT (UTC+1) -> 5am-8pm UTC
    hour = random.randint(5, 19)
    base_ts = 1700000000 + hour * 3600 + random.randint(0, 3599)

    # Walking (4-6 km/h) or bus (15-30 km/h)
    is_bus = random.random() < 0.4
    if is_bus:
        duration_s = random.uniform(300, 900)  # 5-15 min
        num_points = random.randint(10, 25)
    else:
        duration_s = random.uniform(600, 1800)  # 10-30 min
        num_points = random.randint(15, 40)

    return _generate_trajectory(start, end, num_points, duration_s, base_ts)


def generate_abnormal_sample(
    scenario: str = "random",
    rng_seed: int | None = None,
) -> list[GPSPoint]:
    """Generate an abnormal movement trajectory.

    Scenarios:
        speed_spike: Sudden high-speed segment (vehicle abduction)
        route_deviation: Erratic, circling path
        unusual_hours: Normal route but at 1am-4am
        unfamiliar_area: Movement far from all safe zones
        sudden_stop: Movement then abrupt freeze
        random: Pick one at random
    """
    if rng_seed is not None:
        random.seed(rng_seed)

    scenarios = [
        "speed_spike",
        "route_deviation",
        "unusual_hours",
        "unfamiliar_area",
        "sudden_stop",
    ]
    if scenario == "random":
        scenario = random.choice(scenarios)

    if scenario == "speed_spike":
        # Normal walk, then sudden high-speed segment
        start = YABATECH_CAMPUS
        mid = SABO_YABA
        base_ts = 1700000000 + random.randint(5, 19) * 3600

        # Walk for first half
        walk = _generate_trajectory(start, mid, 10, 600, base_ts)
        # Then sudden speed (covering large distance quickly)
        far = (mid[0] + 0.05, mid[1] + 0.05)  # ~5.5 km away
        fast = _generate_trajectory(mid, far, 8, 120, base_ts + 600)  # 2 min
        return walk + fast

    if scenario == "route_deviation":
        # Erratic zigzag path
        base_ts = 1700000000 + random.randint(5, 19) * 3600
        points: list[GPSPoint] = []
        lat, lon = YABATECH_CAMPUS
        for i in range(20):
            angle = random.uniform(0, 2 * math.pi)
            step = random.uniform(0.001, 0.004)  # ~100-440m
            lat += step * math.cos(angle)
            lon += step * math.sin(angle)
            lat, lon = _add_noise(lat, lon, 15.0)
            points.append(
                GPSPoint(
                    latitude=lat,
                    longitude=lon,
                    timestamp=base_ts + i * random.uniform(20, 60),
                )
            )
        return points

    if scenario == "unusual_hours":
        # Normal route but 1am-4am
        start = random.choice([YABATECH_CAMPUS, SABO_YABA])
        end = random.choice([TEJUOSHO_MARKET, UNILAG])
        hour = random.randint(0, 3)  # 0-3 UTC -> 1-4am WAT
        base_ts = 1700000000 + hour * 3600
        return _generate_trajectory(start, end, 20, 900, base_ts)

    if scenario == "unfamiliar_area":
        # Movement in an area far from all safe zones (~10km away)
        far_lat = 6.45 + random.uniform(-0.01, 0.01)
        far_lon = 3.30 + random.uniform(-0.01, 0.01)
        end_lat = far_lat + random.uniform(-0.005, 0.005)
        end_lon = far_lon + random.uniform(-0.005, 0.005)
        base_ts = 1700000000 + random.randint(5, 19) * 3600
        return _generate_trajectory(
            (far_lat, far_lon), (end_lat, end_lon), 15, 600, base_ts
        )

    if scenario == "sudden_stop":
        # Walk then freeze in place
        start = SABO_YABA
        mid = JIBOWU
        base_ts = 1700000000 + random.randint(5, 19) * 3600
        walk = _generate_trajectory(start, mid, 12, 600, base_ts)
        # Then stay in same spot (with tiny GPS jitter)
        frozen: list[GPSPoint] = []
        for i in range(10):
            lat, lon = _add_noise(mid[0], mid[1], 3.0)
            frozen.append(
                GPSPoint(
                    latitude=lat,
                    longitude=lon,
                    timestamp=base_ts + 600 + i * 60,
                )
            )
        return walk + frozen

    raise ValueError(f"Unknown scenario: {scenario}")


def generate_dataset(
    n_normal: int = 200,
    n_abnormal: int = 50,
    seed: int = 42,
) -> tuple[list[list[GPSPoint]], list[int]]:
    """Generate a full training/evaluation dataset.

    Returns:
        samples: List of GPS trajectories.
        labels: 0 = normal, 1 = abnormal.
    """
    random.seed(seed)

    samples: list[list[GPSPoint]] = []
    labels: list[int] = []

    for i in range(n_normal):
        samples.append(generate_normal_sample(rng_seed=seed + i))
        labels.append(0)

    for i in range(n_abnormal):
        samples.append(generate_abnormal_sample(rng_seed=seed + n_normal + i))
        labels.append(1)

    return samples, labels
