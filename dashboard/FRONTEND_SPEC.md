# SafeTrace Web Dashboard — Frontend Spec

The web dashboard is used by security agency personnel. They log in, see incoming alerts from families linked to their agency, view evidence (photos, location data), and manage alert status. They don't create alerts — alerts come from the mobile app and AI service.

---

## Tech

- React (Vite)
- Firebase JS SDK (Auth, Firestore, Cloud Storage)
- Map library — either Google Maps JS API (free tier) or react-leaflet with OpenStreetMap (fully free)
- No component library requirement, but something lightweight like Shadcn/UI or plain Tailwind would fit

---

## Colour tokens

| Token | Value | Usage |
|-------|-------|-------|
| `brand-primary` | Brown (e.g. `#5C3D2E`) | Headers, sidebar, primary buttons |
| `surface` | White (`#FFFFFF`) | Page background, cards |
| `danger` | Red (e.g. `#DC2626`) | Alert badges, panic indicators, danger states |
| `safe` | Muted green (e.g. `#16A34A`) | "Resolved" status, "OK" states |
| `text-primary` | Near-black (e.g. `#1C1917`) | Body text |
| `text-secondary` | Grey (e.g. `#78716C`) | Timestamps, labels |
| `surface-muted` | Light warm grey (e.g. `#F5F0EB`) | Card backgrounds, table stripes |

Define these as CSS variables or Tailwind config tokens. Never hard-code hex values in components.

---

## Pages

There are 5 pages.

### 1. Login (`/login`)

Simple, centred card on a white background.

```
┌──────────────────────────────────────────────┐
│                                              │
│              SafeTrace logo/name             │
│              (brown, centered)               │
│                                              │
│         ┌──────────────────────┐             │
│         │  Email               │             │
│         ├──────────────────────┤             │
│         │  Password            │             │
│         ├──────────────────────┤             │
│         │  [ Sign In ]  brown  │             │
│         └──────────────────────┘             │
│                                              │
│         Agency staff only.                   │
│         Contact admin for access.            │
│                                              │
└──────────────────────────────────────────────┘
```

- Firebase Auth (email/password)
- On login, check that the user's role in Firestore is `agency_staff` — redirect back if not
- No self-registration. Accounts are created by an admin or seeded

### 2. Dashboard / Alert Feed (`/` — the home page)

This is where agency staff spend most of their time. A list of active alerts, most urgent first.

```
┌─────────┬────────────────────────────────────────────────┐
│         │  Dashboard                          [search]   │
│  LOGO   │                                                │
│         │  ┌─────────┬──────────┬──────────┬──────────┐  │
│ ─────── │  │ All (12) │ New (5)  │Active (4)│Resolved  │  │
│ Dashboard│  └─────────┴──────────┴──────────┴──────────┘  │
│ Map View │                                                │
│ ─────── │  ┌──────────────────────────────────────────┐  │
│         │  │  PANIC  Adeyinka Ogunleye       2 min ago│  │
│         │  │ Last seen: Sabo, Yaba · Phone: OFFLINE   │  │
│         │  │ Evidence: 1 photo · Risk: 0.82           │  │
│         │  │                          [View Details]   │  │
│         │  ├──────────────────────────────────────────┤  │
│         │  │  AI ALERT  Tola Adeniyi        8 min ago│  │
│         │  │ Last seen: Tejuosho · Phone: Online      │  │
│         │  │ Unusual speed detected · Risk: 0.71      │  │
│         │  │                          [View Details]   │  │
│         │  ├──────────────────────────────────────────┤  │
│         │  │  OFFLINE  Chidi Nwankwo       15 min ago│  │
│         │  │ Last seen: Jibowu · Phone: OFFLINE       │  │
│         │  │ No evidence · Risk: N/A                  │  │
│         │  │                          [View Details]   │  │
│         │  └──────────────────────────────────────────┘  │
└─────────┴────────────────────────────────────────────────┘
```

**Layout:** Fixed sidebar on the left (brown background, white text), content area on the right.

**Alert cards show:**
- Alert type badge (colour-coded): PANIC (red), AI ALERT (orange), OFFLINE (yellow), CHECK-IN (amber)
- Person's name
- Time since alert fired
- Last known location (human-readable, e.g. "Sabo, Yaba")
- Phone status (Online / Offline)
- Evidence count (e.g. "2 photos")
- Risk score if available
- Link to full detail page

**Tabs/filters across the top:**
- All — everything
- New — unacknowledged alerts (red dot count)
- Active — acknowledged, being handled
- Resolved — closed alerts

**Sorting:** newest first by default. Panic alerts always float to top regardless of time.

**Real-time:** Firestore `onSnapshot` listener — new alerts appear without page refresh.

### 3. Alert Detail (`/alerts/:alertId`)

The full picture for a single alert. This is where the agency staff decides what to do.

```
┌─────────┬────────────────────────────────────────────────┐
│         │  < Back to Dashboard                           │
│  LOGO   │                                                │
│         │  Adeyinka Ogunleye            Status: [NEW v]  │
│ ─────── │  Alert type: PANIC · Fired: 8:42 PM            │
│ Dashboard│  Phone: OFFLINE since 8:43 PM                  │
│ Map View │  Family: Ogunleye Family                       │
│ ─────── │                                                │
│         │  ┌─────────────────────────────────────────┐   │
│         │  │                                         │   │
│         │  │              MAP                        │   │
│         │  │     (last known location pinned,        │   │
│         │  │      recent trajectory drawn)           │   │
│         │  │                                         │   │
│         │  └─────────────────────────────────────────┘   │
│         │                                                │
│         │  Location Details                              │
│         │  Last known: 6.5095 N, 3.3810 E (Sabo, Yaba)  │
│         │  Speed: ~62 km/h · Heading: Northeast          │
│         │  Risk score: 0.82                              │
│         │                                                │
│         │  AI Explanations                               │
│         │  - Very high speed (62 km/h) — vehicle movement│
│         │  - Movement during high-risk hours (10pm-5am)  │
│         │  - Far from safe zones (4.2 km away)           │
│         │                                                │
│         │  Evidence                                      │
│         │  ┌────────┐  ┌────────┐                        │
│         │  │ photo1 │  │ photo2 │   Captured 8:42 PM     │
│         │  │        │  │        │   [Download All]       │
│         │  └────────┘  └────────┘                        │
│         │                                                │
│         │  Timeline                                      │
│         │  8:42 PM — Panic triggered                     │
│         │  8:42 PM — Evidence uploaded (2 photos)        │
│         │  8:43 PM — Phone went offline                  │
│         │  8:43 PM — Alert sent to family                │
│         │  8:47 PM — Family escalated to agency          │
│         │                                                │
│         │  Notes                               [Add +]  │
│         │  (none yet)                                    │
│         │                                                │
└─────────┴────────────────────────────────────────────────┘
```

**Sections top to bottom:**
1. **Header** — person name, alert type, time, phone status, family name, status dropdown (New -> Acknowledged -> Resolved)
2. **Map** — pin at last known location. If trajectory data exists, draw the path as a polyline. If phone is still online, show live position
3. **Location details** — coordinates, speed, heading, risk score
4. **AI explanations** — the human-readable explanation strings from the AI service (the `explanations` array from `/predict`)
5. **Evidence** — thumbnail grid of uploaded photos. Click to enlarge. Download button. Each photo shows its capture timestamp
6. **Timeline** — chronological log of events for this alert
7. **Notes** — agency staff can add free-text notes (stored in Firestore under the alert doc)

**Status dropdown actions:**
- New -> Acknowledged (means "we see it, working on it")
- Acknowledged -> Resolved (means "handled")
- Resolved alerts move to the Resolved tab on the dashboard

### 4. Map View (`/map`)

All active alerts on a single map. For situational awareness.

```
┌─────────┬────────────────────────────────────────────────┐
│         │  Map View                     [Filter: All v]  │
│  LOGO   │                                                │
│         │  ┌─────────────────────────────────────────┐   │
│ ─────── │  │                                         │   │
│ Dashboard│  │         FULL-WIDTH MAP                  │   │
│ Map View │  │                                         │   │
│ ─────── │  │     red pin = panic                     │   │
│         │  │     orange pin = AI alert               │   │
│         │  │     yellow pin = offline                │   │
│         │  │                                         │   │
│         │  │   Click a pin -> popup with:            │   │
│         │  │   Name, alert type, time, [View]        │   │
│         │  │                                         │   │
│         │  └─────────────────────────────────────────┘   │
│         │                                                │
│         │  Active alerts: 5 · Showing: All               │
└─────────┴────────────────────────────────────────────────┘
```

- Map fills most of the screen
- Pins colour-coded by alert type
- Click a pin -> popup/tooltip with summary + link to detail page
- Filter dropdown to show only certain alert types
- Default zoom centred on Lagos

### 5. Evidence Viewer (modal or `/evidence/:evidenceId`)

Can be a full page or a modal from the alert detail page.

- Full-size photo display
- Metadata below: timestamp, GPS coordinates, which alert it belongs to
- Previous / Next navigation if multiple photos
- Download button

---

## Sidebar navigation

Persistent left sidebar (brown background):

```
┌───────────┐
│ SafeTrace │   <- logo/name in white
│           │
│ Dashboard │   <- icon + label
│ Map View  │
│           │
│ ───────── │
│ Logged in │
│ as: name  │
│ [Log out] │
└───────────┘
```

Only 2 main nav items. Keep it minimal — agency staff don't need complexity.

---

## Responsive behaviour

- **Desktop (>1024px):** sidebar visible, full layout as shown above
- **Tablet (768-1024px):** sidebar collapses to icons only, expands on hover
- **Mobile (<768px):** sidebar becomes a top hamburger menu. Secondary concern — agency staff will mostly use desktop

---

## Firestore collections the dashboard reads

These get defined in Phase 2, but this is the expected shape:

```
users/{userId}
  - name, phone, familyId, lastLocation, lastSeen, phoneStatus

families/{familyId}
  - name, members[], agencyId

agencies/{agencyId}
  - name, staffUserIds[]

alerts/{alertId}
  - userId, familyId, agencyId
  - type: "panic" | "ai_anomaly" | "offline" | "checkin"
  - status: "new" | "acknowledged" | "resolved"
  - createdAt, acknowledgedAt, resolvedAt
  - lastKnownLocation: { lat, lng, speed, heading }
  - riskScore (from AI service, nullable)
  - explanations[] (from AI service, nullable)
  - evidenceUrls[] (Cloud Storage paths)
  - timeline[] (array of { event, timestamp })
  - notes[] (array of { text, author, timestamp })
```

---

## What can be built now (before Phase 2)

Even without Firebase set up, you can build:

- The full layout (sidebar, routing, pages)
- All UI components with mock/hardcoded data
- Colour tokens and design system
- The login page UI (wire up Firebase Auth later)
- Alert card component, alert detail layout
- Map integration with dummy pins

Once Phase 2 lands the Firestore schema, swap mock data for real Firestore listeners.
