"""Verification script — reads back seeded data and validates references.

Usage:
    python firebase/seed/verify.py

Checks:
    - All expected collections have the right doc count
    - User docs have required fields
    - Family member UIDs exist in users collection
    - Agency staffUserIds exist in users collection
    - Alert references (userId, familyId, agencyId) point to real docs
    - Alert type and status values are valid
"""

import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

if not os.path.exists(KEY_PATH):
    print(f"ERROR: Service account key not found at {KEY_PATH}")
    sys.exit(1)

if not firebase_admin._apps:
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

VALID_ROLES = {"user", "family_admin", "agency_staff"}
VALID_ALERT_TYPES = {"panic", "ai_anomaly", "offline", "checkin"}
VALID_ALERT_STATUSES = {"new", "acknowledged", "resolved"}

errors: list[str] = []
warnings: list[str] = []


def check(condition: bool, msg: str) -> None:
    if not condition:
        errors.append(msg)
        print(f"  FAIL: {msg}")
    else:
        print(f"  OK:   {msg}")


def warn(msg: str) -> None:
    warnings.append(msg)
    print(f"  WARN: {msg}")


def verify_users(user_ids: set[str]) -> None:
    print("\n[Users]")
    docs = list(db.collection("users").stream())
    check(len(docs) >= 7, f"Expected >= 7 users, found {len(docs)}")

    required_fields = {
        "name", "email", "phone", "role", "familyId",
        "agencyId", "phoneStatus", "safeZones", "createdAt",
    }

    for doc in docs:
        data = doc.to_dict()
        user_ids.add(doc.id)
        missing = required_fields - set(data.keys())
        check(len(missing) == 0, f"User {doc.id} has all required fields (missing: {missing or 'none'})")
        check(data.get("role") in VALID_ROLES, f"User {doc.id} role '{data.get('role')}' is valid")


def verify_agencies(user_ids: set[str], agency_ids: set[str]) -> None:
    print("\n[Agencies]")
    docs = list(db.collection("agencies").stream())
    check(len(docs) >= 1, f"Expected >= 1 agency, found {len(docs)}")

    for doc in docs:
        data = doc.to_dict()
        agency_ids.add(doc.id)
        check("name" in data, f"Agency {doc.id} has name")
        check("staffUserIds" in data, f"Agency {doc.id} has staffUserIds")

        for staff_uid in data.get("staffUserIds", []):
            check(staff_uid in user_ids, f"Agency staff {staff_uid} exists in users")


def verify_families(user_ids: set[str], agency_ids: set[str], family_ids: set[str]) -> None:
    print("\n[Families]")
    docs = list(db.collection("families").stream())
    check(len(docs) >= 2, f"Expected >= 2 families, found {len(docs)}")

    for doc in docs:
        data = doc.to_dict()
        family_ids.add(doc.id)
        check("name" in data, f"Family {doc.id} has name")
        check("members" in data, f"Family {doc.id} has members")
        check("adminUserId" in data, f"Family {doc.id} has adminUserId")
        check("agencyId" in data, f"Family {doc.id} has agencyId")

        check(
            data.get("agencyId") in agency_ids,
            f"Family {doc.id} agencyId '{data.get('agencyId')}' exists",
        )
        check(
            data.get("adminUserId") in user_ids,
            f"Family {doc.id} adminUserId exists in users",
        )
        for member_uid in data.get("members", []):
            check(member_uid in user_ids, f"Family member {member_uid} exists in users")


def verify_alerts(user_ids: set[str], agency_ids: set[str], family_ids: set[str]) -> None:
    print("\n[Alerts]")
    docs = list(db.collection("alerts").stream())
    check(len(docs) >= 4, f"Expected >= 4 alerts, found {len(docs)}")

    types_seen: set[str] = set()
    statuses_seen: set[str] = set()

    for doc in docs:
        data = doc.to_dict()
        alert_type = data.get("type")
        alert_status = data.get("status")
        types_seen.add(alert_type)
        statuses_seen.add(alert_status)

        check(alert_type in VALID_ALERT_TYPES, f"Alert {doc.id} type '{alert_type}' is valid")
        check(alert_status in VALID_ALERT_STATUSES, f"Alert {doc.id} status '{alert_status}' is valid")
        check(data.get("userId") in user_ids, f"Alert {doc.id} userId exists in users")
        check(data.get("familyId") in family_ids, f"Alert {doc.id} familyId exists in families")
        check(data.get("agencyId") in agency_ids, f"Alert {doc.id} agencyId exists in agencies")
        check("lastKnownLocation" in data, f"Alert {doc.id} has lastKnownLocation")
        check("timeline" in data, f"Alert {doc.id} has timeline")
        check("createdAt" in data, f"Alert {doc.id} has createdAt")

        if alert_status in ("acknowledged", "resolved"):
            check(data.get("acknowledgedBy") is not None, f"Alert {doc.id} has acknowledgedBy")

        if alert_status == "resolved":
            check(data.get("resolvedBy") is not None, f"Alert {doc.id} has resolvedBy")

    # Check we have all 4 alert types
    check(
        types_seen == VALID_ALERT_TYPES,
        f"All alert types present: {types_seen}",
    )


def main() -> None:
    print("=== SafeTrace Data Verification ===")

    user_ids: set[str] = set()
    agency_ids: set[str] = set()
    family_ids: set[str] = set()

    verify_users(user_ids)
    verify_agencies(user_ids, agency_ids)
    verify_families(user_ids, agency_ids, family_ids)
    verify_alerts(user_ids, agency_ids, family_ids)

    print("\n=== Summary ===")
    print(f"  Users:    {len(user_ids)}")
    print(f"  Agencies: {len(agency_ids)}")
    print(f"  Families: {len(family_ids)}")

    if errors:
        print(f"\n  ERRORS: {len(errors)}")
        for e in errors:
            print(f"    - {e}")
        sys.exit(1)
    else:
        print("\n  All checks passed.")

    if warnings:
        print(f"\n  WARNINGS: {len(warnings)}")
        for w in warnings:
            print(f"    - {w}")


if __name__ == "__main__":
    main()
