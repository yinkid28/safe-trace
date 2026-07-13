import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MapView.css";

// Workaround for Leaflet icons in Vite
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom color-coded marker dots
const createDotIcon = (colorClass, textSymbol) => {
  return L.divIcon({
    className: `custom-marker map-view-icon-wrapper`,
    html: `<div class="marker-dot map-view-dot ${colorClass}">${textSymbol}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const panicIcon = createDotIcon("panic-dot", '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>');
const anomalyIcon = createDotIcon("anomaly-dot", '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M9 2v2"/><path d="M15 20v2"/><path d="M9 20v2"/><path d="M20 9h2"/><path d="M20 15h2"/><path d="M2 9h2"/><path d="M2 15h2"/></svg>');
const offlineIcon = createDotIcon("offline-dot", '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="2" y1="2" x2="22" y2="22"/><path d="M8.5 16.5a5 5 0 017 0"/><path d="M2 8.82a15 15 0 014.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="M16.85 11.25a10 10 0 012.22 1.68"/><path d="M5 12.86a10 10 0 013.66-2.54"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>');
const checkinIcon = createDotIcon("checkin-dot", '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>');

export default function MapView() {
  const { user } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    if (!user?.agencyId) return;

    // Listen to active alerts in real-time
    const q = query(
      collection(db, "alerts"),
      where("agencyId", "==", user.agencyId),
      where("status", "in", ["new", "acknowledged"])
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setActiveAlerts(list);
    }, (error) => {
      console.error("Error reading situational map alerts:", error);
    });

    return unsubscribe;
  }, [user?.agencyId]);

  const filteredAlerts = activeAlerts.filter((alert) => {
    if (typeFilter === "all") return true;
    return alert.type === typeFilter;
  });

  const getMarkerIcon = (type) => {
    if (type === "panic") return panicIcon;
    if (type === "ai_anomaly") return anomalyIcon;
    if (type === "offline") return offlineIcon;
    return checkinIcon;
  };

  const defaultCenter = [6.5095, 3.3810]; // Lagos Sabo, Yaba center

  return (
    <div className="situational-map-page">
      <header className="map-view-header">
        <div className="map-view-header-left">
          <h1 className="map-view-title">Situational Command Map</h1>
          <p className="map-view-subtitle">Real-time spatial locations of all active agency alerts</p>
        </div>
        <div className="map-view-header-right">
          <label className="filter-lbl" htmlFor="type-filter">Filter Alerts: </label>
          <select
            id="type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="filter-select-control"
          >
            <option value="all">ALL ACTIVE ALERTS</option>
            <option value="panic">PANIC SOS ONLY</option>
            <option value="ai_anomaly">AI ANOMALIES ONLY</option>
            <option value="offline">OFFLINE TRIGGERS ONLY</option>
            <option value="checkin">CHECK-IN WAITING ONLY</option>
          </select>
        </div>
      </header>

      {/* FULL-HEIGHT MAP CONTAINER */}
      <div className="situational-map-frame">
        <MapContainer
          center={defaultCenter}
          zoom={13}
          scrollWheelZoom={true}
          className="situational-leaflet-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredAlerts.map((alert) => {
            const loc = alert.lastKnownLocation;
            if (!loc?.lat || !loc?.lng) return null;

            return (
              <Marker
                key={alert.id}
                position={[loc.lat, loc.lng]}
                icon={getMarkerIcon(alert.type)}
              >
                <Popup className="situational-popup">
                  <div className="situational-popup-content">
                    <span className={`popup-alert-badge ${alert.type}`}>
                      {alert.type.toUpperCase()}
                    </span>
                    <h3 className="popup-user-name">{alert.userName}</h3>
                    <p className="popup-details">Last seen near {alert.locationName || "Yaba"}</p>
                    <div className="popup-divider"></div>
                    <Link to={`/alerts/${alert.id}`} className="btn-popup-open-details">
                      Open Incident Details <span style={{display:"inline-block",verticalAlign:"middle",width:"0.85em",height:"0.85em"}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg></span>
                    </Link>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Floating count badge overlay */}
        <div className="map-floating-overlay-card">
          <span className="overlay-lbl">Command Monitor</span>
          <span className="overlay-val">Showing: {filteredAlerts.length} / {activeAlerts.length} active alerts</span>
        </div>
      </div>
    </div>
  );
}
