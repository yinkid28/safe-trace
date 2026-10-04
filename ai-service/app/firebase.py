"""Firebase Admin SDK initialization for SafeTrace AI service.

Supports two credential methods:
  1. FIREBASE_SERVICE_ACCOUNT_JSON env var — the JSON content directly
     (preferred for cloud deployments like Render where you can't mount files).
  2. GOOGLE_APPLICATION_CREDENTIALS env var — path to a JSON key file
     (standard Firebase convention for local development).
"""

import json
import os

import firebase_admin
from firebase_admin import credentials, firestore

_db = None


def init_firebase():
    """Initialize Firebase Admin SDK.  Call once at startup.

    Returns the Firestore client.  Subsequent calls return the same
    client (singleton).
    """
    global _db
    if _db is not None:
        return _db

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if sa_json:
        info = json.loads(sa_json)
        cred = credentials.Certificate(info)
    else:
        cred = credentials.ApplicationDefault()

    firebase_admin.initialize_app(cred)
    _db = firestore.client()
    return _db


def get_db():
    """Return the Firestore client.

    Raises RuntimeError if ``init_firebase()`` has not been called.
    """
    if _db is None:
        raise RuntimeError("Firebase not initialized. Call init_firebase() first.")
    return _db
