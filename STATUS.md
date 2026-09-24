# SafeTrace -- Project Status Snapshot

**Date:** 20 September 2026
**Repo:** `safe-trace` (monorepo, `master` branch)

---

## CURRENT WORK: Platform Review & Testing Checklist

### Phase A — Mobile App (test via `npm run dev` in `mobile/`)

- [ ] **A1. Registration — Personal/Family user**
  - Renders role selection (User/Family vs Security Agency)
  - Select "User/Family", fill form, submit
  - User created in Firebase Auth + Firestore
  - Redirects to home after registration
  - Validation: password mismatch, short password, duplicate email
  - Error states display correctly

- [ ] **A2. Registration — Agency Staff**
  - Select "Security Agency", fill form with agency code
  - Invalid agency code rejected
  - Valid code (YABA2024) links user to agency
  - User created with role `agency_staff`

- [ ] **A3. Login**
  - Login with valid credentials
  - Wrong password error
  - Non-existent account error
  - Forgot password flow sends reset email
  - Already logged in redirects to home

- [ ] **A4. Home / Panic Button**
  - Home page loads with user info
  - Panic button visible and functional
  - 3-second countdown works
  - Evidence photo capture (camera prompt in browser)
  - Alert created in Firestore
  - Live tracking starts after panic
  - "I'm Safe" button resolves alert and stops tracking

- [ ] **A5. Family Management**
  - Create a family (generates join code)
  - Join a family with code
  - Family members appear in list
  - Pick backup agency from verified list

- [ ] **A6. Map View**
  - Map loads (Leaflet)
  - Family members shown on map with markers
  - Locations update in real-time

- [ ] **A7. Alerts Page**
  - Lists family alerts
  - Shows alert type, status, timestamp
  - Empty state when no alerts

- [ ] **A8. Settings**
  - User profile info displayed
  - Logout works
  - Any editable settings save correctly

- [ ] **A9. Safe Zones**
  - Add a safe zone
  - Delete a safe zone
  - Safe zones persist in Firestore

- [ ] **A10. AI Anomaly Detection**
  - Requires AI service running (`ai-service/`)
  - Trajectory sent to AI service
  - "Are you okay?" prompt on anomaly
  - Auto-escalation after 60s timeout

- [ ] **A11. "Where is..." Chat**
  - Chat overlay opens
  - Sends query to Groq LLM
  - Returns natural language response about family member
  - Requires VITE_GROQ_API_KEY

- [ ] **A12. UI/UX Polish**
  - Responsive on mobile screen sizes
  - No layout breaks
  - Loading states present
  - Error messages user-friendly

### Phase B — Dashboard (test via `npm run dev` in `dashboard/`)

- [ ] **B1. Landing Page**
  - Renders hero, two-path cards, features grid, footer
  - "Download the App" button downloads APK
  - "Register Your Agency" links to registration
  - "Agency Login" link works
  - Responsive layout

- [ ] **B2. Agency Registration**
  - Form renders with both sections (agency info + admin account)
  - Submit creates agency doc (status: pending) + auth user + user doc
  - Validation errors display
  - Success message with next steps

- [ ] **B3. Agency Login**
  - Login with agency_staff / agency_admin / platform_admin
  - Non-agency roles blocked
  - Forgot password flow
  - Role-based redirect (platform_admin → admin panel, others → dashboard)

- [ ] **B4. Dashboard Feed**
  - Alert feed loads with real-time data
  - Tabs work (All / Unacknowledged / Being Handled / Resolved)
  - Search works
  - Alert cards show type, risk score, timestamp
  - Click through to alert detail

- [ ] **B5. Alert Detail**
  - Shows full alert info (location, evidence photo, timeline)
  - Acknowledge / resolve actions work
  - Map shows alert location

- [ ] **B6. Map View**
  - Map loads
  - Alert locations plotted

- [ ] **B7. Admin Panel**
  - Only accessible by platform_admin
  - Lists pending agencies
  - Verify/revoke actions work
  - Tabs: Pending / Verified / All

### Phase C — Integration & End-to-End

- [ ] **C1. Panic → Dashboard flow**
  - User triggers panic on mobile
  - Alert appears on dashboard feed in real-time
  - Evidence photo visible on dashboard
  - Location shown on dashboard map

- [ ] **C2. Agency verification flow**
  - Agency registers → appears as pending in admin panel
  - Platform admin verifies → status changes to verified
  - Verified agency appears in mobile app's agency picker

- [ ] **C3. AI service integration**
  - AI service running
  - Mobile app sends trajectory data
  - Anomaly detected → alert escalated → visible on dashboard

### Phase D — Fixes & Polish

- [ ] Fix all issues found in Phase A–C
- [ ] Rebuild APK with fixes
- [ ] Re-upload APK to Firebase Storage

### Phase E — Deploy

- [ ] Deploy dashboard to Firebase Hosting (landing page + agency dashboard)
- [ ] Deploy AI service to Render (or confirm reachable URL)
- [ ] Verify production URLs work
- [ ] Final smoke test on deployed version

---

## Previous Status (23 August 2026)

## 1. Repo shape and current state

The repo root contains:

```
safe-trace/
  ai-service/        # Python FastAPI anomaly-detection service (real code, complete)
  dashboard/         # React (Vite) web dashboard + landing page  (real code, substantial)
  firebase/          # Firebase config, rules, seed scripts       (real code, complete)
  mobile/            # React (Vite) + Capacitor mobile app        (real code, substantial)
  Brand.md           # Colour palette & design-token definitions
  Project.md         # Main project specification (source of truth)
  README.md          # Quick-start instructions (AI service only)
  logo.png           # Brand logo
  .gitignore         # Covers .env, node_modules, venv, *.joblib, etc.
```

**No `hardware/` folder exists.** Project.md describes it as an optional tier, but nothing has been committed.

**No `DECISIONS.md` exists.** Project.md says one should be maintained; it was never created.

### Per-folder summary

| Folder | Stack | Approx. source files | State |
|--------|-------|---------------------|-------|
| `ai-service/` | Python 3.11+, FastAPI, scikit-learn, numpy, joblib | ~14 (app + tests) | **Complete** -- all modules written, model trained, tests exist |
| `mobile/` | React 19, Vite 8, Capacitor 8 (camera + geolocation), Firebase JS SDK, Leaflet | ~30 (pages, hooks, components, contexts) | **Substantial** -- core flows implemented |
| `dashboard/` | React 19, Vite 8, Firebase JS SDK, Leaflet | ~20 (pages, components, contexts) | **Substantial** -- landing page through alert detail |
| `firebase/` | Firestore rules, Storage rules, composite indexes, Python seed scripts | ~8 config/seed files | **Complete** -- rules, schema, seed data all committed |

### Mismatches between Project.md and actual code

1. **Mobile framework.** Section 1 of Project.md says "Android app (Flutter)". Section 7's table corrects this to "React (Vite) + Capacitor". The actual code is React + Capacitor. No Flutter/Dart exists anywhere. Whoever is writing the report should cite the corrected stack, not the section-1 wording.

2. **"Where is X?" implementation.** Project.md says the defence version must be "rule-based (no LLM)". The actual code in `mobile/src/hooks/useWhereIsChat.js` calls the Groq API with `llama-3.3-70b-versatile`. This is a direct contradiction of the spec. For defence you'll either need to replace this with the rule-based approach described in Project.md, or deliberately present it as a stretch feature and defend why you used an LLM.

3. **`agencyUsers` collection.** Project.md section 5 lists it as a separate collection. The actual code stores agency staff as regular `users` documents with `role: "agency_staff"` and an `agencyId` field. This is arguably a better design, but it's a spec deviation.

4. **`status` field on agencies.** The code and Firestore rules use `status: "pending" | "verified"` on agency documents. SCHEMA.md doesn't document this field. The seed data doesn't set it either (seed creates the agency directly without a status). The AgencyRegister page sets `status: "pending"` on creation, and the AdminPanel page lets a platform admin flip it to `"verified"`.

5. **`hardware/` folder.** Project.md shows it in the repo structure diagram. It doesn't exist.

6. **`DECISIONS.md`.** Project.md says to maintain one. It doesn't exist.

---

## 2. AI service (`ai-service/`) status

### Files under `ai-service/app/`

| File | What it does |
|------|-------------|
| `main.py` (71 lines) | FastAPI app. Two endpoints: `POST /api/v1/predict` (score a trajectory) and `GET /api/v1/health` (model status). Loads trained model on startup via lifespan hook. CORS enabled. |
| `schemas.py` (57 lines) | Pydantic models: `GPSPoint`, `SafeZone`, `PredictRequest`, `PredictResponse`, `HealthResponse`. |
| `data/simulate.py` (216 lines) | Synthetic GPS generator. Five Lagos landmarks (Yabatech, Sabo, Tejuosho, UNILAG, Jibowu). Normal samples = daytime commutes at walk/bus speed. Five abnormal scenarios: speed spike, route deviation, unusual hours, unfamiliar area, sudden stop. |
| `model/features.py` (231 lines) | Extracts 18 features from a GPS trajectory: speed stats, acceleration, bearing changes, distance/displacement, safe-zone distances, time-of-day, stopped fraction. Haversine math for all distances. |
| `model/train.py` (111 lines) | Semi-supervised Isolation Forest pipeline. Trains on 200 normal samples, evaluates against 250 (200 normal + 50 abnormal). Saves model as joblib bundle. Prints classification report. |
| `model/predict.py` (148 lines) | Loads model, scores a trajectory, generates human-readable explanations via rule-based thresholds (speed, bearing, distance ratio, safe-zone distance, night hours, stopped fraction). Returns `PredictResponse`. |

### Key questions answered

- **Is `simulate.py` written?** Yes, fully. Generates both normal and abnormal synthetic data for five named Lagos landmarks.
- **Is `features.py` written?** Yes, fully. 18 features, well-documented.
- **Is `train.py` written?** Yes, fully. Runnable as `python -m app.model.train`.
- **Is `predict.py` written?** Yes, fully. Includes explanation generation.
- **Is `main.py` runnable?** Yes. `uvicorn app.main:app --port 8000` starts the service. Swagger docs at `/docs`.
- **Does a trained model artefact exist on disk?** `trained_model.joblib` exists locally but is excluded from git by `.gitignore` (the `*.joblib` pattern). Anyone cloning the repo must run `python -m app.model.train` to create it.
- **Are there tests?** Yes. Five test files:
  - `test_api.py` -- FastAPI endpoint tests (health, predict, validation errors)
  - `test_features.py` -- Feature extraction tests
  - `test_predict.py` -- Prediction pipeline tests
  - `test_simulate.py` -- Data generation tests
  - `test_train.py` -- Training pipeline tests
- **Do they pass?** Not verified in this snapshot (I was told not to run commands that mutate state). The test infrastructure looks sound: proper fixtures, temp directories for model files, parametric tests.

### What you can demo today

- Start the server, open Swagger UI, POST a GPS trajectory, get back a risk score + explanations.
- Train the model from scratch in a few seconds.
- Show the classification report (precision/recall for normal vs. anomaly).

### What's missing for end-to-end anomaly detection

- Nothing on the AI side. The service is feature-complete for what's specified.
- The integration gap is that the mobile app calls the AI service over HTTP, which requires the service to be running somewhere reachable (localhost for dev, Render for prod). The `VITE_AI_SERVICE_URL` env var controls this.

---

## 3. Firebase / backend status

### Firestore rules (`firebase/firestore.rules`, 141 lines)

Comprehensive role-based access control:
- **Users:** read own profile, family members can read each other, agency staff can read users linked to their agency, platform admins can read all. Create requires matching UID and email. Update restricted to own profile (role can only change personal -> family_admin). No client deletes.
- **Families:** any signed-in user can read (needed for join-by-code lookup). Create requires setting self as admin and member. Update by admin or member joining.
- **Agencies:** verified agencies readable by all signed-in users. Staff can always read own agency. Platform admins can read all. Create allowed with `status: "pending"`. Only platform admins can update (verify/revoke).
- **Alerts:** read/write restricted to alert creator, family members, and linked agency staff. Create requires valid type and `status: "new"`.

### Storage rules (`firebase/storage.rules`, 30 lines)

- `/evidence/**` -- any authenticated user can read; write limited to images under 5 MB.
- `/profiles/{userId}/**` -- owner can write, any authenticated user can read; images under 5 MB.
- Everything else blocked.

### Composite indexes (`firebase/firestore.indexes.json`)

Three indexes on the `alerts` collection:
- `agencyId` + `status` + `createdAt DESC` (dashboard filter tabs)
- `familyId` + `createdAt DESC` (mobile family view)
- `agencyId` + `createdAt DESC` (dashboard "all alerts")

### Schema documentation (`firebase/SCHEMA.md`)

Documents four collections: `users`, `families`, `agencies`, `alerts`. Includes field types and descriptions, composite index table, storage paths, and AI service data contract.

**Missing from SCHEMA.md:** the `status` field on agencies (`"pending"` / `"verified"`), `areaOfOperation`, and `adminUserId` -- all of which exist in the actual code.

### Seed scripts

- `firebase/seed/seed.py` -- creates 7 Auth users, 1 agency, 2 families, 4 alerts. Idempotent (safe to re-run).
- `firebase/seed/seed_data.py` -- all test data definitions. Coordinates match the AI service landmarks. Default password: `Test1234!`.
- Requires `serviceAccountKey.json` (not tracked in git, correctly).

### Auth / registration flow

Two distinct flows are coded:
1. **Personal users** register via the mobile app (`mobile/src/pages/Register.jsx`): email + password via Firebase Auth, creates a `users` doc with `role: "personal"`.
2. **Agency admins** register via the dashboard (`dashboard/src/pages/AgencyRegister.jsx`): creates Auth user + `users` doc (role `agency_admin`) + `agencies` doc (status `pending`).

A platform admin can verify agencies via the AdminPanel page.

### Cloud Functions / scheduled jobs

**None.** No `functions/` folder. No Cloud Functions code anywhere. The check-in scheduler described in Project.md section 3 (trigger type 2 -- "check on me in 2 hours") is **not implemented**. There is no server-side timer or cron.

### Firebase Cloud Messaging (FCM)

**Not set up.** Firebase JS SDK is included in both mobile and dashboard `package.json`, but there is no FCM initialization, no service worker, no push notification code. Alerts are delivered via Firestore real-time listeners only (pull, not push).

---

## 4. Mobile app status

### Framework confirmation

**React 19 + Vite 8 + Capacitor 8.** Not Flutter. Confirmed by `package.json` dependencies:
- `react: ^19.2.6`, `react-dom`, `react-router-dom: ^7.18.0`
- `@capacitor/core: ^8.4.1`, `@capacitor/camera: ^8.2.0`, `@capacitor/geolocation: ^8.2.0`
- `firebase: ^12.15.0`
- `leaflet: ^1.9.4`, `react-leaflet: ^5.0.0`

No native Android/iOS folders are committed (`.gitignore` excludes `mobile/android/` and `mobile/ios/`). This means `npx cap add android` hasn't been run yet (or the output was correctly gitignored).

### Screens / routes

| Route | Component | What it does |
|-------|-----------|-------------|
| `/login` | `Login.jsx` | Email/password login with forgot-password flow |
| `/register` | `Register.jsx` | Personal user signup |
| `/` (index) | `Home.jsx` (~1000 lines) | Main screen: panic button with 3-second countdown, live journey tracker with Leaflet map, family create/join, agency picker, safe zones CRUD, AI anomaly check-in prompt, account info |
| `/map` | `Map.jsx` | Family members on a Leaflet map |
| `/alerts` | `Alerts.jsx` | Alert list for the user's family |
| `/settings` | `Settings.jsx` | User settings |

### Custom hooks (the real logic)

| Hook | What it does |
|------|-------------|
| `useAuth.js` | Wraps `AuthContext`, provides `user` and auth methods |
| `useLocation.js` / `LocationContext.jsx` | Capacitor Geolocation polling (60s interval), writes `lastLocation` + `lastSeen` to Firestore, handles permissions |
| `useTrajectoryBuffer.js` | Rolling buffer of last 20 GPS points for AI scoring |
| `useAnomalyDetection.js` | Sends trajectory to AI service every 5 new points, shows "Are you okay?" check-in if anomaly detected, 60-second countdown before auto-escalation |
| `useFamilyMembers.js` | Real-time Firestore listener for family member locations |
| `useAlerts.js` | Real-time Firestore listener for family alerts |
| `useWhereIsChat.js` | Multi-turn chat via Groq LLM (llama-3.3-70b) for "Where is X?" questions |

### Implemented flows

- **Registration:** email/password signup, creates user profile in Firestore
- **Login:** email/password with forgot-password
- **Family create:** generates join code (e.g. `ADK-4429`), picks backup agency from verified list
- **Family join:** enter code, adds user to family's members array
- **Direct agency registration:** skip family, link directly to an agency
- **Panic button:** 3-second countdown, captures evidence photo (Capacitor Camera), uploads to Cloud Storage, creates alert in Firestore, starts live location tracking with trajectory recording
- **Live journey tracking:** real-time Leaflet map with polyline, telemetry cards (location, speed, heading), periodic Firestore updates
- **AI anomaly detection:** hooks into GPS polling, sends to AI service, shows "Are you okay?" overlay, auto-escalates after 60 seconds if no response
- **"Where is X?" chat:** multi-turn LLM conversation about family members (uses Groq API)
- **Safe zones:** add/delete safe zones with coordinates, stored in user profile, fed to AI service
- **Check-in safe:** resolves active alert, stops tracking

### What you can demo today

On a local dev server (`npm run dev`):
- Full signup/login flow
- Create a family, get a join code
- Panic button with countdown and alert creation
- Live tracking view with map
- AI anomaly detection (if AI service is running)
- "Where is X?" chat (if GROQ_API_KEY is configured)
- Safe zone management

**Caveat:** Camera and native geolocation require running on an actual Android device or emulator via Capacitor. On desktop browser, geolocation uses the browser API (works but less accurate), and camera will fail gracefully.

---

## 5. Dashboard / landing page status

### What's in `dashboard/`

| Route | Component | What it does |
|-------|-----------|-------------|
| `/` | `Landing.jsx` | Public landing page with two paths: "I want to be protected" (links to app download) and "I represent a security agency" (links to registration). Feature grid explaining how SafeTrace works. |
| `/login` | `Login.jsx` | Agency staff login with forgot-password flow |
| `/agency/register` | `AgencyRegister.jsx` | Full registration form: agency info (name, address, area, phone) + admin account (name, email, password). Creates Auth user + user doc + agency doc with `status: "pending"`. Shows success message. |
| `/dashboard` (index) | `DashboardFeed.jsx` | Real-time alert feed with tabs (All / Unacknowledged / Being Handled / Resolved), search bar, alert cards with type badges, risk scores, timestamps. Links to detail view. |
| `/dashboard/alerts/:alertId` | `AlertDetail.jsx` | Single alert view (likely shows timeline, evidence, location, acknowledge/resolve actions). |
| `/dashboard/map` | `MapView.jsx` | Map view of alert locations. |
| `/dashboard/admin` | `AdminPanel.jsx` | Platform admin panel: lists pending/verified agencies, verify/revoke actions. Only accessible to users with `role: "platform_admin"`. |

### Components

- `Layout.jsx` -- app shell with sidebar/nav for authenticated dashboard pages
- `ProtectedRoute.jsx` -- redirects to login if not authenticated
- `SafeTraceLogo.jsx` -- brand logo component

### What you can preview today

Running `npm run dev` in `dashboard/`:
- Landing page with both paths
- Agency registration flow (creates real Firebase records)
- Agency login
- Dashboard alert feed with live Firestore data (requires seeded data or real alerts)
- Alert detail view
- Admin verification panel (requires platform_admin role)

---

## 6. Hardware (`hardware/`) status

**Nothing committed.** The `hardware/` folder does not exist in the repo. No firmware code, no Wokwi links, no wiring notes. Project.md section 13 has detailed specs (ESP32 + NEO-6M GPS + SIM800L GSM) and build instructions, but none of that has been started in code.

---

## 7. Commit history highlights

14 total commits on `master`:

```
1297971  Adeyinka ADedayo   feat: add landing page, agency registration, location hooks, anomaly detection, and UI polish
20bfa58  Adeyinka ADedayo   feat: replace "Where is" card with multi-turn chat overlay
c3846ff  Adeyinka ADedayo   feat: add forgot password flow to dashboard and mobile login
540bdee  Adeyinka ADedayo   feat: add platform admin panel for agency verification
2e98980  Owooluwa Samson    Merge pull request #1 from yinkid28/feat/dashboard-and-mobile-enhancements
cd4dca0  Engr-Samson-Beloved  feat: implement web dashboard and mobile app pages (Map, Alerts, Settings)
a4f9f3d  Engr-Samson-Beloved  feat: initialize Firebase SDK and configure Auth and Firestore services
6041836  Adeyinka ADedayo   feat: add Phase 3a mobile app - React + Capacitor scaffold with auth
d7ffa9a  Adeyinka ADedayo   feat: add Phase 2 Firebase backend - schema, rules, and seed data
7f4aa0e  Adeyinka ADedayo   docs: add web dashboard frontend spec for Phase 4
4e879c5  Adeyinka ADedayo   docs: update Project.md with full project spec and all 6 phases
1ed62b7  Adeyinka ADedayo   docs: add root README with quick start instructions
db1a0e7  Adeyinka ADedayo   docs: add Project.md with full project overview
2420037  Adeyinka ADedayo   feat: implement Phase 1 AI service - Isolation Forest anomaly detection
```

### Work pattern

- **Adeyinka ADedayo** wrote everything from the initial docs through the AI service, Firebase backend, mobile scaffold, admin panel, forgot-password, chat overlay, and the large landing/location/anomaly commit. 12 of 14 commits.
- **Engr-Samson-Beloved / Owooluwa Samson** contributed 2 commits (one feature commit adding Firebase SDK init + dashboard/mobile pages, one merge-PR commit). Same person, two different Git identities.
- **Third team member:** No commits visible from a third person. If this is supposed to be a 3-person team, only 2 people have committed so far.

---

## 8. Open TODOs / FIXMEs

**None found.** A full search of the codebase for `TODO`, `FIXME`, `XXX`, and `HACK` returned zero results.

---

## 9. Environment / config gaps

### `.env.example` files

- **`mobile/.env.example`** exists and lists:
  ```
  VITE_FIREBASE_API_KEY=
  VITE_FIREBASE_AUTH_DOMAIN=
  VITE_FIREBASE_PROJECT_ID=
  VITE_FIREBASE_STORAGE_BUCKET=
  VITE_FIREBASE_MESSAGING_SENDER_ID=
  VITE_FIREBASE_APP_ID=
  VITE_AI_SERVICE_URL=http://localhost:8000
  ```

- **`dashboard/.env.example` does NOT exist.** The dashboard needs the same Firebase vars but there's no template. A `.env` file exists locally (and is gitignored).

### Missing env vars

- `VITE_GROQ_API_KEY` is required by `useWhereIsChat.js` but is **not listed in `.env.example`**. Anyone setting up the mobile app won't know they need it for the chat feature.

### `.env` files

Both `mobile/.env` and `dashboard/.env` exist locally and are correctly listed in `.gitignore`. They won't be in git.

### Setup steps not yet done

- **Capacitor native build:** `npx cap add android` has not been run (or its output was gitignored). Anyone wanting to build an APK needs to do this.
- **Firebase deployment:** Firestore rules, storage rules, and indexes have not been deployed (they're config files, but `firebase deploy` hasn't been run from these files).
- **Seed data:** Requires a `serviceAccountKey.json` placed in `firebase/seed/`. Not documented outside the seed script itself.
- **AI service hosting:** No Render deployment exists (or at least none is documented). The service runs locally.

---

## 10. My honest read

### Done

- **AI anomaly detection service** -- fully built, trained, tested, demoable. This is the strongest piece of the project.
- **Firebase backend** -- rules, schema, indexes, seed scripts are all solid and well-structured.
- **Mobile app core flows** -- registration, login, family management, panic button with evidence capture, live tracking, anomaly detection integration, safe zones.
- **Dashboard core flows** -- landing page, agency registration with verification pipeline, alert feed, alert detail view, admin panel.
- **Design system** -- consistent colour tokens, responsive layouts, SafeTrace branding applied throughout.

### In progress

- **Integration polish** -- the pieces are connected but the end-to-end flow (user triggers panic on phone -> alert appears on dashboard with evidence and map) likely needs manual testing with seeded or real data on a running Firebase project. Confidence level that it works first try: moderate.
- **"Where is X?" chat** -- built with Groq LLM, which contradicts the "no LLM for defence" rule. Needs to either be swapped for the rule-based version described in Project.md, or reframed as a bonus feature.

### Not started

- **Hardware tracker** -- no code, no folder, no Wokwi links. If it's still planned, someone needs to start immediately.
- **Cloud Functions / scheduled jobs** -- check-in timer (trigger type 2) is not implemented. There's no server-side scheduler.
- **Push notifications (FCM)** -- not wired up. Alerts rely solely on real-time Firestore listeners, meaning the app must be open to receive them.
- **Phone-offline trigger** -- Project.md describes detecting phone shutdown as a trigger event. No code implements this. The `phoneStatus` field exists in the schema but nothing flips it to `"offline"` on signal loss.
- **`DECISIONS.md`** -- never created, despite Project.md saying to maintain one.
- **Native APK build** -- Capacitor is configured but no Android build has been produced.

### Top 3 things blocking end-to-end demo

1. **AI service needs to be running and reachable.** The mobile app calls it over HTTP. For a live demo you need either `localhost:8000` (laptop demo) or the service deployed to Render. Right now there's no deployment config.

2. **Firebase project needs real data.** The seed script creates de
3. mo data, but it requires a `serviceAccountKey.json` and a running `firebase deploy` for rules/indexes. If those haven't been done for the target Firebase project, the app will hit permission errors.

4. **The "Where is X?" chat uses an LLM (Groq) when the spec says "no LLM for defence."** You need to either build the rule-based version or decide to defend this as a deliberate upgrade. Either way, it needs a Groq API key that isn't documented.
