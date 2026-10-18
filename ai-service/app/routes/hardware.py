"""Hardware tracker location endpoint.

Receives GPS pings from ESP32 devices, authenticates via a pre-shared
device key, and writes the location to Firestore so the mobile app
picks it up in real time.

Also provides a browser-based live monitor at GET /api/v1/hardware/monitor
so the hardware team can watch data arrive in real time.
"""

import hashlib
import time
from collections import deque
from datetime import datetime, timezone

import logging

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse

from app.firebase import get_db
from app.schemas import HardwareLocationRequest, HardwareLocationResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/hardware", tags=["hardware"])

# In-memory ring buffer of recent pings (survives across requests, lost on restart)
_recent_pings: deque[dict] = deque(maxlen=100)


def _verify_device_key(stored_hash: str, stored_salt: str, provided_key: str) -> bool:
    """Verify a device key against its stored salted SHA-256 hash."""
    computed = hashlib.sha256((stored_salt + provided_key).encode()).hexdigest()
    return computed == stored_hash


DEFAULT_AGENCY_ID = "agency_yaba"


def _handle_sos(db, req, user_id: str, user_ref, now):
    """Create a panic alert and send push notifications for a hardware SOS."""
    from firebase_admin import messaging
    from app.routes.notifications import _collect_tokens

    # Read user doc for name, familyId, agencyId resolution
    user_snap = user_ref.get()
    user_data = user_snap.to_dict() if user_snap.exists else {}
    user_name = user_data.get("name", "Unknown")
    user_family_id = user_data.get("familyId") or "no_family"

    # Resolve agencyId: family → user → fallback
    agency_id = ""
    if user_family_id and user_family_id != "no_family":
        fam_snap = db.collection("families").document(user_family_id).get()
        if fam_snap.exists:
            agency_id = fam_snap.to_dict().get("agencyId", "")
    if not agency_id:
        agency_id = user_data.get("directAgencyId") or DEFAULT_AGENCY_ID

    location_name = f"{req.lat:.4f}, {req.lon:.4f}"

    # Create alert document
    alert_ref = db.collection("alerts").document()
    alert_ref.set({
        "userId": user_id,
        "userName": user_name,
        "familyId": user_family_id,
        "agencyId": agency_id,
        "type": "panic",
        "status": "new",
        "createdAt": now,
        "lastKnownLocation": {
            "lat": req.lat,
            "lng": req.lon,
            "speed": req.speed,
            "heading": None,
        },
        "locationName": location_name,
        "riskScore": 1.0,
        "explanations": ["Hardware SOS button triggered"],
        "evidenceUrls": [],
        "escalated": True,
        "escalatedAt": now,
        "trajectory": [{
            "lat": req.lat,
            "lng": req.lon,
            "timestamp": now.isoformat(),
        }],
        "timeline": [{
            "event": "Hardware SOS triggered",
            "timestamp": now,
        }],
        "notes": [],
    })

    logger.info("Hardware SOS alert created: %s for user %s", alert_ref.id, user_id)

    # Send push notifications (fire and forget)
    try:
        tokens = _collect_tokens(db, user_family_id, agency_id)
        if tokens:
            msg = messaging.MulticastMessage(
                tokens=tokens,
                notification=messaging.Notification(
                    title="EMERGENCY SOS",
                    body=f"{user_name} triggered an emergency alert near {location_name}",
                ),
                data={"alertId": alert_ref.id, "alertType": "panic"},
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(
                        sound="default", priority="max",
                    ),
                ),
            )
            result = messaging.send_each_for_multicast(msg)
            logger.info("SOS notifications sent: %d ok, %d failed", result.success_count, result.failure_count)
    except Exception as exc:
        logger.warning("SOS notification send failed: %s", exc)


@router.post("/location", response_model=HardwareLocationResponse)
async def receive_location(req: HardwareLocationRequest):
    """Receive a GPS ping from an ESP32 hardware tracker.

    Authenticates via deviceId + deviceKey, then writes the location
    to the paired user's Firestore documents using a batch write.
    """
    db = get_db()

    # 1. Look up the device
    device_ref = db.collection("devices").document(req.deviceId)
    device_snap = device_ref.get()

    if not device_snap.exists:
        return JSONResponse(status_code=401, content={"ok": False})

    device = device_snap.to_dict()

    # 2. Verify the key
    if not _verify_device_key(device["keyHash"], device["keySalt"], req.deviceKey):
        return JSONResponse(status_code=401, content={"ok": False})

    # 3. Check device is paired to a user
    user_id = device.get("pairedUserId")
    if not user_id:
        return JSONResponse(status_code=401, content={"ok": False})

    now = datetime.now(timezone.utc)
    client_ts = req.ts * 1000 if req.ts else int(time.time() * 1000)

    # 4. Batch write — atomic update across three documents
    batch = db.batch()

    # 4a. Update the device doc (battery, satellites, last seen)
    batch.update(device_ref, {
        "lastSeen": now,
        "batteryVoltage": req.batt,
        "satellites": req.sats,
        "status": "online",
    })

    # 4b. Update the user's lastLocation
    user_ref = db.collection("users").document(user_id)
    batch.update(user_ref, {
        "lastLocation": {
            "lat": req.lat,
            "lng": req.lon,
            "speed": req.speed,
            "heading": None,
        },
        "lastSeen": now,
        "lastLocationSource": "hardware",
    })

    # 4c. Append to locationHistory
    family_id = device.get("familyId") or ""
    history_ref = db.collection("locationHistory").document()
    batch.set(history_ref, {
        "userId": user_id,
        "familyId": family_id,
        "lat": req.lat,
        "lng": req.lon,
        "speed": req.speed,
        "heading": None,
        "timestamp": now,
        "clientTimestamp": client_ts,
        "source": "hardware",
        "deviceId": req.deviceId,
        "satellites": req.sats,
        "batteryVoltage": req.batt,
    })

    batch.commit()

    # Store ping in memory for the live monitor
    _recent_pings.appendleft({
        "deviceId": req.deviceId,
        "lat": req.lat,
        "lon": req.lon,
        "speed": req.speed,
        "sats": req.sats,
        "batt": req.batt,
        "sos": req.sos,
        "ts": now.isoformat(),
    })

    # Handle hardware SOS button press
    if req.sos:
        try:
            _handle_sos(db, req, user_id, user_ref, now)
        except Exception as exc:
            logger.warning("Hardware SOS handling failed: %s", exc)

    return HardwareLocationResponse(ok=True)


@router.get("/pings")
async def get_recent_pings():
    """Return recent pings as JSON for the monitor page to poll."""
    return list(_recent_pings)


@router.get("/monitor", response_class=HTMLResponse)
async def hardware_monitor():
    """Live monitor page — open in a browser to watch hardware data arrive."""
    return MONITOR_HTML


MONITOR_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SafeTrace Hardware Monitor</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1419; color: #e7e9ea; }
  .header { padding: 1rem 1.5rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2f3336; }
  .header h1 { font-size: 1.1rem; font-weight: 700; }
  .header h1 span { color: #22c55e; }
  .status-badge { font-size: 0.75rem; padding: 0.3rem 0.7rem; border-radius: 20px; font-weight: 600; }
  .status-badge.waiting { background: #2d2000; color: #f59e0b; }
  .status-badge.live { background: #052e16; color: #22c55e; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding: 1rem 1.5rem; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }

  .card { background: #1a1f25; border: 1px solid #2f3336; border-radius: 12px; padding: 1rem; }
  .card-title { font-size: 0.75rem; color: #71767b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
  .stat-row { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid #2f3336; }
  .stat-row:last-child { border: none; }
  .stat-label { color: #71767b; font-size: 0.85rem; }
  .stat-value { font-weight: 700; font-size: 0.85rem; font-variant-numeric: tabular-nums; }

  #map { height: 300px; border-radius: 12px; border: 1px solid #2f3336; margin: 0 1.5rem; }

  .log-section { padding: 1rem 1.5rem; }
  .log-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .log-table th { text-align: left; color: #71767b; padding: 0.5rem 0.4rem; border-bottom: 1px solid #2f3336; font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; }
  .log-table td { padding: 0.45rem 0.4rem; border-bottom: 1px solid #1e2328; font-variant-numeric: tabular-nums; }
  .log-table tr:first-child td { color: #22c55e; font-weight: 600; }

  .empty-state { text-align: center; padding: 3rem; color: #71767b; }
  .empty-state p { margin-top: 0.5rem; font-size: 0.85rem; }
  .empty-state .icon { font-size: 2rem; margin-bottom: 0.5rem; }

  .endpoint-box { margin: 1rem 1.5rem; padding: 0.75rem 1rem; background: #1a1f25; border: 1px solid #2f3336; border-radius: 8px; font-size: 0.8rem; }
  .endpoint-box code { color: #22c55e; word-break: break-all; }
  .endpoint-box .label { color: #71767b; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 0.3rem; }
</style>
</head>
<body>
  <div class="header">
    <h1>Safe<span>Trace</span> Hardware Monitor</h1>
    <span id="statusBadge" class="status-badge waiting">Waiting for data...</span>
  </div>

  <div class="endpoint-box">
    <div class="label">ESP32 POST endpoint</div>
    <code id="endpointUrl"></code>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Latest Position</div>
      <div class="stat-row"><span class="stat-label">Latitude</span><span class="stat-value" id="lat">--</span></div>
      <div class="stat-row"><span class="stat-label">Longitude</span><span class="stat-value" id="lon">--</span></div>
      <div class="stat-row"><span class="stat-label">Speed</span><span class="stat-value" id="speed">--</span></div>
      <div class="stat-row"><span class="stat-label">Device</span><span class="stat-value" id="device">--</span></div>
    </div>
    <div class="card">
      <div class="card-title">Device Status</div>
      <div class="stat-row"><span class="stat-label">Battery</span><span class="stat-value" id="batt">--</span></div>
      <div class="stat-row"><span class="stat-label">Satellites</span><span class="stat-value" id="sats">--</span></div>
      <div class="stat-row"><span class="stat-label">Last Seen</span><span class="stat-value" id="lastSeen">--</span></div>
      <div class="stat-row"><span class="stat-label">Total Pings</span><span class="stat-value" id="totalPings">0</span></div>
    </div>
  </div>

  <div id="map"></div>

  <div class="log-section">
    <div class="card">
      <div class="card-title">Ping Log (latest first)</div>
      <div id="logContent">
        <div class="empty-state">
          <div class="icon">&#128225;</div>
          <p>No pings received yet.<br>Send a POST to the endpoint above.</p>
        </div>
      </div>
    </div>
  </div>

<script>
  const BASE = window.location.origin;
  document.getElementById('endpointUrl').textContent = BASE + '/api/v1/hardware/location';

  const map = L.map('map').setView([6.515, 3.377], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  let marker = null;
  let path = [];
  let polyline = L.polyline([], { color: '#22c55e', weight: 3, opacity: 0.7 }).addTo(map);
  let firstPing = true;

  async function poll() {
    try {
      const res = await fetch(BASE + '/api/v1/hardware/pings');
      if (!res.ok) return;
      const pings = await res.json();
      if (!pings.length) return;

      const latest = pings[0];
      const badge = document.getElementById('statusBadge');
      badge.textContent = 'LIVE';
      badge.className = 'status-badge live';

      document.getElementById('lat').textContent = latest.lat.toFixed(6);
      document.getElementById('lon').textContent = latest.lon.toFixed(6);
      document.getElementById('speed').textContent = latest.speed.toFixed(1) + ' km/h';
      document.getElementById('device').textContent = latest.deviceId;
      document.getElementById('batt').textContent = latest.batt.toFixed(2) + ' V';
      document.getElementById('sats').textContent = latest.sats;
      document.getElementById('totalPings').textContent = pings.length;

      const d = new Date(latest.ts);
      document.getElementById('lastSeen').textContent =
        d.toLocaleTimeString() + ' ' + d.toLocaleDateString();

      // Update map
      const pos = [latest.lat, latest.lon];
      if (marker) {
        marker.setLatLng(pos);
      } else {
        marker = L.circleMarker(pos, {
          radius: 8, fillColor: '#22c55e', fillOpacity: 1,
          color: '#fff', weight: 2
        }).addTo(map);
      }

      // Build path from all pings (reversed since newest is first)
      const coords = pings.map(p => [p.lat, p.lon]).reverse();
      polyline.setLatLngs(coords);

      if (firstPing) {
        map.setView(pos, 15);
        firstPing = false;
      }

      // Render log table
      let html = '<table class="log-table"><thead><tr>' +
        '<th>Time</th><th>Device</th><th>Lat</th><th>Lon</th><th>Speed</th><th>Sats</th><th>Batt</th>' +
        '</tr></thead><tbody>';
      for (const p of pings) {
        const t = new Date(p.ts);
        html += '<tr>' +
          '<td>' + t.toLocaleTimeString() + '</td>' +
          '<td>' + p.deviceId + '</td>' +
          '<td>' + p.lat.toFixed(6) + '</td>' +
          '<td>' + p.lon.toFixed(6) + '</td>' +
          '<td>' + p.speed.toFixed(1) + '</td>' +
          '<td>' + p.sats + '</td>' +
          '<td>' + p.batt.toFixed(2) + 'V</td>' +
          '</tr>';
      }
      html += '</tbody></table>';
      document.getElementById('logContent').innerHTML = html;
    } catch (e) {
      // Network error — retry next cycle
    }
  }

  poll();
  setInterval(poll, 3000);
</script>
</body>
</html>
"""
