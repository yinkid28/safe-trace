import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import { useLocation } from "../hooks/useLocation";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./Map.css";

// Pulsing blue dot for current user
const userIcon = L.divIcon({
  className: "custom-marker user-marker",
  html: `<div class="user-pulse-ring"></div><div class="user-dot"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Avatar circle with initial letter for family members
const createMemberIcon = (name, isOnline) => {
  const initial = (name || "?").charAt(0).toUpperCase();
  const bg = isOnline ? "#2E7D32" : "#BDBDBD";
  return L.divIcon({
    className: "custom-marker member-marker",
    html: `<div class="member-marker-avatar" style="background:${bg}">${initial}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Red pulsing alert marker
const alertIcon = L.divIcon({
  className: "custom-marker alert-marker",
  html: `<div class="alert-dot"><span class="alert-icon-excl">!</span></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Programmatically pan/zoom map
function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 15);
  }, [center, map]);
  return null;
}

// Shared tile layer config
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function FamilyMap() {
  const { user } = useAuth();
  const { position } = useLocation();
  const [familyMembers, setFamilyMembers] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [selectedCenter, setSelectedCenter] = useState(null);
  const [queryError, setQueryError] = useState(null);

  // Subscribe to family data
  useEffect(() => {
    if (!user?.familyId) return;
    setQueryError(null);

    const qMembers = query(
      collection(db, "users"),
      where("familyId", "==", user.familyId)
    );
    const unsubMembers = onSnapshot(
      qMembers,
      (snap) => {
        const list = [];
        snap.forEach((d) => {
          if (d.id !== user.uid) list.push({ uid: d.id, ...d.data() });
        });
        setFamilyMembers(list);
      },
      (err) => {
        console.warn("Family members query error:", err.message);
        setQueryError("Could not load family members.");
      }
    );

    const qAlerts = query(
      collection(db, "alerts"),
      where("familyId", "==", user.familyId),
      where("status", "in", ["new", "acknowledged"])
    );
    const unsubAlerts = onSnapshot(
      qAlerts,
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setActiveAlerts(list);
      },
      (err) => console.warn("Alerts query error:", err.message)
    );

    return () => { unsubMembers(); unsubAlerts(); };
  }, [user?.familyId, user?.uid]);

  const currentUserPos = position ? [position.lat, position.lng] : null;
  const defaultCenter = currentUserPos || [6.5095, 3.3810];

  const getMemberPosition = (m) =>
    m.lastLocation?.lat && m.lastLocation?.lng
      ? [m.lastLocation.lat, m.lastLocation.lng]
      : null;

  const formatLastSeen = (ts) => {
    if (!ts) return "Never";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleDismissAlert = async (alertId) => {
    try {
      await updateDoc(doc(db, "alerts", alertId), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
        resolvedBy: user.uid,
      });
    } catch (err) {
      console.error("Failed to dismiss alert:", err);
    }
  };

  // ===== No family state =====
  if (!user?.familyId) {
    return (
      <div className="map-page-container">
        <div className="leaflet-map-wrapper">
          <MapContainer center={defaultCenter} zoom={13} scrollWheelZoom={true} className="family-route-map">
            <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
            {currentUserPos && (
              <Marker position={currentUserPos} icon={userIcon}>
                <Popup><strong>You</strong></Popup>
              </Marker>
            )}
          </MapContainer>

          {currentUserPos && (
            <div className="map-floating-actions">
              <button className="map-floating-btn" onClick={() => setSelectedCenter(currentUserPos)} aria-label="My location">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="no-family-overlay">
          <h3 className="no-family-title">Join a Family Circle</h3>
          <p className="no-family-desc">
            Create or join a family on the Home tab to see live locations, track movement, and receive distress alerts here.
          </p>
        </div>
      </div>
    );
  }

  // ===== Main map view =====
  return (
    <div className="map-page-container">
      {queryError && <div className="map-query-error">{queryError}</div>}

      {/* Map with floating button */}
      <div className="leaflet-map-wrapper">
        <MapContainer center={defaultCenter} zoom={13} scrollWheelZoom={true} className="family-route-map">
          <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
          {selectedCenter && <RecenterMap center={selectedCenter} />}

          {/* Current user — pulsing blue dot */}
          {currentUserPos && (
            <Marker position={currentUserPos} icon={userIcon}>
              <Popup>
                <strong>You</strong><br />
                {position?.speed != null ? `Speed: ${position.speed} km/h` : "Stopped"}
              </Popup>
            </Marker>
          )}

          {/* Family members — avatar markers */}
          {familyMembers.map((member) => {
            const pos = getMemberPosition(member);
            if (!pos) return null;
            const isOnline = member.phoneStatus === "online";
            return (
              <Marker key={member.uid} position={pos} icon={createMemberIcon(member.name, isOnline)}>
                <Popup>
                  <strong>{member.name}</strong><br />
                  {isOnline ? "Online" : "Offline"}<br />
                  Speed: {member.lastLocation?.speed ? `${member.lastLocation.speed} km/h` : "Stopped"}<br />
                  Last seen: {formatLastSeen(member.lastSeen)}
                </Popup>
              </Marker>
            );
          })}

          {/* Alert markers + trajectory polylines */}
          {activeAlerts.map((alert) => {
            const loc = alert.lastKnownLocation;
            if (!loc?.lat || !loc?.lng) return null;
            const routePositions = alert.trajectory
              ? alert.trajectory.map((p) => [p.lat, p.lng])
              : [];
            return (
              <div key={alert.id}>
                {routePositions.length > 1 && (
                  <Polyline positions={routePositions} color="#D92D20" weight={4} dashArray="5, 8" />
                )}
                <Marker position={[loc.lat, loc.lng]} icon={alertIcon}>
                  <Popup>
                    <strong style={{ color: "#D92D20" }}>DISTRESS: {alert.userName}</strong><br />
                    Type: {alert.type?.toUpperCase()}<br />
                    Location: {alert.locationName || "Unknown"}<br />
                    Triggered: {alert.createdAt?.toDate
                      ? alert.createdAt.toDate().toLocaleTimeString()
                      : new Date(alert.createdAt).toLocaleTimeString()}
                  </Popup>
                </Marker>
              </div>
            );
          })}

          {/* Safe zone circles */}
          {(user.safeZones || []).map((zone, i) =>
            zone.lat && zone.lng ? (
              <Circle
                key={`zone-${i}`}
                center={[zone.lat, zone.lng]}
                radius={200}
                pathOptions={{
                  color: "#2E7D32",
                  fillColor: "#2E7D32",
                  fillOpacity: 0.1,
                  weight: 1.5,
                  opacity: 0.5,
                }}
              >
                <Popup><strong>{zone.label || `Zone ${i + 1}`}</strong><br />Safe Zone (200m)</Popup>
              </Circle>
            ) : null
          )}
        </MapContainer>

        {/* Floating "My Location" button inside map wrapper */}
        {currentUserPos && (
          <div className="map-floating-actions">
            <button className="map-floating-btn" onClick={() => setSelectedCenter(currentUserPos)} aria-label="My location">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Family Circle section */}
      <section className="map-family-section">
        <div className="map-section-header">
          <h3 className="map-section-title">Family Circle</h3>
          <div className="map-section-meta">
            <span className="map-member-count">{familyMembers.length + 1} members</span>
            {activeAlerts.length > 0 && (
              <span className="map-alert-badge">
                {activeAlerts.length} alert{activeAlerts.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="map-members-list">
          {/* Current user */}
          <div className="map-member-card you-card">
            <div className="member-status-info">
              <div className="member-avatar you-avatar">
                {user.name?.charAt(0) || "?"}
                <span className="avatar-status-dot online" />
              </div>
              <div className="member-text">
                <span className="member-name-text">{user.name} <span className="you-badge">(You)</span></span>
                <span className="member-sub-text">
                  {currentUserPos ? `${position?.speed || 0} km/h` : "No GPS"} &middot; Now
                </span>
              </div>
            </div>
            {currentUserPos && (
              <button className="btn-locate-member" onClick={() => setSelectedCenter(currentUserPos)}>
                Center
              </button>
            )}
          </div>

          {/* Family members */}
          {familyMembers.map((member) => {
            const pos = getMemberPosition(member);
            const isOnline = member.phoneStatus === "online";
            return (
              <div key={member.uid} className="map-member-card">
                <div className="member-status-info">
                  <div className="member-avatar">
                    {member.name?.charAt(0)}
                    <span className={`avatar-status-dot ${isOnline ? "online" : "offline"}`} />
                  </div>
                  <div className="member-text">
                    <span className="member-name-text">{member.name}</span>
                    <span className="member-sub-text">
                      {pos ? `${member.lastLocation?.speed || 0} km/h` : "No GPS"} &middot; {formatLastSeen(member.lastSeen)}
                    </span>
                  </div>
                </div>
                {pos && (
                  <button className="btn-locate-member" onClick={() => setSelectedCenter(pos)}>
                    Locate
                  </button>
                )}
              </div>
            );
          })}

          {familyMembers.length === 0 && (
            <p className="no-members-text">You're the only member. Invite others from Home tab.</p>
          )}
        </div>
      </section>

      {/* Emergency Alerts section */}
      <section className="map-alerts-section">
        <h4 className={`map-section-label ${activeAlerts.length > 0 ? "danger-text" : ""}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "0.9em", height: "0.9em", verticalAlign: "middle", marginRight: "0.3em" }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Emergency Alerts
        </h4>

        {activeAlerts.length === 0 ? (
          <div className="no-alerts-row">
            <span className="no-alerts-text">All family members are safe.</span>
          </div>
        ) : (
          activeAlerts.map((alert) => {
            const pos = alert.lastKnownLocation
              ? [alert.lastKnownLocation.lat, alert.lastKnownLocation.lng]
              : null;
            return (
              <div key={alert.id} className="map-alert-item">
                <div className="alert-item-text">
                  <span className="alert-user-name">{alert.userName}</span>
                  <span className="alert-details-sub">SOS near {alert.locationName || "Unknown"}</span>
                </div>
                <div className="alert-item-actions">
                  {pos && (
                    <button className="btn-locate-alert" onClick={() => setSelectedCenter(pos)}>
                      Focus
                    </button>
                  )}
                  <button className="btn-dismiss-alert" onClick={() => handleDismissAlert(alert.id)} aria-label="Dismiss alert">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "0.85em", height: "0.85em" }}>
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
