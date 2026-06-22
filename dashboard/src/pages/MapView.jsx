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

const panicIcon = createDotIcon("panic-dot", "🚨");
const anomalyIcon = createDotIcon("anomaly-dot", "🤖");
const offlineIcon = createDotIcon("offline-dot", "🔌");
const checkinIcon = createDotIcon("checkin-dot", "🕒");

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
                      Open Incident Details &rarr;
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
