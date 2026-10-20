import { Fragment, useEffect, useState } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import { useLocation } from "../hooks/useLocation";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getZoneIconHtml, getZoneTypeLabel } from "../utils/safeZoneTypes";
import "./Map.css";

// Pulsing blue dot for current user
const userIcon = L.divIcon({
  className: "custom-marker user-marker",
  html: `<div class="user-pulse-ring"></div><div class="user-dot"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Avatar circle with initial letter for family members
const createMemberIcon = (name, isOnline, isStale = false) => {
  const initial = (name || "?").charAt(0).toUpperCase();
  const bg = isStale
    ? "linear-gradient(135deg, #f59e0b, #d97706)"
    : isOnline
      ? "linear-gradient(135deg, #22c55e, #16a34a)"
      : "linear-gradient(135deg, #9ca3af, #6b7280)";
  const cls = isStale ? "member-marker-avatar stale-avatar" : "member-marker-avatar";
  return L.divIcon({
    className: "custom-marker member-marker",
    html: `<div class="${cls}" style="background:${bg}">${initial}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Hardware tracker marker — crosshair/satellite icon with brown gradient
const createHardwareTrackerIcon = (name) => {
  const initial = (name || "?").charAt(0).toUpperCase();
  return L.divIcon({
    className: "custom-marker hardware-marker",
    html: `<div class="hardware-marker-dot" title="${initial}">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="14" height="14">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
      </svg>
    </div>`,
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

// Safe zone category marker
const createZoneIcon = (type, isShared = false) =>
  L.divIcon({
    className: "custom-marker zone-category-marker",
    html: getZoneIconHtml(type || "other", isShared),
    iconSize: [28, 28],
    iconAnchor: [14, 14],
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
  const [familySharedZones, setFamilySharedZones] = useState([]);
  const [hardwareTrackers, setHardwareTrackers] = useState([]); // { uid, name, location, deviceId }

  // Trail viewing state
  const [trailUserId, setTrailUserId] = useState(null);
  const [trailPoints, setTrailPoints] = useState([]);
  const [trailLoading, setTrailLoading] = useState(false);

  // Alert detail expansion
  const [expandedAlertId, setExpandedAlertId] = useState(null);

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
        const trackers = [];
        const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
        snap.forEach((d) => {
          const data = d.data();
          if (d.id !== user.uid) list.push({ uid: d.id, ...data });
          // Collect hardware tracker locations for ALL users (including self)
          if (data.hardwareLocation?.lat && data.hardwareLocation?.lng) {
            const updatedAt = data.hardwareLocation.updatedAt?.toDate
              ? data.hardwareLocation.updatedAt.toDate().getTime()
              : (data.hardwareLocation.updatedAt ? new Date(data.hardwareLocation.updatedAt).getTime() : 0);
            if (updatedAt > thirtyMinAgo) {
              trackers.push({
                uid: d.id,
                name: data.name || "Unknown",
                location: data.hardwareLocation,
                isSelf: d.id === user.uid,
              });
            }
          }
        });
        setFamilyMembers(list);
        setHardwareTrackers(trackers);
      },
      (err) => {
        console.warn("Family members query error:", err.message);
        setQueryError("Could not load family members.");
      }
    );

    const qAlerts = query(
      collection(db, "alerts"),
      where("familyId", "==", user.familyId),
      where("status", "in", ["new", "acknowledged", "resolved"])
    );
    const unsubAlerts = onSnapshot(
      qAlerts,
      (snap) => {
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const list = [];
        snap.forEach((d) => {
          const data = { id: d.id, ...d.data() };
          // Keep active alerts always; keep resolved alerts from last 24h
          if (data.status !== "resolved") {
            list.push(data);
          } else {
            const created = data.createdAt?.toDate
              ? data.createdAt.toDate().getTime()
              : (data.createdAt ? new Date(data.createdAt).getTime() : 0);
            if (created > twentyFourHoursAgo) {
              list.push(data);
            }
          }
        });
        setActiveAlerts(list);
      },
      (err) => console.warn("Alerts query error:", err.message)
    );

    return () => { unsubMembers(); unsubAlerts(); };
  }, [user?.familyId, user?.uid]);

  // Subscribe to family shared zones
  useEffect(() => {
    if (!user?.familyId) {
      setFamilySharedZones([]);
      return;
    }
    const unsubFamily = onSnapshot(
      doc(db, "families", user.familyId),
      (snap) => {
        if (snap.exists()) {
          setFamilySharedZones(snap.data().sharedSafeZones || []);
        }
      },
      (err) => console.warn("Family doc listen error:", err.message)
    );
    return () => unsubFamily();
  }, [user?.familyId]);

  const currentUserPos = position ? [position.lat, position.lng] : null;

  // Compute a meaningful map center: user position > first family member > first safe zone
  // Avoids centering on a hardcoded default when no location data is available
  const getMapCenter = () => {
    if (currentUserPos) return currentUserPos;
    const firstMemberPos = familyMembers.find((m) => m.lastLocation?.lat && m.lastLocation?.lng);
    if (firstMemberPos) return [firstMemberPos.lastLocation.lat, firstMemberPos.lastLocation.lng];
    const firstZone = (user.safeZones || [])[0] || familySharedZones[0];
    if (firstZone?.lat && firstZone?.lng) return [firstZone.lat, firstZone.lng];
    return [6.5095, 3.3810]; // last resort fallback — only used when absolutely no data exists
  };
  const defaultCenter = getMapCenter();

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

  // Load movement trail for a user (last 24 hours)
  const loadTrail = async (userId) => {
    if (trailUserId === userId) {
      setTrailUserId(null);
      setTrailPoints([]);
      return;
    }

    setTrailLoading(true);
    setTrailUserId(userId);
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const q = query(
        collection(db, "locationHistory"),
        where("userId", "==", userId),
        where("timestamp", ">=", twentyFourHoursAgo),
        orderBy("timestamp", "asc"),
        limit(288)
      );
      const snap = await getDocs(q);
      const points = snap.docs.map((d) => {
        const data = d.data();
        return [data.lat, data.lng];
      });
      setTrailPoints(points);
    } catch (err) {
      console.warn("Failed to load trail:", err.message);
      setTrailPoints([]);
    } finally {
      setTrailLoading(false);
    }
  };

  // ===== No family state =====
  if (!user?.familyId) {
    return (
      <div className="map-page-container">
        <div className="leaflet-map-wrapper">
          {currentUserPos ? (
            <>
              <MapContainer center={currentUserPos} zoom={15} scrollWheelZoom={true} className="family-route-map">
                <TileLayer attribution={TILE_ATTR} url={TILE_URL} />
                <Marker position={currentUserPos} icon={userIcon}>
                  <Popup><strong>You</strong></Popup>
                </Marker>
              </MapContainer>

              <div className="map-floating-actions">
                <button className="map-floating-btn" onClick={() => setSelectedCenter(currentUserPos)} aria-label="My location">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className="map-no-location-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
              <p className="no-location-text">Unable to detect your location</p>
              <span className="no-location-hint">Please enable location services to see the map</span>
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
        <MapContainer center={defaultCenter} zoom={15} scrollWheelZoom={true} className="family-route-map">
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

          {/* Family members — avatar or hardware tracker markers */}
          {familyMembers.map((member) => {
            const pos = getMemberPosition(member);
            if (!pos) return null;
            const isOnline = member.phoneStatus === "online";
            const isStale = member.stale === true;
            const isHardware = (member.lastLocationSource || "phone") === "hardware";
            const icon = isHardware
              ? createHardwareTrackerIcon(member.name)
              : createMemberIcon(member.name, isOnline, isStale);
            const statusLabel = isStale
              ? "Possibly offline"
              : isOnline ? "Online" : "Offline";
            return (
              <Marker key={member.uid} position={pos} icon={icon}>
                <Popup>
                  <strong>{member.name}</strong>{isHardware ? " (Tracker)" : ""}<br />
                  {statusLabel}<br />
                  Speed: {member.lastLocation?.speed ? `${member.lastLocation.speed} km/h` : "Stopped"}<br />
                  Last seen: {formatLastSeen(member.lastSeen)}
                </Popup>
              </Marker>
            );
          })}

          {/* Hardware tracker markers (separate from phone positions) */}
          {hardwareTrackers.map((tracker) => (
            <Marker
              key={`hw-${tracker.uid}`}
              position={[tracker.location.lat, tracker.location.lng]}
              icon={createHardwareTrackerIcon(tracker.name)}
            >
              <Popup>
                <strong>{tracker.isSelf ? "Your" : `${tracker.name}'s`} Tracker</strong>
                {tracker.location.deviceId && <><br />Device: {tracker.location.deviceId}</>}
                <br />Speed: {tracker.location.speed ? `${tracker.location.speed} km/h` : "Stopped"}
              </Popup>
            </Marker>
          ))}

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

          {/* Personal safe zone circles + icons (green) */}
          {(user.safeZones || []).map((zone, i) =>
            zone.lat && zone.lng ? (
              <Fragment key={`zone-${i}`}>
                <Circle
                  center={[zone.lat, zone.lng]}
                  radius={100}
                  pathOptions={{ color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.12, weight: 2, opacity: 0.6 }}
                />
                <Marker position={[zone.lat, zone.lng]} icon={createZoneIcon(zone.type, false)}>
                  <Popup><strong>{zone.label || `Zone ${i + 1}`}</strong><br />{getZoneTypeLabel(zone.type)} &middot; Safe Zone (100m)</Popup>
                </Marker>
              </Fragment>
            ) : null
          )}

          {/* Family shared safe zone circles + icons (blue dashed) */}
          {familySharedZones.map((zone, i) =>
            zone.lat && zone.lng ? (
              <Fragment key={`shared-zone-${i}`}>
                <Circle
                  center={[zone.lat, zone.lng]}
                  radius={100}
                  pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.08, weight: 2, opacity: 0.5, dashArray: "5, 5" }}
                />
                <Marker position={[zone.lat, zone.lng]} icon={createZoneIcon(zone.type, true)}>
                  <Popup><strong>{zone.label}</strong><br />{getZoneTypeLabel(zone.type)} &middot; Family Shared Zone (100m)</Popup>
                </Marker>
              </Fragment>
            ) : null
          )}

          {/* Movement history trail */}
          {trailPoints.length > 1 && (
            <Polyline
              positions={trailPoints}
              color="#6B4F3A"
              weight={3.5}
              opacity={0.8}
              dashArray="6, 8"
            />
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

        {/* Location unavailable banner (overlaid on map) */}
        {!currentUserPos && (
          <div className="map-no-location-banner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
            <span>Unable to detect your location</span>
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
                  {currentUserPos ? `${position?.speed || 0} km/h` : "Location unavailable"} &middot; Now
                </span>
              </div>
            </div>
            <div className="member-actions">
              {currentUserPos && (
                <button className="btn-locate-member" onClick={() => setSelectedCenter(currentUserPos)}>
                  Center
                </button>
              )}
              <button
                className={`btn-view-trail ${trailUserId === user.uid ? "active" : ""}`}
                onClick={() => loadTrail(user.uid)}
                disabled={trailLoading && trailUserId !== user.uid}
              >
                {trailUserId === user.uid ? "Hide" : "Trail"}
              </button>
            </div>
          </div>

          {/* Family members */}
          {familyMembers.map((member) => {
            const pos = getMemberPosition(member);
            const isOnline = member.phoneStatus === "online";
            const isStale = member.stale === true;
            const dotClass = isStale ? "stale" : isOnline ? "online" : "offline";
            return (
              <div key={member.uid} className={`map-member-card${isStale ? " stale-card" : ""}`}>
                <div className="member-status-info">
                  <div className="member-avatar">
                    {member.name?.charAt(0)}
                    <span className={`avatar-status-dot ${dotClass}`} />
                  </div>
                  <div className="member-text">
                    <span className="member-name-text">
                      {member.name}
                      {isStale && <span className="stale-badge">Possibly offline</span>}
                    </span>
                    <span className="member-sub-text">
                      {pos ? `${member.lastLocation?.speed || 0} km/h` : "No GPS"} &middot; {formatLastSeen(member.lastSeen)}
                    </span>
                  </div>
                </div>
                <div className="member-actions">
                  {pos && (
                    <button className="btn-locate-member" onClick={() => setSelectedCenter(pos)}>
                      Locate
                    </button>
                  )}
                  <button
                    className={`btn-view-trail ${trailUserId === member.uid ? "active" : ""}`}
                    onClick={() => loadTrail(member.uid)}
                    disabled={trailLoading && trailUserId !== member.uid}
                  >
                    {trailLoading && trailUserId === member.uid ? "..." :
                     trailUserId === member.uid ? "Hide" : "Trail"}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Hardware trackers */}
          {hardwareTrackers.length > 0 && hardwareTrackers.map((tracker) => (
            <div key={`hw-card-${tracker.uid}`} className="map-member-card">
              <div className="member-status-info">
                <div className="member-avatar" style={{ background: "linear-gradient(135deg, #92400e, #78350f)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ width: "16px", height: "16px" }}>
                    <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                  </svg>
                </div>
                <div className="member-text">
                  <span className="member-name-text">
                    {tracker.isSelf ? `${tracker.name} (Your Tracker)` : `${tracker.name}'s Tracker`}
                  </span>
                  <span className="member-sub-text">
                    {tracker.location.deviceId || "Hardware"} &middot; {tracker.location.speed ? `${tracker.location.speed} km/h` : "Stopped"}
                  </span>
                </div>
              </div>
              <div className="member-actions">
                <button
                  className="btn-locate-member"
                  onClick={() => setSelectedCenter([tracker.location.lat, tracker.location.lng])}
                >
                  Locate
                </button>
              </div>
            </div>
          ))}

          {familyMembers.length === 0 && hardwareTrackers.length === 0 && (
            <p className="no-members-text">You're the only member. Invite others from Home tab.</p>
          )}

          {trailUserId && trailPoints.length === 0 && !trailLoading && (
            <p className="no-trail-text">No movement data in the last 24 hours.</p>
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
            <span className="no-alerts-text">No alerts in the last 24 hours.</span>
          </div>
        ) : (
          activeAlerts.map((alert) => {
            const pos = alert.lastKnownLocation
              ? [alert.lastKnownLocation.lat, alert.lastKnownLocation.lng]
              : null;
            const isExpanded = expandedAlertId === alert.id;
            const isResolved = alert.status === "resolved";
            const audioUrls = (alert.evidenceUrls || []).filter((u) => u.includes("/audio_"));
            const photoUrls = (alert.evidenceUrls || []).filter((u) => u.includes("/photo_"));
            return (
              <div key={alert.id} className={`map-alert-item${isExpanded ? " expanded" : ""}${isResolved ? " resolved" : ""}`}>
                <div
                  className="alert-item-header"
                  onClick={() => setExpandedAlertId(isExpanded ? null : alert.id)}
                  style={{ cursor: "pointer" }}
                >
                  <div className="alert-item-text">
                    <span className="alert-user-name">
                      {alert.userName}
                      {isResolved && <span style={{ fontSize: "0.65rem", color: "#22c55e", marginLeft: "0.4rem", fontWeight: 600 }}>Resolved</span>}
                    </span>
                    <span className="alert-details-sub">
                      {alert.type === "ai_anomaly" ? "AI Anomaly" : "SOS"} near {alert.locationName || "Unknown"}
                    </span>
                  </div>
                  <div className="alert-item-actions">
                    {pos && (
                      <button className="btn-locate-alert" onClick={(e) => { e.stopPropagation(); setSelectedCenter(pos); }}>
                        Focus
                      </button>
                    )}
                    {!isResolved && (
                      <button className="btn-dismiss-alert" onClick={(e) => { e.stopPropagation(); handleDismissAlert(alert.id); }} aria-label="Dismiss alert">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "0.85em", height: "0.85em" }}>
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="alert-detail-panel">
                    {/* Explanations */}
                    {alert.explanations?.length > 0 && (
                      <div className="alert-detail-row">
                        <span className="alert-detail-label">Reason</span>
                        <span className="alert-detail-value">{alert.explanations[0]}</span>
                      </div>
                    )}
                    <div className="alert-detail-row">
                      <span className="alert-detail-label">Risk Score</span>
                      <span className="alert-detail-value">{((alert.riskScore || 0) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="alert-detail-row">
                      <span className="alert-detail-label">Triggered</span>
                      <span className="alert-detail-value">
                        {alert.createdAt?.toDate
                          ? alert.createdAt.toDate().toLocaleString()
                          : new Date(alert.createdAt).toLocaleString()}
                      </span>
                    </div>

                    {/* Voice recordings */}
                    {audioUrls.length > 0 && (
                      <div className="alert-evidence-section">
                        <span className="alert-detail-label">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "0.9em", height: "0.9em", verticalAlign: "middle", marginRight: "0.25em" }}>
                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                            <path d="M19 10v2a7 7 0 01-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                          Voice Recording{audioUrls.length > 1 ? "s" : ""}
                        </span>
                        {audioUrls.map((url, i) => (
                          <audio key={i} controls preload="none" style={{ width: "100%", marginTop: "0.4rem" }}>
                            <source src={url} />
                          </audio>
                        ))}
                      </div>
                    )}

                    {/* Evidence photos */}
                    {photoUrls.length > 0 && (
                      <div className="alert-evidence-section">
                        <span className="alert-detail-label">Evidence Photo{photoUrls.length > 1 ? "s" : ""}</span>
                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                          {photoUrls.map((url, i) => (
                            <img key={i} src={url} alt="Evidence" style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "6px", border: "1px solid #2f3336" }} />
                          ))}
                        </div>
                      </div>
                    )}

                    {audioUrls.length === 0 && photoUrls.length === 0 && (
                      <p style={{ fontSize: "0.8rem", color: "#71767b", margin: "0.4rem 0 0" }}>No evidence captured yet.</p>
                    )}

                    {/* Timeline */}
                    {alert.timeline?.length > 0 && (
                      <div className="alert-evidence-section">
                        <span className="alert-detail-label">Timeline</span>
                        {alert.timeline.map((entry, i) => (
                          <div key={i} style={{ fontSize: "0.75rem", color: "#a1a1aa", padding: "0.15rem 0" }}>
                            {entry.event}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
