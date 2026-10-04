"""Tests for the push notification endpoint."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


def _mock_family(member_ids):
    snap = MagicMock()
    snap.exists = True
    snap.to_dict.return_value = {"members": member_ids}
    return snap


def _mock_user(tokens):
    snap = MagicMock()
    snap.exists = True
    snap.to_dict.return_value = {"fcmTokens": tokens}
    return snap


def _mock_agency(staff_ids):
    snap = MagicMock()
    snap.exists = True
    snap.to_dict.return_value = {"staffUserIds": staff_ids}
    return snap


def _build_mock_db(family_snap=None, user_snaps=None, agency_snap=None):
    """Build a mock Firestore client with configurable lookups."""
    db = MagicMock()

    def collection_side_effect(name):
        coll = MagicMock()
        if name == "families":
            doc_mock = MagicMock()
            doc_mock.get.return_value = family_snap or MagicMock(exists=False)
            coll.document.return_value = doc_mock
        elif name == "users":
            def user_doc_fn(uid):
                doc_mock = MagicMock()
                if user_snaps and uid in user_snaps:
                    doc_mock.get.return_value = user_snaps[uid]
                else:
                    doc_mock.get.return_value = MagicMock(exists=False)
                return doc_mock
            coll.document.side_effect = user_doc_fn
        elif name == "agencies":
            doc_mock = MagicMock()
            doc_mock.get.return_value = agency_snap or MagicMock(exists=False)
            coll.document.return_value = doc_mock
        return coll

    db.collection.side_effect = collection_side_effect
    return db


def _valid_payload(**overrides):
    base = {
        "alertId": "alert_123",
        "alertType": "panic",
        "userName": "Tola",
        "familyId": "family_1",
        "agencyId": "agency_yaba",
        "locationName": "Sabo, Yaba",
    }
    base.update(overrides)
    return base


@pytest.fixture()
def client_with_tokens():
    """Family has one member with one FCM token."""
    mock_db = _build_mock_db(
        family_snap=_mock_family(["user_a"]),
        user_snaps={"user_a": _mock_user(["token_abc"])},
    )

    mock_response = MagicMock()
    mock_response.success_count = 1
    mock_response.failure_count = 0
    mock_response.responses = []

    with (
        patch("app.firebase.init_firebase", return_value=mock_db),
        patch("app.routes.notifications.get_db", return_value=mock_db),
        patch("app.routes.notifications.messaging") as mock_messaging,
    ):
        mock_messaging.send_each_for_multicast.return_value = mock_response
        mock_messaging.MulticastMessage = MagicMock()
        mock_messaging.Notification = MagicMock()
        mock_messaging.AndroidConfig = MagicMock()
        mock_messaging.AndroidNotification = MagicMock()
        mock_messaging.WebpushConfig = MagicMock()

        from app.main import app

        with TestClient(app) as c:
            yield c


@pytest.fixture()
def client_no_tokens():
    """Family exists but no member has FCM tokens."""
    mock_db = _build_mock_db(
        family_snap=_mock_family(["user_a"]),
        user_snaps={"user_a": _mock_user([])},
    )

    with (
        patch("app.firebase.init_firebase", return_value=mock_db),
        patch("app.routes.notifications.get_db", return_value=mock_db),
    ):
        from app.main import app

        with TestClient(app) as c:
            yield c


@pytest.fixture()
def client_no_family():
    """No family document exists."""
    mock_db = _build_mock_db()

    with (
        patch("app.firebase.init_firebase", return_value=mock_db),
        patch("app.routes.notifications.get_db", return_value=mock_db),
    ):
        from app.main import app

        with TestClient(app) as c:
            yield c


class TestNotifyEndpoint:
    """POST /api/v1/notify"""

    def test_valid_notify_returns_200(self, client_with_tokens):
        resp = client_with_tokens.post("/api/v1/notify", json=_valid_payload())
        assert resp.status_code == 200
        data = resp.json()
        assert data["sent"] == 1
        assert data["failed"] == 0

    def test_no_tokens_returns_zero_sent(self, client_no_tokens):
        resp = client_no_tokens.post("/api/v1/notify", json=_valid_payload())
        assert resp.status_code == 200
        data = resp.json()
        assert data["sent"] == 0
        assert data["failed"] == 0

    def test_no_family_returns_zero_sent(self, client_no_family):
        resp = client_no_family.post("/api/v1/notify", json=_valid_payload())
        assert resp.status_code == 200
        assert resp.json()["sent"] == 0

    def test_empty_family_id_returns_zero(self, client_no_family):
        resp = client_no_family.post(
            "/api/v1/notify",
            json=_valid_payload(familyId="", agencyId=""),
        )
        assert resp.status_code == 200
        assert resp.json()["sent"] == 0

    def test_missing_alert_id_returns_422(self, client_with_tokens):
        payload = _valid_payload()
        del payload["alertId"]
        resp = client_with_tokens.post("/api/v1/notify", json=payload)
        assert resp.status_code == 422

    def test_missing_alert_type_returns_422(self, client_with_tokens):
        payload = _valid_payload()
        del payload["alertType"]
        resp = client_with_tokens.post("/api/v1/notify", json=payload)
        assert resp.status_code == 422

    def test_response_has_sent_and_failed_fields(self, client_with_tokens):
        resp = client_with_tokens.post("/api/v1/notify", json=_valid_payload())
        data = resp.json()
        assert "sent" in data
        assert "failed" in data
