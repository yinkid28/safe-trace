# SafeTrace — AI-Powered Personal Safety & Emergency Alert System

A personal safety system for the Nigerian context that detects when something has gone wrong, preserves evidence before a phone can be seized or switched off, and escalates a located, proof-backed alert through a family-and-agency responder hierarchy.

---

## What we are building

Three parts, integrated through a single Firebase backend:

1. **Android app** (Flutter) — used by the protected person and their family. Registration, family groups, panic button, live location, evidence capture.
2. **Python AI service** (FastAPI + scikit-learn) — learns a user's normal movement pattern and flags anomalies as a risk score. Our own model — no LLM, no external AI API.
3. **Web dashboard** (React) — used by the security agency to monitor live alerts, location, and captured evidence.

---

## Core principles

- **A switched-off phone sends nothing.** We don't claim to track a dead phone. The moment a phone goes offline / battery is pulled / signal drops, that is itself a trigger event — we preserve the last known location, time, speed and direction.
- **Evidence must leave the phone before the phone dies.** On any trigger, the app captures a photo + location burst and uploads to the cloud immediately, THEN raises the alarm. The evidence survives even if the phone is destroyed one second later.
- **The AI is our own work.** Anomaly detection is built with Python/scikit-learn (Isolation Forest). We can explain and defend every part of it.
- **Built for a low-response environment.** The value is not "tracking" — it is detecting trouble automatically, preserving proof, and delivering an actionable alert to a responder.
- **Cost-conscious.** Everything runs on free tiers (Firebase Spark, Render free, Google Maps free tier).

---

## Trigger types (how an alert fires)

1. **Manual panic trigger** — button in app, or hidden gesture (e.g. rapid volume button press). Most reliable. Always present.
2. **Inactivity / check-in trigger** — user sets a check-in window ("check on me in 2 hours"). If they don't confirm safety, the system escalates.
3. **AI anomaly trigger** — the Python service flags abnormal movement (route deviation, abnormal speed, unusual area/time) → risk score crosses threshold → system sends "Are you okay?" check-in → if no safe response, escalate.
4. **Phone-offline trigger** — sudden loss of signal / shutdown during an active journey records last-known data and flags it.

---

## Responder hierarchy (escalation flow)

- A group of people create a **Family**. During creation they must select a nearest fallback **security agency**.
- An individual with no family registers directly under an agency.
- On alert: **all family members notified first** → any family member can **escalate to the linked agency** → agency sees it on the **web dashboard** with location + evidence.

---

## "Where is X?" assistant

A family member can ask "Where is Tola now?" and get an accurate status reply.

- **Defence version: rule-based (no LLM).** Our own code reads the database and formats a reply, e.g.:
  *"Tola: last seen 14 min ago near Yaba, moving ~60 km/h toward an unmonitored area, phone now offline. This is unusual for this time."*
- Reports current location if phone is on, or last-known location + time of contact loss if off. Never claims data from a dead phone.
- **Future work:** natural-language conversational version using an LLM. Not built for defence.

---

## Tech stack (all free tier)

| Part | Tech |
|------|------|
| Android app | Flutter (Dart), `geolocator`, `firebase_*` packages, `google_maps_flutter` |
| AI service | Python 3.11+, FastAPI, scikit-learn (Isolation Forest), numpy, uvicorn |
| Web dashboard | React (Vite), Firebase JS SDK, Google Maps JS API or react-leaflet/OpenStreetMap |
| Backend / glue | Firebase: Authentication, Firestore, Cloud Storage, Cloud Messaging (FCM) |
| Scheduling | Firebase Cloud Scheduler / scheduled Cloud Function (or cron on the Python host) |
| AI hosting | Render free tier |
| Maps | Google Maps API free tier or OpenStreetMap |

All three parts read/write the same Firebase database — loosely coupled, each built and tested independently.

---

## Monorepo structure

```
safe-trace/
├── Project.md                 # this file
├── README.md
├── .gitignore
├── ai-service/                # Python FastAPI + scikit-learn (Phase 1)
│   ├── app/
│   │   ├── main.py
│   │   ├── schemas.py
│   │   ├── model/
│   │   │   ├── train.py
│   │   │   ├── predict.py
│   │   │   └── features.py
│   │   └── data/
│   │       └── simulate.py
│   ├── tests/
│   ├── requirements.txt
│   └── README.md
├── mobile/                    # Flutter Android app (Phase 3)
│   └── (flutter project)
└── dashboard/                 # React web dashboard (Phase 4)
    └── (vite react project)
```

---

## Build phases

**Phase 1 — AI service (FIRST)**
- `simulate.py`: generate normal routes (home-school-church patterns) + abnormal samples (sudden speed, off-route, unusual area/time).
- `features.py`: turn raw GPS points into 18 features (speed, bearing change, distance from expected route, time-of-day, distance from safe zones).
- `train.py`: train Isolation Forest, save model.
- `predict.py` + `main.py`: FastAPI endpoint that takes a movement sample and returns a risk score (0-1) + flag.
- Tests + demo via Swagger UI.

**Phase 2 — Firebase + data model**
- Auth, Firestore collections (users, families, agencies, alerts, locations, evidence), storage rules.

**Phase 3 — Android app**
- Registration, create/join family + pick agency, live GPS, panic button, evidence capture -> instant upload -> then alert, last-known + offline detection, rule-based "Where is X?".

**Phase 4 — Web dashboard**
- Agency login, live alert list, map view, evidence view, alert status.

**Phase 5 — Integration + escalation logic + check-in scheduler**

**Phase 6 — Polish, demo data, defence prep**

**Out of scope for defence (future work):** LLM conversational bot, audio recording, sensor auto-trigger, real agency/police integration, iOS.

---

## AI service details

### Feature extraction (18 features)

| Feature | Why it detects danger |
|---------|----------------------|
| `mean_speed`, `max_speed`, `speed_std` | High speed = in a vehicle (possible abduction). Erratic speed = struggle. |
| `mean_acceleration`, `max_acceleration` | Sudden braking/acceleration = vehicle event |
| `mean_bearing_change`, `max_bearing_change` | Erratic direction = evasion or being driven around |
| `total_distance`, `displacement`, `distance_ratio` | High distance + low displacement = circling (suspicious) |
| `min/mean/max_safe_zone_dist` | Far from known safe zones = unfamiliar territory |
| `hour_sin`, `hour_cos` | Cyclical time encoding (23:00 and 01:00 are close, not 22 apart) |
| `is_night` | Binary flag for 22:00-05:00 (inherently higher risk in Lagos) |
| `duration_minutes` | Context for other features |
| `stopped_fraction` | High stop fraction after movement = possible forced stop |

### Isolation Forest config

```python
IsolationForest(
    n_estimators=150,      # Stable scores
    contamination=0.05,    # ~5% noise tolerance in training data
    max_features=1.0,      # All 18 features per tree
    random_state=42,       # Reproducible
    n_jobs=-1              # Use all CPU cores
)
```

Semi-supervised: train on normal data only, evaluate against normal + abnormal.

### Score normalization

Isolation Forest `score_samples()` returns roughly [-1, 0] where lower = more abnormal. We negate and clip: `risk = clip(-score, 0, 1)`.

### Explanations

Rule-based on feature thresholds (not SHAP/LIME). Each rule maps directly to a safety concept — easy to understand and defend.

### Simulated training data

- Centred on real Yaba/Lagos coordinates (Yabatech campus, Sabo, Tejuosho Market, UNILAG, Jibowu)
- Normal: commute patterns at walking/bus speeds during expected hours
- Abnormal (5 scenarios): speed spikes, route deviation, unusual hours, unfamiliar areas, sudden stops
- ~200 normal + ~50 abnormal samples
- GPS noise (5-20m jitter) for realism

---

## Frontend design / colours

- **Brown** = primary brand / headers / trust
- **White** = background / surfaces / space
- **Red** = alerts, panic, danger states (deliberate, not decorative)
- Accents: dark neutral for text, muted green for "safe/OK" states
- Clean, uncluttered UI. Colours defined as tokens/variables, never hard-coded hex.

---

## Current status

- **Phase 1 (AI Service):** Complete — model trained, 50 tests passing, API functional
- **Phase 2-6:** Not started

---

## Academic context

Final-year HND2 Computer Engineering project, Yaba College of Technology (Yabatech), Lagos, Nigeria. Team of three contributors. ~3 months to defence. Must be defensible: every contributor should understand and explain the parts they present.
