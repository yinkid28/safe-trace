import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./Map.css";

// Workaround for default Leaflet icons in Vite
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons for different states
const userIcon = L.divIcon({
  className: "custom-marker user-marker",
  html: `<div class="marker-dot user-dot"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const onlineIcon = L.divIcon({
  className: "custom-marker online-marker",
  html: `<div class="marker-dot online-dot"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const offlineIcon = L.divIcon({
  className: "custom-marker offline-marker",
  html: `<div class="marker-dot offline-dot"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const alertIcon = L.divIcon({
  className: "custom-marker alert-marker",
  html: `<div class="marker-dot alert-dot"><span class="alert-icon-excl">!</span></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Component to programmatically pan map
function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 14);
    }
  }, [center, map]);
  return null;
}

export default function FamilyMap() {
  const { user } = useAuth();
  const [familyMembers, setFamilyMembers] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [selectedCenter, setSelectedCenter] = useState(null);

  useEffect(() => {
    if (!user?.familyId) return;

    // 1. Subscribe to family members' location changes
    const qMembers = query(
      collection(db, "users"),
      where("familyId", "==", user.familyId)
    );
    const unsubscribeMembers = onSnapshot(qMembers, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        if (doc.id !== user.uid) {
          list.push({ uid: doc.id, ...doc.data() });
        }
      });
      setFamilyMembers(list);
    });

    // 2. Subscribe to active alerts in the family
    const qAlerts = query(
      collection(db, "alerts"),
      where("familyId", "==", user.familyId),
      where("status", "in", ["new", "acknowledged"])
    );
    const unsubscribeAlerts = onSnapshot(qAlerts, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setActiveAlerts(list);
    });

    return () => {
      unsubscribeMembers();
      unsubscribeAlerts();
    };
  }, [user?.familyId, user?.uid]);

  const defaultCenter = [6.5095, 3.3810]; // Sabo, Yaba center

  const getMemberPosition = (member) => {
    if (member.lastLocation?.lat && member.lastLocation?.lng) {
      return [member.lastLocation.lat, member.lastLocation.lng];
    }
    return null;
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return "Never";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Math.floor((new Date() - date) / 1000); // seconds
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="map-page-container">
      <header className="map-page-header">
        <h1 className="map-page-title">Safety Map</h1>
        <p className="map-page-subtitle">Real-time tracking & distress alerts</p>
      </header>

      <div className="map-layout">
        {/* Leaflet Map */}
        <div className="leaflet-map-wrapper">
          <MapContainer
            center={defaultCenter}
            zoom={13}
            scrollWheelZoom={true}
            className="family-route-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {selectedCenter && <RecenterMap center={selectedCenter} />}

            {/* Current User Marker */}
            {user.lastLocation?.lat && user.lastLocation?.lng && (
              <Marker position={[user.lastLocation.lat, user.lastLocation.lng]} icon={userIcon}>
                <Popup>
                  <strong>You (Current Location)</strong> <br />
                  Status: {user.phoneStatus === "online" ? "Online" : "Offline"}
                </Popup>
              </Marker>
            )}

            {/* Family Members' Location Markers */}
            {familyMembers.map((member) => {
              const pos = getMemberPosition(member);
              if (!pos) return null;
              const isOnline = member.phoneStatus === "online";
              return (
                <Marker key={member.uid} position={pos} icon={isOnline ? onlineIcon : offlineIcon}>
                  <Popup>
                    <strong>{member.name}</strong> <br />
                    Phone Status: {isOnline ? "Online" : "Offline"} <br />
                    Speed: {member.lastLocation?.speed ? `${member.lastLocation.speed} km/h` : "Stopped"} <br />
                    Last seen: {formatLastSeen(member.lastSeen)}
                  </Popup>
                </Marker>
              );
            })}

            {/* Active Alerts Markers and Trajectories */}
            {activeAlerts.map((alert) => {
              const loc = alert.lastKnownLocation;
              if (!loc?.lat || !loc?.lng) return null;
              
              const routePositions = alert.trajectory 
                ? alert.trajectory.map(p => [p.lat, p.lng]) 
                : [];

              return (
                <div key={alert.id}>
                  {/* Draw trajectory path polyline */}
                  {routePositions.length > 1 && (
                    <Polyline positions={routePositions} color="#D92D20" weight={4} dashArray="5, 8" />
                  )}
                  {/* Draw SOS icon at last known position */}
                  <Marker position={[loc.lat, loc.lng]} icon={alertIcon}>
                    <Popup className="alert-popup">
                      <div className="alert-popup-content">
                        <strong className="danger-text">DISTRESS ALERT: {alert.userName}</strong> <br />
                        Type: {alert.type.toUpperCase()} <br />
                        Location: {alert.locationName || "Unknown"} <br />
                        Triggered: {alert.createdAt?.toDate ? alert.createdAt.toDate().toLocaleTimeString() : new Date(alert.createdAt).toLocaleTimeString()}
                      </div>
                    </Popup>
                  </Marker>
                </div>
              );
            })}
          </MapContainer>
        </div>

        {/* Family Directory / Telemetry Overlay */}
        <div className="family-status-sidebar">
          <h3 className="sidebar-section-title">Family Circle</h3>
          {familyMembers.length === 0 ? (
            <p className="no-members-text">No family members registered yet.</p>
          ) : (
            <div className="members-status-list">
              {familyMembers.map((member) => {
                const pos = getMemberPosition(member);
                const isOnline = member.phoneStatus === "online";
                return (
                  <div key={member.uid} className="member-status-card">
                    <div className="member-status-info">
                      <div className="member-avatar">
                        {member.name.charAt(0)}
                        <span className={`avatar-status-dot ${isOnline ? "online" : "offline"}`}></span>
                      </div>
                      <div className="member-text">
                        <span className="member-name-text">{member.name}</span>
                        <span className="member-sub-text">
                          {pos ? `${member.lastLocation?.speed || 0} km/h` : "No GPS data"} &middot; {formatLastSeen(member.lastSeen)}
                        </span>
                      </div>
                    </div>
                    {pos && (
                      <button
                        className="btn-locate-member"
                        onClick={() => setSelectedCenter(pos)}
                      >
                        Locate
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeAlerts.length > 0 && (
            <div className="active-alerts-overlay-card">
              <h3 className="sidebar-section-title danger-text">⚠️ Emergency Alerts</h3>
              <div className="active-alerts-list">
                {activeAlerts.map((alert) => {
                  const pos = alert.lastKnownLocation ? [alert.lastKnownLocation.lat, alert.lastKnownLocation.lng] : null;
                  return (
                    <div key={alert.id} className="active-alert-item">
                      <div className="alert-item-text">
                        <span className="alert-user-name">{alert.userName}</span>
                        <span className="alert-details-sub">Triggered SOS near {alert.locationName}</span>
                      </div>
                      {pos && (
                        <button
                          className="btn-locate-alert"
                          onClick={() => setSelectedCenter(pos)}
                        >
                          Focus
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
