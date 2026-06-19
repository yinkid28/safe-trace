# SafeTrace Firebase Backend

Firebase configuration, security rules, and seed data for the SafeTrace project.

## Prerequisites

- [Firebase CLI](https://firebase.google.com/docs/cli) installed (`npm install -g firebase-tools`)
- Python 3.10+ (for the seed script)
- A Firebase project (see setup steps below)

## Firebase Project Setup

These steps must be done manually in the [Firebase Console](https://console.firebase.google.com):

1. **Create a new Firebase project** (or use an existing one)
2. **Enable Email/Password authentication:**
   - Go to Authentication > Sign-in method > Email/Password > Enable
3. **Create a Firestore database:**
   - Go to Firestore Database > Create database
   - Start in **test mode** (the seed script needs unrestricted access initially)
   - Choose a location close to you (e.g. `europe-west1` or `us-central`)
4. **Enable Cloud Storage:**
   - Go to Storage > Get started
5. **Download a service account key:**
   - Go to Project Settings > Service Accounts > Generate new private key
   - Save the file as `firebase/seed/serviceAccountKey.json`
6. **Update `.firebaserc`:**
   - Replace `YOUR_PROJECT_ID` with your actual Firebase project ID

## Deploy Rules and Indexes

```bash
cd firebase
firebase login
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Seed the Database

```bash
cd firebase/seed
pip install -r requirements.txt
python seed.py
```

The seed script creates:

| What | Count | Details |
|------|-------|---------|
| Auth users | 7 | 2 Ogunleye family, 3 Adeniyi family, 2 agency staff |
| Agency | 1 | Yaba Security Services |
| Families | 2 | Ogunleye, Adeniyi — both linked to the agency |
| Alerts | 4 | One of each type (panic, ai_anomaly, offline, checkin) |

All users share the password `Test1234!`.

**Dashboard login:** `officer.bayo@safetrace.test` / `Test1234!`

## Verify Seeded Data

```bash
cd firebase/seed
python verify.py
```

This reads back all collections and checks:
- Document counts
- Required fields are present
- Cross-references (family members exist in users, agency staff exist, etc.)
- Alert type/status values are valid

## File Structure

```
firebase/
├── .firebaserc              # Project binding
├── firebase.json            # Firebase CLI config
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Composite indexes
├── storage.rules            # Cloud Storage security rules
├── SCHEMA.md                # Human-readable schema docs
├── README.md                # This file
└── seed/
    ├── requirements.txt     # Python dependencies
    ├── seed_data.py         # Test data definitions
    ├── seed.py              # Main seed script
    └── verify.py            # Data verification script
```

## Security Rules Summary

**Firestore:**
- Users can read/write their own profile (cannot change their `role`)
- Family members can read each other's profiles and alerts
- Agency staff can read alerts/users/families linked to their agency
- Agencies are read-only from clients
- Alert creation requires `userId == auth.uid` with valid type/status
- No client-side deletes on any collection

**Storage:**
- Evidence photos: any authenticated user can read; uploads must be images under 5 MB
- Profile photos: only owner can write, any authenticated user can read
- Everything else is blocked

## Collections Overview

See [SCHEMA.md](SCHEMA.md) for the full field-by-field schema.

- `users/{userId}` — user profiles (userId = Firebase Auth UID)
- `families/{familyId}` — family groups with member lists
- `agencies/{agencyId}` — security agencies with staff lists
- `alerts/{alertId}` — safety alerts with location, risk, timeline, notes
