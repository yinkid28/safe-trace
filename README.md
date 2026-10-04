# SafeTrace

AI-powered personal safety and emergency alert system for the Nigerian context. Detects anomalous movement, preserves evidence before a phone can be seized, and escalates located, proof-backed alerts through a family-and-agency responder hierarchy.

See [Project.md](Project.md) for full technical details and [DECISIONS.md](DECISIONS.md) for technical decision rationale.

## Architecture

```
mobile/        React (Vite) + Capacitor — Android app for protected persons and families
dashboard/     React (Vite) — web dashboard + landing page for security agencies
ai-service/    Python FastAPI + scikit-learn — anomaly detection + hardware tracker endpoint
firebase/      Firestore rules, indexes, storage rules, seed scripts
hardware/      ESP32 firmware (separate contributor)
```

All components share the same Firebase project. See `firebase/SCHEMA.md` for the data model.

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- A **Firebase project** with Authentication, Firestore, and Cloud Storage enabled

## Setup

### 1. AI Service

```bash
cd ai-service
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
python -m app.model.train
```

Run tests and start the server:

```bash
python -m pytest tests/ -v
uvicorn app.main:app --port 8000
```

API docs at http://localhost:8000/docs

For the hardware tracker endpoint to work, set up Firebase credentials:

```bash
cp .env.example .env
# Edit .env — set GOOGLE_APPLICATION_CREDENTIALS to your service account key path
```

### 2. Mobile App

```bash
cd mobile
npm install
cp .env.example .env
# Edit .env — fill in your Firebase config values, AI service URL, and Groq API key
npm run dev
```

Runs at http://localhost:5173. To build for Android:

```bash
npm run build
npx cap sync android
npx cap open android
```

### 3. Web Dashboard

```bash
cd dashboard
npm install
cp .env.example .env
# Edit .env — fill in your Firebase config values
npm run dev
```

Runs at http://localhost:5174.

### 4. Firebase

```bash
cd firebase
# Deploy rules and indexes
firebase deploy --only firestore:rules,firestore:indexes,storage

# (Optional) Seed test data
cd seed
pip install -r requirements.txt
python seed.py
```

## Environment Variables

Each component has a `.env.example` with the required variables:

| Component | File | Key variables |
|-----------|------|---------------|
| AI service | `ai-service/.env.example` | `GOOGLE_APPLICATION_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Mobile | `mobile/.env.example` | Firebase config, `VITE_AI_SERVICE_URL`, `VITE_GROQ_API_KEY` |
| Dashboard | `dashboard/.env.example` | Firebase config |

## Deployment

The AI service deploys to Render (free tier) via the `render.yaml` at the repo root. See [DECISIONS.md](DECISIONS.md#10-deployment-on-render-free-tier) for details.

## Tests

```bash
# AI service (60 tests)
cd ai-service
python -m pytest tests/ -v
```

## Team

Three contributors, each committing from their own machine under their own Git identity.
