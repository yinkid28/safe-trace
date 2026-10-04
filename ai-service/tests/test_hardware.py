"""Tests for the hardware location endpoint."""

import hashlib
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def _make_key_hash(key: str, salt: str) -> str:
    """Replicate the hashing the mobile app does on device registration."""
    return hashlib.sha256((salt + key).encode()).hexdigest()


DEVICE_KEY = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
DEVICE_SALT = "salt0123456789abcdef0123456789ab"
DEVICE_HASH = _make_key_hash(DEVICE_KEY, DEVICE_SALT)


def _mock_device_data(*, exists=True, paired=True):
    """Create a mock Firestore device snapshot."""
    snap = MagicMock()
    snap.exists = exists
    if exists:
        snap.to_dict.return_value = {
            "deviceId": "ST-0001",
            "keyHash": DEVICE_HASH,
            "keySalt": DEVICE_SALT,
            "pairedUserId": "user123" if paired else None,
            "familyId": "family456",
            "status": "online",
        }
    return snap


def _build_mock_db(device_snap=None):
    """Build a mock Firestore client with configurable device lookup."""
    db = MagicMock()
    if device_snap is None:
        device_snap = _mock_device_data()

    device_ref = MagicMock()
    device_ref.get.return_value = device_snap

    # db.collection("devices").document("ST-0001") -> device_ref
    # db.collection("users").document("user123")   -> user_ref
    # db.collection("locationHistory").document()   -> history_ref
    db.collection.return_value.document.return_value = device_ref

    # batch
    batch = MagicMock()
    db.batch.return_value = batch

    return db


def _valid_payload(**overrides):
    base = {
        "deviceId": "ST-0001",
        "deviceKey": DEVICE_KEY,
        "lat": 6.5176,
        "lon": 3.3777,
        "speed": 0.0,
        "sats": 7,
        "batt": 3.92,
        "ts": 1730000000,
    }
    base.update(overrides)
    return base


@pytest.fixture()
def client():
    """TestClient with mocked Firebase."""
    mock_db = _build_mock_db()

    with (
        patch("app.firebase.init_firebase", return_value=mock_db),
        patch("app.routes.hardware.get_db", return_value=mock_db),
    ):
        from app.main import app

        with TestClient(app) as c:
            yield c


@pytest.fixture()
def client_unknown_device():
    """TestClient where device lookup returns not-found."""
    mock_db = _build_mock_db(_mock_device_data(exists=False))

    with (
        patch("app.firebase.init_firebase", return_value=mock_db),
        patch("app.routes.hardware.get_db", return_value=mock_db),
    ):
        from app.main import app

        with TestClient(app) as c:
            yield c


@pytest.fixture()
def client_unpaired_device():
    """TestClient where device exists but isn't paired to a user."""
    mock_db = _build_mock_db(_mock_device_data(paired=False))

    with (
        patch("app.firebase.init_firebase", return_value=mock_db),
        patch("app.routes.hardware.get_db", return_value=mock_db),
    ):
        from app.main import app

        with TestClient(app) as c:
            yield c


class TestHardwareLocationEndpoint:
    """POST /api/v1/hardware/location"""

    def test_valid_ping_returns_200(self, client):
        resp = client.post("/api/v1/hardware/location", json=_valid_payload())
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_unknown_device_returns_401(self, client_unknown_device):
        resp = client_unknown_device.post(
            "/api/v1/hardware/location", json=_valid_payload()
        )
        assert resp.status_code == 401
        assert resp.json() == {"ok": False}

    def test_wrong_key_returns_401(self, client):
        resp = client.post(
            "/api/v1/hardware/location",
            json=_valid_payload(deviceKey="wrong_key_entirely"),
        )
        assert resp.status_code == 401
        assert resp.json() == {"ok": False}

    def test_unpaired_device_returns_401(self, client_unpaired_device):
        resp = client_unpaired_device.post(
            "/api/v1/hardware/location", json=_valid_payload()
        )
        assert resp.status_code == 401
        assert resp.json() == {"ok": False}

    def test_missing_required_fields_returns_422(self, client):
        resp = client.post(
            "/api/v1/hardware/location",
            json={"deviceId": "ST-0001"},
        )
        assert resp.status_code == 422

    def test_invalid_latitude_returns_422(self, client):
        resp = client.post(
            "/api/v1/hardware/location",
            json=_valid_payload(lat=100.0),
        )
        assert resp.status_code == 422

    def test_invalid_longitude_returns_422(self, client):
        resp = client.post(
            "/api/v1/hardware/location",
            json=_valid_payload(lon=200.0),
        )
        assert resp.status_code == 422

    def test_negative_speed_returns_422(self, client):
        resp = client.post(
            "/api/v1/hardware/location",
            json=_valid_payload(speed=-5.0),
        )
        assert resp.status_code == 422

    def test_optional_ts_defaults_to_none(self, client):
        """ts is optional — server timestamps when omitted."""
        payload = _valid_payload()
        del payload["ts"]
        resp = client.post("/api/v1/hardware/location", json=payload)
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_response_body_is_small(self, client):
        """Response should be tiny for 2G bandwidth."""
        resp = client.post("/api/v1/hardware/location", json=_valid_payload())
        assert len(resp.content) < 20
