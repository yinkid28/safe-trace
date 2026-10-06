"""Create a test device document in Firestore for hardware endpoint testing.

Usage:
    python firebase/seed/seed_test_device.py

Creates a device doc (ST-0001) paired to the first seed user (Adeyinka).
Prints the device key needed for ESP32 authentication.
"""

import hashlib
import os
import secrets
import sys

import firebase_admin
from firebase_admin import auth, credentials, firestore

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

if not os.path.exists(KEY_PATH):
    print(f"ERROR: Service account key not found at {KEY_PATH}")
    sys.exit(1)

if not firebase_admin._apps:
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

# --- Config ---
DEVICE_ID = "ST-0001"
DEVICE_KEY = "safetrace-hw-test-2026"  # The plaintext key the ESP32 will send
PAIRED_USER_EMAIL = "adeyinkaadedayo1024@gmail.com"

# --- Look up the user's UID ---
try:
    user_record = auth.get_user_by_email(PAIRED_USER_EMAIL)
except auth.UserNotFoundError:
    print(f"ERROR: No Auth user with email {PAIRED_USER_EMAIL}")
    print("Run seed.py first to create test users.")
    sys.exit(1)

user_uid = user_record.uid
print(f"Pairing device to: {user_record.display_name} ({user_uid})")

# --- Look up user's familyId ---
user_doc = db.collection("users").document(user_uid).get()
family_id = user_doc.to_dict().get("familyId") if user_doc.exists else None

# --- Hash the device key ---
salt = secrets.token_hex(16)
key_hash = hashlib.sha256((salt + DEVICE_KEY).encode()).hexdigest()

# --- Write the device document ---
db.collection("devices").document(DEVICE_ID).set({
    "deviceId": DEVICE_ID,
    "keyHash": key_hash,
    "keySalt": salt,
    "pairedUserId": user_uid,
    "familyId": family_id,
    "label": "Test Tracker",
    "batteryVoltage": None,
    "satellites": None,
    "lastSeen": None,
    "status": "never_connected",
    "createdAt": firestore.SERVER_TIMESTAMP,
    "createdBy": user_uid,
})

print(f"\n=== Test Device Created ===")
print(f"  Device ID:  {DEVICE_ID}")
print(f"  Device Key: {DEVICE_KEY}")
print(f"  Paired to:  {user_record.display_name} ({user_uid})")
print(f"  Family ID:  {family_id}")
print(f"\nThe ESP32 should send:")
print(f'  "deviceId": "{DEVICE_ID}"')
print(f'  "deviceKey": "{DEVICE_KEY}"')
