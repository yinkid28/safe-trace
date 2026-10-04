"""Hardware tracker location endpoint.

Receives GPS pings from ESP32 devices, authenticates via a pre-shared
device key, and writes the location to Firestore so the mobile app
picks it up in real time.
"""

import hashlib
import time
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.firebase import get_db
from app.schemas import HardwareLocationRequest, HardwareLocationResponse

router = APIRouter(prefix="/api/v1/hardware", tags=["hardware"])


def _verify_device_key(stored_hash: str, stored_salt: str, provided_key: str) -> bool:
    """Verify a device key against its stored salted SHA-256 hash."""
    computed = hashlib.sha256((stored_salt + provided_key).encode()).hexdigest()
    return computed == stored_hash


@router.post("/location", response_model=HardwareLocationResponse)
async def receive_location(req: HardwareLocationRequest):
    """Receive a GPS ping from an ESP32 hardware tracker.

    Authenticates via deviceId + deviceKey, then writes the location
    to the paired user's Firestore documents using a batch write.
    """
    db = get_db()

    # 1. Look up the device
    device_ref = db.collection("devices").document(req.deviceId)
    device_snap = device_ref.get()

    if not device_snap.exists:
        return JSONResponse(status_code=401, content={"ok": False})

    device = device_snap.to_dict()

    # 2. Verify the key
    if not _verify_device_key(device["keyHash"], device["keySalt"], req.deviceKey):
        return JSONResponse(status_code=401, content={"ok": False})

    # 3. Check device is paired to a user
    user_id = device.get("pairedUserId")
    if not user_id:
        return JSONResponse(status_code=401, content={"ok": False})

    now = datetime.now(timezone.utc)
    client_ts = req.ts * 1000 if req.ts else int(time.time() * 1000)

    # 4. Batch write — atomic update across three documents
    batch = db.batch()

    # 4a. Update the device doc (battery, satellites, last seen)
    batch.update(device_ref, {
        "lastSeen": now,
        "batteryVoltage": req.batt,
        "satellites": req.sats,
        "status": "online",
    })

    # 4b. Update the user's lastLocation
    user_ref = db.collection("users").document(user_id)
    batch.update(user_ref, {
        "lastLocation": {
            "lat": req.lat,
            "lng": req.lon,
            "speed": req.speed,
            "heading": None,
        },
        "lastSeen": now,
        "lastLocationSource": "hardware",
    })

    # 4c. Append to locationHistory
    family_id = device.get("familyId") or ""
    history_ref = db.collection("locationHistory").document()
    batch.set(history_ref, {
        "userId": user_id,
        "familyId": family_id,
        "lat": req.lat,
        "lng": req.lon,
        "speed": req.speed,
        "heading": None,
        "timestamp": now,
        "clientTimestamp": client_ts,
        "source": "hardware",
        "deviceId": req.deviceId,
        "satellites": req.sats,
        "batteryVoltage": req.batt,
    })

    batch.commit()

    return HardwareLocationResponse(ok=True)
