"""Main seed script — creates Firebase Auth users and Firestore documents.

Usage:
    1. Place your service account key at firebase/seed/serviceAccountKey.json
    2. Run: python firebase/seed/seed.py

The script is idempotent — running it twice will fail on Auth user creation
(duplicate emails) but won't corrupt Firestore because it uses set() with
merge. To re-seed from scratch, delete the Auth users in Firebase Console
first.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import firebase_admin
from firebase_admin import auth, credentials, firestore

from seed_data import AGENCY, ALERTS, DEFAULT_PASSWORD, FAMILIES, USERS

# --- Initialise Firebase Admin SDK ---

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

if not os.path.exists(KEY_PATH):
    print(f"ERROR: Service account key not found at {KEY_PATH}")
    print("Download it from Firebase Console > Project Settings > Service Accounts")
    sys.exit(1)

cred = credentials.Certificate(KEY_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()


def create_auth_users() -> dict[str, str]:
    """Create Firebase Auth users and return a mapping of key -> UID."""
    uid_map: dict[str, str] = {}

    for user in USERS:
        try:
            record = auth.create_user(
                email=user["email"],
                password=DEFAULT_PASSWORD,
                display_name=user["name"],
            )
            uid_map[user["key"]] = record.uid
            print(f"  Created Auth user: {user['name']} ({record.uid})")
        except auth.EmailAlreadyExistsError:
            # User already exists — look up UID
            record = auth.get_user_by_email(user["email"])
            uid_map[user["key"]] = record.uid
            print(f"  Auth user exists:  {user['name']} ({record.uid})")

    return uid_map


def seed_agency() -> str:
    """Create the agency document. Returns the agency doc ID."""
    doc_id = AGENCY["doc_id"]
    db.collection("agencies").document(doc_id).set(
        {
            "name": AGENCY["name"],
            "staffUserIds": [],  # filled after users are created
            "phone": AGENCY["phone"],
            "address": AGENCY["address"],
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    print(f"  Created agency: {AGENCY['name']} ({doc_id})")
    return doc_id


def seed_families(uid_map: dict[str, str], agency_id: str) -> dict[str, str]:
    """Create family documents. Returns mapping of family_key -> doc ID."""
    family_map: dict[str, str] = {}

    for family in FAMILIES:
        doc_id = family["doc_id"]
        member_uids = [uid_map[k] for k in family["member_keys"]]
        admin_uid = uid_map[family["admin_key"]]

        db.collection("families").document(doc_id).set({
            "name": family["name"],
            "members": member_uids,
            "adminUserId": admin_uid,
            "agencyId": agency_id,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        family_map[family["key"]] = doc_id
        print(f"  Created family: {family['name']} ({doc_id})")

    return family_map


def seed_users(
    uid_map: dict[str, str],
    family_map: dict[str, str],
    agency_id: str,
) -> None:
    """Create user profile documents in Firestore."""
    staff_uids: list[str] = []

    for user in USERS:
        uid = uid_map[user["key"]]
        family_id = family_map.get(user["family_key"]) if user["family_key"] else None
        agent_id = agency_id if user["role"] == "agency_staff" else None

        if user["role"] == "agency_staff":
            staff_uids.append(uid)

        db.collection("users").document(uid).set({
            "name": user["name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
            "familyId": family_id,
            "agencyId": agent_id,
            "lastLocation": None,
            "lastSeen": None,
            "phoneStatus": "online",
            "safeZones": user["safe_zones"],
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        print(f"  Created user doc: {user['name']} ({uid})")

    # Update agency with staff UIDs
    db.collection("agencies").document(agency_id).update({
        "staffUserIds": staff_uids,
    })
    print(f"  Updated agency staffUserIds ({len(staff_uids)} staff)")


def seed_alerts(
    uid_map: dict[str, str],
    family_map: dict[str, str],
    agency_id: str,
) -> None:
    """Create alert documents."""
    now = datetime.now(tz=timezone.utc)
    bayo_uid = uid_map["bayo"]

    for i, alert_def in enumerate(ALERTS):
        user_uid = uid_map[alert_def["user_key"]]
        user_data = next(u for u in USERS if u["key"] == alert_def["user_key"])
        family_key = user_data["family_key"]
        family_id = family_map[family_key]

        # Stagger alert times so they appear in different orders
        created_at = now - timedelta(minutes=(len(ALERTS) - i) * 5)

        # Build timeline
        timeline = []
        for j, event_text in enumerate(alert_def["timeline_events"]):
            timeline.append({
                "event": event_text,
                "timestamp": created_at + timedelta(seconds=j * 30),
            })

        doc = {
            "userId": user_uid,
            "userName": user_data["name"],
            "familyId": family_id,
            "agencyId": agency_id,
            "type": alert_def["type"],
            "status": alert_def["status"],
            "createdAt": created_at,
            "acknowledgedAt": None,
            "resolvedAt": None,
            "acknowledgedBy": None,
            "resolvedBy": None,
            "lastKnownLocation": alert_def["location"],
            "locationName": alert_def["location_name"],
            "riskScore": alert_def["risk_score"],
            "explanations": alert_def["explanations"],
            "evidenceUrls": [],
            "escalated": alert_def["escalated"],
            "escalatedAt": created_at + timedelta(minutes=2) if alert_def["escalated"] else None,
            "timeline": timeline,
            "notes": [],
        }

        # Set timestamps for non-new statuses
        if alert_def["status"] in ("acknowledged", "resolved"):
            doc["acknowledgedAt"] = created_at + timedelta(minutes=3)
            doc["acknowledgedBy"] = bayo_uid

        if alert_def["status"] == "resolved":
            doc["resolvedAt"] = created_at + timedelta(minutes=10)
            doc["resolvedBy"] = bayo_uid

        ref = db.collection("alerts").add(doc)
        alert_id = ref[1].id
        print(f"  Created alert: {alert_def['type']} / {alert_def['status']} for {user_data['name']} ({alert_id})")


def main() -> None:
    print("\n=== SafeTrace Seed Script ===\n")

    print("[1/5] Creating Auth users...")
    uid_map = create_auth_users()
    print(f"  -> {len(uid_map)} users\n")

    print("[2/5] Creating agency...")
    agency_id = seed_agency()
    print()

    print("[3/5] Creating families...")
    family_map = seed_families(uid_map, agency_id)
    print(f"  -> {len(family_map)} families\n")

    print("[4/5] Creating user profiles...")
    seed_users(uid_map, family_map, agency_id)
    print()

    print("[5/5] Creating alerts...")
    seed_alerts(uid_map, family_map, agency_id)
    print()

    print("=== Seeding complete ===")
    print(f"\nDashboard login: officer.bayo@safetrace.test / {DEFAULT_PASSWORD}")
    print()


if __name__ == "__main__":
    main()
