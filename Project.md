# SafeTrace — AI-Powered Personal Safety & Emergency Alert System

> Working project name: **SafeTrace** (change freely).
> This document is the source of truth for the project. Read it fully before generating any code.

---

## 1. What we are building

A personal safety system for the Nigerian context that detects when something has gone wrong, preserves evidence before a phone can be seized or switched off, and escalates a located, proof-backed alert through a family-and-agency responder hierarchy.

It has **three software parts plus an optional hardware tracker**, all integrated through a single cloud backend (Firebase):

1. **Android app** (Flutter) — used by the protected person and their family members. Registration, family groups, panic button, live location, evidence capture.
2. **Python AI service** (FastAPI + scikit-learn) — learns a user's normal movement pattern and flags anomalies as a risk score. **This is our own model — no LLM, no external AI API.**
3. **Web dashboard + landing page** (React) — landing page is the public front door with two paths (individual or agency); dashboard is used by the security agency to monitor live alerts, location, and captured evidence.
4. **Hardware tracker** (optional tier, DIY) — a self-built ESP32 + GPS + GSM device that writes location to the same Firebase, as an alternative tracking source for people who may not always carry a phone. See section 13.

---

## 2. Core principles (read carefully — these shape every decision)

- **A switched-off phone sends nothing.** We do NOT claim to track or record a dead phone. Instead, the moment a phone goes offline / battery is pulled / signal drops, that is itself a *trigger event*, and we preserve the **last known location, time, speed and direction**.
- **Evidence must leave the phone before the phone dies.** On any trigger, the app captures a photo + location burst and **uploads to the cloud immediately**, THEN raises the alarm. The evidence survives even if the phone is destroyed one second later. This is the project's standout feature.
- **The AI is our own work.** Anomaly detection is built with Python/scikit-learn (Isolation Forest). We must be able to explain and defend every part of it. No LLM is used in the defence version.
- **Built for a low-response environment.** The value is not "tracking" (telcos already do that) — it is detecting trouble automatically, preserving proof, and delivering an actionable alert to a responder.
- **Cost-conscious.** Everything runs on free tiers (Firebase Spark, Render free, Google Maps free tier). No paid services required.

---

## 3. Trigger types (how an alert fires)

1. **Manual panic trigger** — button in app, or hidden gesture (e.g. press volume buttons rapidly). Most reliable. Always present.
2. **Inactivity / check-in trigger** — user sets a check-in window ("check on me in 2 hours"). If they don't confirm safety, the system escalates. Runs server-side via a scheduled job (Firebase Cloud Scheduler / scheduled Cloud Function, or a cron on the Python service).
3. **AI anomaly trigger** — the Python service flags abnormal movement (route deviation, abnormal speed, unusual area/time) → risk score crosses threshold → system sends an "Are you okay?" check-in → if no safe response, escalate.
4. **Phone-offline trigger** — sudden loss of signal / shutdown during an active journey records last-known data and flags it.

---

## 4. Responder hierarchy (escalation flow)

- A group of people **create a Family**. During family creation they **must select a nearest fallback security agency**.
- An individual with no family **registers directly under an agency**.
- On alert: **all family members are notified first** → any family member can **escalate to the linked security agency** → agency sees it on the **web dashboard** with location + evidence.

---

## 5. Authentication & registration flow

There are **two distinct kinds of users**, served on two different platforms but backed by the **same Firebase project**:

- **Personal users** (individuals + families) → use the **Android app**. They are the people being protected.
- **Agency users** (security agency / vigilante staff) → use the **web dashboard**. They are the responders.

### Landing page (web) — the public front door

A single landing page on the web with **two clearly-labelled paths**:
- **"I want to be protected"** → leads to the Android app download / Play Store link. Personal users sign up *in the app*, not on the web, because the safety features require the phone.
- **"I represent a security agency"** → leads to the agency registration form on the web.

This single front door is for clarity and demo flow. It does not change the data model — both paths still write to the same Firebase.

### Agency signup (web only)

1. An agency admin visits the landing page → clicks the agency path → fills the registration form (agency name, office address, area of operation, admin email + password, contact phone).
2. The agency account is created with `status: "pending"`. **It is NOT visible to personal users yet.**
3. A platform admin (us, for the defence version) reviews and flips `status` to `"verified"` in Firestore. This prevents anyone from registering a fake agency and receiving real alerts.
4. Once verified, the agency appears in the searchable list shown to personal users during signup.
5. The agency admin can then log in to the dashboard. Additional staff accounts can be added under the same agency (simplify for defence: one admin per agency is enough).

### Personal signup (Android app)

1. User downloads the app and taps "Sign up" → enters name, phone, email, password, basic profile (emergency contacts, photo).
2. **In-app fork: "Create or join a family"** OR **"Register directly under an agency"**.
3a. **Family path:**
   - "Create family" → name the family → app shows a **family code** (e.g. `ADK-4429`) and/or QR → user **must then pick a backup security agency** from the verified list (nearest shown first).
   - "Join family" → enter family code → automatically linked to the family and its existing backup agency.
3b. **Direct-agency path:** pick an agency from the verified list. No family is created.
4. **Invariant:** every personal user must end up with at least one responder — either a family with members, or a direct agency link, or both. There is no "skip" option.

### Worked examples

- **Tola, with family:** signs up → creates "Adekunle Family" → picks Lagos Watch Security as backup. Her sister Bisi joins with the code; the backup agency is already set. When Tola hits panic → Bisi + other family alerted → any of them escalates → alert appears on Lagos Watch's dashboard with location + evidence.
- **Mr. Olu, alone:** signs up → picks "register directly under an agency" → picks Lagos Watch Security. No family. His alerts go straight to the dashboard.

### Same Firebase, different roles

The Android app and web dashboard share the same Firebase project (same `.env` config values). Separation of who-can-do-what is enforced by:
- **User documents** carry a `role` field (`personal` / `agency_staff`) and a tying ID (`familyId`, `directAgencyId`, or `agencyId`).
- **Firestore security rules** enforce access (e.g. agency staff can only read alerts assigned to their agency; family members can only see each other's data).
- **Client apps** simply don't expose the wrong screens to the wrong users (the Android app has no agency signup; the dashboard has no family signup).

### Data model (rough Firestore collections)

- `agencies` — each agency, with `status` (`pending` / `verified`), area, contact.
- `families` — each family, with `joinCode`, `memberIds[]`, `backupAgencyId`.
- `users` — each personal user, with `familyId` (nullable) and `directAgencyId` (nullable). At least one must be set.
- `agencyUsers` — staff accounts that log into the dashboard, each with an `agencyId`.
- `alerts`, `locations`, `evidence` — the operational data driven by triggers (see section 3).

---

## 6. The "Where is X?" assistant

A family member can ask "Where is Tola now?" and get an accurate status reply.

- **Defence version: rule-based (no LLM).** Our own Python/Dart code reads the database and formats a reply, e.g.:
  *"Tola: last seen 14 min ago near Yaba, moving ~60 km/h toward an unmonitored area, phone now offline. This is unusual for this time."*
- It reports current location if the phone is on, or last-known location + time of contact loss if off. It never claims data from a dead phone.
- **Future work:** a natural-language conversational version using an LLM. NOT built for defence.

---

## 7. Tool stack (all free tier)

| Part | Tech |
|------|------|
| Android app | React (Vite) + Capacitor, `@capacitor/camera`, `@capacitor/geolocation`, Firebase JS SDK, react-leaflet |
| AI service | Python 3.11+, FastAPI, scikit-learn (Isolation Forest), pandas, numpy, uvicorn |
| Web dashboard + landing | React (Vite), Firebase JS SDK, a map lib (Google Maps JS API or react-leaflet/OpenStreetMap) |
| Backend / glue | Firebase: Authentication, Firestore, Cloud Storage, Cloud Messaging (FCM) |
| Scheduling | Firebase Cloud Scheduler / scheduled Cloud Function (or cron on the Python host) |
| AI hosting | Render free tier (for the FastAPI service) |
| Maps | Google Maps API free tier (display only) OR OpenStreetMap (fully free) |

### Why Firebase (and not Supabase)

Supabase was considered. Firebase was chosen because:
1. **Real-time location updates** are Firebase's strongest use case; the dashboard, family, and alerts all depend on live data pushing to all clients.
2. **Cloud Messaging (push notifications) is built in and free.** Alerts depend on it. With Supabase we'd bolt on a separate service.
3. **Flutter + Firebase is the most documented pairing** on the internet (both are Google products). This matters on a 3-month timeline.

Supabase would be the better choice for a heavily relational SQL app or one needing self-hosting. Neither applies here. Record this in `DECISIONS.md` for the defence.

### Integration model

All parts read/write the **same Firebase project**. The Android app and web dashboard share the same Firebase config (`.env`) values — this is correct and required for them to see the same data. Separation between user types is handled by user role fields and Firestore security rules, not by separate Firebase projects. Each component can be built and tested independently. Firebase is the glue.

---

## 8. Monorepo structure

```
safetrace/
├── PROJECT.md                 # this file
├── DECISIONS.md               # running log of technical decisions + why
├── README.md
├── .gitignore
├── ai-service/                # Python FastAPI + scikit-learn  (BUILD FIRST)
│   ├── app/
│   │   ├── main.py            # FastAPI entry, endpoints
│   │   ├── model/
│   │   │   ├── train.py       # train Isolation Forest on movement data
│   │   │   ├── predict.py     # score a movement sample
│   │   │   └── features.py    # feature engineering (speed, deviation, time-of-day, etc.)
│   │   ├── data/
│   │   │   └── simulate.py    # generate realistic normal + abnormal movement histories
│   │   └── schemas.py         # request/response models (pydantic)
│   ├── tests/
│   ├── requirements.txt
│   └── README.md
├── mobile/                    # Flutter Android app
│   └── (flutter project)
├── dashboard/                 # React web dashboard + landing page
│   └── (vite react project)
└── hardware/                  # ESP32 firmware + wiring notes  (optional tier)
    └── (arduino/platformio project)
```

---

## 9. Build phases (3-month timeline, 3-person team)

**Phase 1 — AI service (FIRST):**
- `simulate.py`: generate normal routes (home↔school↔church patterns) + abnormal samples (sudden speed, off-route, unusual area/time).
- `features.py`: turn raw GPS points into features (speed, bearing change, distance from expected route, time-of-day, distance from known safe zones).
- `train.py`: train Isolation Forest, save model.
- `predict.py` + `main.py`: FastAPI endpoint that takes a movement sample and returns a risk score (0–1) + flag.
- Tests + a simple way to demo it (curl / Swagger UI).

**Phase 2 — Firebase + data model:** auth, Firestore collections (users, families, agencies, alerts, locations, evidence), storage rules.

**Phase 3 — Android app:** registration with in-app fork (family / direct-agency), live GPS, panic button, evidence capture → instant upload → then alert, last-known + offline detection, rule-based "Where is X?".

**Phase 4 — Web dashboard + landing page:** landing page (two doors), agency signup + verification flow, agency dashboard with live alert list, map view, evidence view, alert status.

**Phase 5 — Integration + escalation logic + check-in scheduler.**

**Phase 6 — Polish, demo data, defence prep.**

**Parallel — Hardware tracker** (see section 13): owned by one team member, runs alongside phases 1–5, drop-dead cutoff 3 weeks before defence.

Out of scope for defence (state as **future work**): LLM conversational bot, audio recording, sensor auto-trigger, real agency/police integration, iOS, per-member backup agency in a family.

---

## 10. Frontend design / colours

Primary palette: **Brown, White, Red.** Additional accent colours allowed as needed.
- Brown = primary brand / headers / trust.
- White = background / surfaces / space.
- Red = alerts, panic, danger states (use deliberately, not decoratively).
- Suggested accents: a dark neutral (near-black) for text, a muted green for "safe/OK" states.
Keep the UI clean and uncluttered. Define colours as tokens/variables, never hard-coded hex scattered across files.

---

## 11. Conventions & rules for Claude Code

- **Git commits and GitHub: do NOT add Claude / Anthropic / any AI as a co-author or contributor.** Do not add `Co-authored-by` trailers, AI signatures, or "Generated with" lines to commits, PRs, or any file. This project has **three human contributors**, each committing from their own machine under their own Git identity — so commit authorship is set by whoever is running the commit. The only rule here is that AI must never be listed as an author or co-author; the human running the commit is the sole author of that commit.
- Use clear, conventional commit messages (e.g. `feat: add isolation forest training`).
- Keep secrets (API keys, Firebase config, service accounts) out of git — use `.env` and add it to `.gitignore`.
- Write small, testable modules. Add a short README in each part explaining how to run it.
- Explain assumptions in comments where logic is non-obvious (especially the AI features).
- Prefer simple, defensible solutions over clever ones — this is a student project that must be defended verbally.
- The author writes in plain, conversational English; keep generated docs/readmes simple, not over-polished.
- Record significant technical decisions (and *why*) in `DECISIONS.md` as they happen.

---

## 12. Author / academic context

- Final-year HND2 Computer Engineering project, Yaba College of Technology (Yabatech), Lagos, Nigeria.
- Team of **three contributors**, each committing from their own machine under their own Git identity. Coordinate via branches and pull requests to avoid clashes on the monorepo.
- ~3 months to defence.
- Must be defensible: every contributor should understand and be able to explain the parts they present.

---

## 13. Hardware tracker (optional DIY tier)

A self-built GPS tracker that acts as an alternative location source, for people who may not always carry a phone, or as a discreet backup. **It is an optional bonus tier — the software system is the core that must work. The hardware is decoupled so that if it slips, nothing else breaks.**

### Components (full shopping list)

**Core modules:**
- **ESP32 dev board** — the controller (built-in WiFi/Bluetooth; can use WiFi when available, GSM otherwise). Search: *"ESP32 DevKit V1 board"*.
- **NEO-6M GPS module** — reads latitude/longitude from satellites. Search: *"NEO-6M GPS module with antenna"*.
- **SIM800L GSM module** — sends data to Firebase over the mobile network. Search: *"SIM800L GSM module"*. Note: 2G only — see network caveat below.
- **SIM card** with a small data bundle (MTN / Glo / Airtel / 9mobile — any Nigerian network).

**Power (most-underestimated part):**
- **3.7V LiPo battery** (e.g. 2000mAh). Search: *"3.7V lipo battery 2000mAh"* or *"3.7V 18650 lithium battery"*.
- **1000µF electrolytic capacitor(s)** — mandatory across SIM800L power lines. Search: *"1000uF 16V electrolytic capacitor"*.
- **Buck converter (recommended)** for stable ~4V to SIM800L. Search: *"MP1584 buck converter"* or *"LM2596 buck converter"*.

**Prototyping (NOT part of the final device):**
- **Breadboard + jumper wires** for testing only. Once the wiring works, move to a **perfboard** (search: *"perfboard prototype board"*) which you solder onto. The final device contains the perfboard, not the breadboard.

**Optional:**
- **SIM800L external antenna** for stronger signal (some modules include one).
- **Project enclosure / case** — see "Form factor / disguise" below.

**Where to buy in Lagos:** Computer Village (Ikeja) for all modules; or online (Jumia, local electronics sellers). Buy **2 of each module** if budget allows — SIM800L especially is failure-prone; spares save a panic week.

### How it integrates (the whole point)
The tracker only does one job: **read GPS → write location to the same Firebase** the app and dashboard already use. Each location document carries a `source` field set to `"hardware"` (vs `"phone"`). Because of this:
- The web dashboard displays it with no changes.
- The AI anomaly detection scores it with no changes (it's just lat/long over time).
- That one `source` field is the entire integration surface.

### Wiring summary

ESP32 talks to both modules via UART (2 wires each, cross-over: TX → RX, RX → TX). Common pins used (configurable in firmware): NEO-6M on GPIO16/17, SIM800L on GPIO26/27.

**Critical — power:**
- The SIM800L needs 3.7V–4.2V with **current spikes up to ~2A** when transmitting. **Do NOT power it from the ESP32 3.3V pin** — it will reset and never register on the network. Power it from the LiPo (optionally via a buck converter to ~4V).
- Place a **1000µF capacitor across the SIM800L's VCC/GND**, right next to the module, to absorb spikes. Two capacitors is safer than one.
- **All grounds must connect:** ESP32 GND, SIM800L GND, and battery GND must share one common ground. If not, nothing works.

### Network caveat — 2G in Nigeria

The SIM800L is a **2G-only** module. There is an official long-term plan to phase out 2G in Nigeria, but as of 2026 it is still widely available (over half of Nigerian mobile subscribers still use 2G/feature phones), and major operators have spectrum licensed through 2037. So **2G/SIM800L is fine for the defence build**. In the report, note that a production version would use a 4G module (e.g. **SIM7600**) — that's a good "future work" line. If you want to skip 2G entirely now, the SIM7600 is a drop-in conceptually but costs more and has fewer tutorials.

### Build order (own as a parallel workstream, one person)
1. Buy parts (Computer Village, Jumia).
2. Get the NEO-6M printing coordinates to serial, alone — **test outdoors**, the module needs a clear view of the sky for first satellite lock.
3. Get the SIM800L registering on the network and making one test HTTP request (the hard part — power is usually the issue).
4. Combine: GPS reading → SIM800L → Firebase write.
5. Move from breadboard to a soldered perfboard.
6. Mount in the chosen enclosure.

### Form factor / disguise

The goal is concealment — a tracker an attacker doesn't notice or destroy. The realistic size floor is **keychain / pendant / small-box**, not ring or earring (no room for GPS antenna + radio + battery).

**Preferred disguise: a power bank.** Reasons:
- People carry power banks everywhere; not suspicious.
- Power banks are *expected* to contain a battery and circuitry — perfect cover.
- A gutted cheap power bank gives a ready-made shell of roughly the right size.
- It can even still function as a power bank, making the disguise fully convincing.

Other workable options: TV remote casing, concealment by placement (lining of a bag, inside a thick book, in a flask).

**Avoid: Rubik's cube.** People pick cubes up and twist them — a non-turning cube is instantly suspicious. Good disguises are objects people *don't* fiddle with.

### Drop-dead date
Set a cutoff ~3 weeks before defence. If the hardware isn't reliably writing to Firebase by then, present it as a working proof-of-concept prototype and lead the demo with the software. Costs nothing elsewhere because it's decoupled.

---

## 14. QR emergency-ID card (optional, NOT a tracker)

A QR code is static printed data — it has no GPS, battery, or radio, so it **cannot track**. Do not present it as a tracker. What it *can* be: an **emergency-ID / quick-registration card**. The QR encodes a profile/ID; when scanned (by a good Samaritan, agency, or during onboarding) it links to the registered person's emergency contacts / family in the app. Buildable and useful — just framed as identity, not tracking.