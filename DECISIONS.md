# Technical Decisions Log

Running record of significant technical choices and why we made them. Reference this during defence prep.

---

### 1. Firebase over Supabase

**Decided:** Project start

Supabase was considered. Firebase was chosen because:

- **Real-time location updates** are Firebase's strongest use case. The dashboard, family map, and alert feed all depend on live data pushing to all clients via `onSnapshot()`. Supabase's real-time is functional but less battle-tested at scale.
- **Cloud Messaging (FCM) is built in and free.** Alert notifications depend on it. With Supabase we'd need a separate push notification service.
- **React + Firebase is heavily documented.** On a 3-month timeline with a 3-person team, available tutorials and examples matter.

Supabase would be better for a heavily relational SQL app or one needing self-hosting. Neither applies here.

---

### 2. React + Capacitor over Flutter

**Decided:** Project start

Project.md section 1 originally said Flutter. We switched to React (Vite) + Capacitor because:

- The team had stronger React experience than Dart/Flutter.
- Capacitor gives us a single codebase that runs in the browser during development and compiles to a native Android APK for production. Faster iteration.
- The web dashboard is also React, so shared knowledge and patterns across both apps.
- Capacitor plugins exist for everything we need: camera, geolocation, background geolocation.

Trade-off: Flutter has better native performance for heavy animations. Our app is mostly maps and forms — Capacitor handles that fine.

---

### 3. Isolation Forest for anomaly detection

**Decided:** Phase 1

We needed an ML model that flags unusual GPS movement without needing labelled "danger" examples (we don't have real kidnapping data).

- **Isolation Forest** is designed for exactly this: train on normal data, flag deviations. Semi-supervised — no need for balanced positive/negative labels.
- **scikit-learn** implementation is mature, well-documented, and small enough to deploy on a free tier (model file is ~1.9 MB).
- **150 estimators, 0.05 contamination, 0.55 threshold** — tuned against simulated Lagos commute data to balance detection vs false alerts.
- **18 hand-crafted features** (speed, acceleration, bearing change, safe zone distance, time-of-day, etc.) give us full explainability. We can tell a user *why* they were flagged.

Alternatives considered:
- **TensorFlow/PyTorch LSTM** — more powerful for sequence data, but harder to explain in defence, heavier to deploy, and overkill for our feature set.
- **Simple threshold rules** — too many false positives. A person taking a different bus route would trigger alerts constantly.

---

### 4. OpenStreetMap over Google Maps

**Decided:** Phase 3

- **Free with no API key.** Google Maps free tier has usage limits and requires billing setup. OSM has none.
- **Privacy-friendly.** No location data sent to Google's servers for tile rendering.
- **react-leaflet** is a mature, well-maintained React wrapper for Leaflet.

Trade-off: OSM tiles are less polished than Google's, and we lose Google's geocoding/places API. For our use case (displaying markers and zones on a map), OSM is sufficient. We apply a desaturated filter to the tiles for a cleaner look.

---

### 5. LLM for "Where is X?" chat

**Decided:** Pre-defence review

The chat assistant uses Groq API (Llama 3.3 70B) to answer family member location queries in natural language.

- The LLM receives real-time location data from Firestore as context. It does not hallucinate locations — it can only report what the database contains.
- The LLM is a **presentation layer**, not the intelligence. Our Isolation Forest model is the AI we built. The LLM turns database fields into readable sentences.
- **Groq** was chosen over OpenAI because it has a generous free tier and faster inference.

Originally the spec said "rule-based, no LLM for defence." We changed this because the natural-language interface significantly improves the user experience for non-technical family members, and the architecture is defensible: we're clear about what's our model vs what's a third-party API.

**Defence framing:** "The anomaly detection AI is our own trained model. The chat uses an LLM as a formatting layer — same way a calculator app might use a text-to-speech API to read results aloud."

---

### 6. Evidence-first alert design

**Decided:** Phase 3

When a panic alert fires, the app captures a photo and uploads it to Cloud Storage **before** creating the alert document. This is the project's standout feature:

- A phone can be seized or destroyed within seconds of an incident. If we alert first and capture second, the evidence might never arrive.
- Upload order: camera capture → Cloud Storage upload → get URL → create alert doc with evidence URL. If the phone dies after upload but before the alert doc, the evidence still exists in storage.
- Trade-off: there's a brief delay (~1-3 seconds) between pressing panic and the alert appearing on the dashboard. Acceptable given the evidence preservation benefit.

---

### 7. Hardware tracker integration via FastAPI

**Decided:** Pre-defence review

The ESP32 hardware tracker sends GPS data via HTTP POST to the FastAPI service, not directly to Firestore.

- The ESP32's SIM800L module can do simple HTTP but not the Firebase client SDK. A REST endpoint is the simplest interface.
- **FastAPI as middleman** lets us authenticate the device (SHA-256 key verification), validate the data, and write to Firestore via the Admin SDK — all in one step.
- Device authentication uses a pre-shared key (32-char hex) hashed with SHA-256 + per-device salt. Not bcrypt, because the key is verified on every GPS ping (potentially every 30-60 seconds) and the key is random, not human-chosen.
- Device credentials are generated client-side in the mobile app using Web Crypto API, with only the hash stored in Firestore. The plaintext key is shown once to flash onto the ESP32.

---

### 8. Denormalized alert documents

**Decided:** Phase 2

Alert documents contain copies of data that also lives in other collections (userName, familyId, agencyId, locationName, trajectory, timeline).

- **Read efficiency:** The dashboard and mobile app can display a full alert without joining across collections. Important for real-time updates.
- **Audit trail:** An alert is a snapshot of the moment. If a user changes their name later, the alert still shows who they were when it fired.
- **Offline resilience:** A single document fetch gives the full picture.

Trade-off: data duplication means updates to user profiles don't propagate to historical alerts. This is acceptable — alerts are point-in-time records.

---

### 9. Plain CSS with design tokens

**Decided:** Phase 3

- **CSS custom properties** (tokens) in `tokens.css` define the full design system: colours, spacing, shadows, radii, transitions.
- **Component-scoped CSS files** (Home.css, Map.css, etc.) rather than CSS Modules or Tailwind.
- The team was more comfortable with plain CSS. Tailwind adds a learning curve and a build dependency. CSS Modules add file naming conventions. Plain CSS with well-named classes and a token system is simple and sufficient.

---

### 10. Deployment on Render free tier

**Decided:** Pre-defence review

- **Render** chosen over Heroku (no free tier anymore), Railway (limited free hours), and Fly.io (requires credit card).
- Docker-based deployment. The trained model is baked into the image during build (since *.joblib is gitignored).
- Firebase credentials passed via `FIREBASE_SERVICE_ACCOUNT_JSON` env var (JSON string) since Render can't mount files.
- Free tier spins down after 15 minutes of inactivity. Cold start takes ~30 seconds. Acceptable for a defence demo — wake it up before presenting.

---

### 11. Background geolocation strategy

**Decided:** Phase 3

- **Native (Android):** `@capgo/background-geolocation` plugin with 30-metre distance filter. Runs continuously in the background with a persistent notification.
- **Browser fallback:** Polls `Capacitor.Geolocation.getCurrentPosition()` every 60 seconds. Less accurate but works during development without building to Android.
- Location history written to Firestore every 5 minutes (throttled) to avoid excessive writes on the free tier.

---

### 12. 2G (SIM800L) for hardware tracker

**Decided:** Hardware phase

The SIM800L is a 2G-only GSM module. 2G is still widely available in Nigeria (over half of mobile subscribers still use 2G), and major operator spectrum licenses run through 2037.

- **Cost:** SIM800L modules are cheap and widely available at Computer Village, Ikeja.
- **Tutorials:** Far more documentation and community support than 4G alternatives (SIM7600).
- **Future work:** A production version would use a 4G module (SIM7600) — noted in the report.
- **TLS limitation:** SIM800L can't do modern TLS reliably. The hardware endpoint accepts plain HTTP. Device key authentication provides identity verification, though not encryption in transit. Acceptable for a student prototype.
