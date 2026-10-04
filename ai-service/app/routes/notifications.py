"""Push notification endpoint.

Sends FCM notifications to family members and linked agency staff
when an alert is created. Called by the mobile client after writing
the alert document to Firestore.
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field
from firebase_admin import messaging

from app.firebase import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["notifications"])


class NotifyRequest(BaseModel):
    """Payload from the mobile client after alert creation."""

    alertId: str = Field(min_length=1)
    alertType: str = Field(min_length=1)
    userName: str = Field(default="Someone")
    familyId: str = Field(default="")
    agencyId: str = Field(default="")
    locationName: str = Field(default="Unknown location")


class NotifyResponse(BaseModel):
    sent: int = 0
    failed: int = 0


ALERT_TITLES = {
    "panic": "EMERGENCY SOS",
    "ai_anomaly": "Unusual Movement Detected",
    "offline": "Phone Went Offline",
    "checkin": "Missed Safety Check-In",
}

ALERT_BODIES = {
    "panic": "{name} triggered an emergency alert near {location}",
    "ai_anomaly": "{name}'s movement was flagged as unusual near {location}",
    "offline": "{name}'s phone went offline. Last seen near {location}",
    "checkin": "{name} didn't respond to their safety check-in",
}


def _collect_tokens(db, family_id: str, agency_id: str) -> list[str]:
    """Look up FCM tokens for all family members and agency staff."""
    tokens: list[str] = []

    # Family members
    if family_id and family_id != "no_family":
        family_snap = db.collection("families").document(family_id).get()
        if family_snap.exists:
            member_ids = family_snap.to_dict().get("members", [])
            for uid in member_ids:
                user_snap = db.collection("users").document(uid).get()
                if user_snap.exists:
                    tokens.extend(user_snap.to_dict().get("fcmTokens", []))

    # Agency staff
    if agency_id:
        agency_snap = db.collection("agencies").document(agency_id).get()
        if agency_snap.exists:
            staff_ids = agency_snap.to_dict().get("staffUserIds", [])
            for uid in staff_ids:
                user_snap = db.collection("users").document(uid).get()
                if user_snap.exists:
                    tokens.extend(user_snap.to_dict().get("fcmTokens", []))

    # Deduplicate and remove empties
    return list(set(t for t in tokens if t))


def _remove_stale_token(db, token: str) -> None:
    """Best-effort removal of an expired FCM token from user docs."""
    try:
        from firebase_admin import firestore as fb_firestore

        query = db.collection("users").where("fcmTokens", "array_contains", token).stream()
        for doc_snap in query:
            doc_snap.reference.update({
                "fcmTokens": fb_firestore.ArrayRemove([token])
            })
    except Exception:
        pass


@router.post("/notify", response_model=NotifyResponse)
async def send_notification(req: NotifyRequest):
    """Send push notifications to family members and agency staff."""
    db = get_db()
    tokens = _collect_tokens(db, req.familyId, req.agencyId)

    if not tokens:
        return NotifyResponse(sent=0, failed=0)

    title = ALERT_TITLES.get(req.alertType, "SafeTrace Alert")
    body_template = ALERT_BODIES.get(req.alertType, "{name} needs help")
    body = body_template.format(name=req.userName, location=req.locationName)

    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data={
            "alertId": req.alertId,
            "alertType": req.alertType,
        },
        android=messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                sound="default",
                priority="max",
            ),
        ),
        webpush=messaging.WebpushConfig(
            headers={"Urgency": "high"},
        ),
    )

    try:
        response = messaging.send_each_for_multicast(message)
    except Exception as exc:
        logger.warning("FCM send failed: %s", exc)
        return NotifyResponse(sent=0, failed=len(tokens))

    # Clean up invalid tokens
    for i, send_response in enumerate(response.responses):
        if send_response.exception:
            error_code = getattr(send_response.exception, "code", "")
            if error_code in ("NOT_FOUND", "INVALID_ARGUMENT", "UNREGISTERED"):
                _remove_stale_token(db, tokens[i])

    return NotifyResponse(
        sent=response.success_count,
        failed=response.failure_count,
    )
