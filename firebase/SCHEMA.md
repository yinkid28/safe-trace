# SafeTrace Firestore Schema

This document describes the Firestore collections used by all SafeTrace components (mobile app, dashboard, AI service integration).

---

## `users/{userId}`

The `userId` is the Firebase Auth UID.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `email` | string | Matches Firebase Auth email |
| `phone` | string | Nigerian format, e.g. `"+2348012345678"` |
| `role` | string | `"user"` \| `"family_admin"` \| `"agency_staff"` |
| `familyId` | string \| null | Doc ID in `families` collection |
| `agencyId` | string \| null | Only set for `agency_staff` role |
| `lastLocation` | map \| null | `{ lat, lng, speed, heading }` |
| `lastSeen` | timestamp \| null | Last location update time |
| `phoneStatus` | string | `"online"` or `"offline"` |
| `lastLocationSource` | string \| null | `"phone"` or `"hardware"` — which source provided the latest location |
| `safeZones` | array of maps | `[{ lat, lng, label }]` — maps to AI service `PredictRequest.safe_zones` |
| `deviceType` | string | `"mobile"` (set at registration) |
| `fcmTokens` | array of strings | FCM registration tokens for push notifications (one per device/browser) |
| `activeCheckIn` | map \| null | `{ expiresAt, label }` — active safety check-in timer |
| `createdAt` | timestamp | Account creation time |

---

## `families/{familyId}`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | e.g. `"Ogunleye Family"` |
| `members` | array of strings | User IDs (Firebase Auth UIDs) |
| `adminUserId` | string | UID of the family admin |
| `agencyId` | string | Linked agency doc ID |
| `joinCode` | string | Human-readable join code, e.g. `"ADK-4429"` |
| `sharedSafeZones` | array of maps | `[{ lat, lng, label, addedBy }]` — shared across all family members |
| `createdAt` | timestamp | |

---

## `locationHistory/{autoId}`

Stores periodic GPS breadcrumbs for passive movement tracking (written every 5 minutes).

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | UID of the user this location belongs to |
| `familyId` | string | Denormalized for query filtering |
| `lat` | number | Latitude |
| `lng` | number | Longitude |
| `speed` | number \| null | Speed in km/h |
| `heading` | number \| null | Compass heading in degrees |
| `timestamp` | timestamp | Server timestamp for ordering |
| `clientTimestamp` | number | Unix ms from client, for dedup |
| `source` | string \| null | `"phone"` or `"hardware"` — absent on legacy entries (treated as `"phone"`) |
| `deviceId` | string \| null | Only for hardware entries, e.g. `"ST-0001"` |
| `satellites` | number \| null | Only for hardware entries — GPS satellite count |
| `batteryVoltage` | number \| null | Only for hardware entries |

**Access:** Owner, family members, and linked agency staff can read. Phone entries created by client; hardware entries created by AI service (Admin SDK).

---

## `agencies/{agencyId}`

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | e.g. `"Yaba Security Services"` |
| `staffUserIds` | array of strings | UIDs of agency staff |
| `phone` | string \| null | Contact number |
| `status` | string | `"pending"` \| `"verified"` |
| `areaOfOperation` | string \| null | Geographic area the agency covers |
| `address` | string \| null | Physical address |
| `createdAt` | timestamp | |

---

## `devices/{deviceId}`

Hardware GPS trackers paired to user accounts. The `deviceId` is a formatted string like `ST-0001`.

| Field | Type | Description |
|-------|------|-------------|
| `deviceId` | string | Same as the document ID, e.g. `"ST-0001"` |
| `keyHash` | string | SHA-256 hash of `(keySalt + deviceKey)` |
| `keySalt` | string | Random salt for the key hash |
| `pairedUserId` | string | UID of the user this tracker is paired to |
| `familyId` | string \| null | Denormalized from the user's `familyId` |
| `label` | string | User-given name, e.g. `"School Backpack Tracker"` |
| `batteryVoltage` | number \| null | Last reported battery voltage |
| `satellites` | number \| null | Last reported GPS satellite count |
| `lastSeen` | timestamp \| null | Last successful location ping |
| `status` | string | `"online"` \| `"offline"` \| `"never_connected"` |
| `createdAt` | timestamp | When the device was paired |
| `createdBy` | string | UID of the user who created the pairing |

**Access:** Paired user and family members can read. Only paired user can create/update/delete. Hardware endpoint writes via Admin SDK (bypasses rules).

---

## `alerts/{alertId}`

Auto-generated document ID.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | UID of the person the alert is about |
| `userName` | string | Denormalized to avoid extra reads |
| `familyId` | string | Family doc ID |
| `agencyId` | string | Agency to escalate to |
| `type` | string | `"panic"` \| `"ai_anomaly"` \| `"offline"` \| `"checkin"` |
| `status` | string | `"new"` \| `"acknowledged"` \| `"resolved"` |
| `createdAt` | timestamp | When the alert was created |
| `acknowledgedAt` | timestamp \| null | When agency acknowledged |
| `resolvedAt` | timestamp \| null | When marked resolved |
| `acknowledgedBy` | string \| null | Staff UID who acknowledged |
| `resolvedBy` | string \| null | Staff UID who resolved |
| `lastKnownLocation` | map | `{ lat, lng, speed, heading }` |
| `locationName` | string \| null | Human-readable, e.g. `"Sabo, Yaba"` |
| `riskScore` | number \| null | 0-1, from AI service (`PredictResponse.risk_score`) |
| `explanations` | array of strings | From AI service (`PredictResponse.explanations`) |
| `evidenceUrls` | array of strings | Cloud Storage paths |
| `escalated` | boolean | Whether family escalated to agency |
| `escalatedAt` | timestamp \| null | |
| `timeline` | array of maps | `[{ event: string, timestamp: timestamp }]` |
| `notes` | array of maps | `[{ text, author, authorName, timestamp }]` |

---

## Composite Indexes

| Collection | Fields | Purpose |
|------------|--------|---------|
| `alerts` | `agencyId` ASC, `status` ASC, `createdAt` DESC | Dashboard filter tabs |
| `alerts` | `familyId` ASC, `createdAt` DESC | Mobile app family view |
| `alerts` | `agencyId` ASC, `createdAt` DESC | Dashboard "all alerts" view |

---

## AI Service Data Contract

The mobile app bridges Firebase and the AI service:

- `users.safeZones` -> `PredictRequest.safe_zones` (lat/lng/label)
- `PredictResponse.risk_score` -> `alerts.riskScore` (0-1 float)
- `PredictResponse.explanations` -> `alerts.explanations` (list of strings)

All seed data uses the same Lagos landmarks as `ai-service/app/data/simulate.py`.

---

## Cloud Storage Structure

```
/evidence/{alertId}/{filename}     — alert evidence photos
/profiles/{userId}/{filename}      — profile photos
```
