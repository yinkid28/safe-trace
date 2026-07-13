import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./Alerts.css";

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

export default function FamilyAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("all");
  const [selectedAlert, setSelectedAlert] = useState(null);

  useEffect(() => {
    if (!user?.familyId) return;

    // Real-time listener for alerts sorted by creation time
    const q = query(
      collection(db, "alerts"),
      where("familyId", "==", user.familyId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAlerts(list);
    }, (error) => {
      console.error("Error loading alerts:", error);
    });

    return unsubscribe;
  }, [user?.familyId]);

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === "all") return true;
    if (filter === "panic") return alert.type === "panic";
    if (filter === "ai_anomaly") return alert.type === "ai_anomaly";
    if (filter === "resolved") return alert.status === "resolved";
    return true;
  });

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="alerts-page">
      <header className="alerts-header">
        <h1 className="alerts-title">Alert History</h1>
        <p className="alerts-subtitle">Recent distress alerts & incidents in your family</p>
      </header>

      {/* FILTER TABS */}
      <div className="alerts-tabs">
        {["all", "panic", "ai_anomaly", "resolved"].map((tab) => (
          <button
            key={tab}
            className={`alert-tab-btn ${filter === tab ? "active" : ""}`}
            onClick={() => setFilter(tab)}
          >
            {tab === "ai_anomaly" ? "AI Anomalies" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* ALERT FEED */}
      {filteredAlerts.length === 0 ? (
        <div className="empty-alerts-card">
          <p className="empty-alerts-text">No alerts found matching this filter.</p>
        </div>
      ) : (
        <div className="alerts-feed-list">
          {filteredAlerts.map((alert) => {
            const isResolved = alert.status === "resolved";
            const isPanic = alert.type === "panic";
            const isAnomaly = alert.type === "ai_anomaly";
            
            return (
              <div
                key={alert.id}
                className={`alert-feed-card ${alert.status} ${alert.type}`}
                onClick={() => setSelectedAlert(alert)}
              >
                <div className="alert-card-row">
                  <span className={`alert-badge-type ${alert.type}`}>
                    {alert.type.toUpperCase()}
                  </span>
                  <span className="alert-card-time">
                    {formatDate(alert.createdAt)} &middot; {formatTime(alert.createdAt)}
                  </span>
                </div>
                <div className="alert-card-body">
                  <h3 className="alert-card-user">{alert.userName}</h3>
                  <p className="alert-card-loc">Last seen: {alert.locationName || "Unknown"}</p>
                </div>
                <div className="alert-card-footer">
                  <span className={`alert-card-status ${alert.status}`}>
                    {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
                  </span>
                  {alert.riskScore !== undefined && alert.riskScore !== null && (
                    <span className="alert-card-risk">Risk: {Math.round(alert.riskScore * 100)}%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DETAILED MODAL */}
      {selectedAlert && (
        <div className="alert-modal-backdrop" onClick={() => setSelectedAlert(null)}>
          <div className="alert-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-modal" onClick={() => setSelectedAlert(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"1.25em",height:"1.25em"}}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            
            <div className="modal-header">
              <span className={`alert-badge-type ${selectedAlert.type}`}>
                {selectedAlert.type.toUpperCase()}
              </span>
              <h2 className="modal-title">{selectedAlert.userName}</h2>
              <p className="modal-subtitle">
                {formatDate(selectedAlert.createdAt)} at {formatTime(selectedAlert.createdAt)}
              </p>
            </div>

            <div className="modal-content-scrollable">
              {/* Telemetry info */}
              <div className="modal-telemetry-strip">
                <div className="modal-tel-item">
                  <span className="modal-tel-lbl">Status</span>
                  <span className={`modal-tel-val status-${selectedAlert.status}`}>
                    {selectedAlert.status.toUpperCase()}
                  </span>
                </div>
                {selectedAlert.lastKnownLocation?.speed !== undefined && (
                  <div className="modal-tel-item">
                    <span className="modal-tel-lbl">Last Speed</span>
                    <span className="modal-tel-val">{selectedAlert.lastKnownLocation.speed} km/h</span>
                  </div>
                )}
                {selectedAlert.riskScore !== undefined && selectedAlert.riskScore !== null && (
                  <div className="modal-tel-item">
                    <span className="modal-tel-lbl">Risk Score</span>
                    <span className="modal-tel-val">{Math.round(selectedAlert.riskScore * 100)}%</span>
                  </div>
                )}
              </div>

              {/* Map displaying location/trajectory */}
              {selectedAlert.lastKnownLocation?.lat && (
                <div className="modal-map-container">
                  <MapContainer
                    center={[selectedAlert.lastKnownLocation.lat, selectedAlert.lastKnownLocation.lng]}
                    zoom={14}
                    scrollWheelZoom={false}
                    className="modal-route-map"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {selectedAlert.trajectory?.length > 1 && (
                      <Polyline
                        positions={selectedAlert.trajectory.map(p => [p.lat, p.lng])}
                        color={selectedAlert.type === "panic" ? "#D92D20" : "#F59E0B"}
                        weight={4}
                      />
                    )}
                    <Marker position={[selectedAlert.lastKnownLocation.lat, selectedAlert.lastKnownLocation.lng]} />
                  </MapContainer>
                </div>
              )}

              {/* Explanations section */}
              {selectedAlert.explanations?.length > 0 && (
                <div className="modal-section">
                  <h3 className="modal-section-title">AI System Findings</h3>
                  <ul className="modal-explanations-list">
                    {selectedAlert.explanations.map((exp, i) => (
                      <li key={i} className="modal-explanation-item">{exp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Evidence captured */}
              {selectedAlert.evidenceUrls?.length > 0 && (
                <div className="modal-section">
                  <h3 className="modal-section-title">Evidence Photo</h3>
                  <div className="modal-evidence-gallery">
                    {selectedAlert.evidenceUrls.map((url, i) => (
                      <img key={i} src={url} alt="SOS Evidence" className="modal-evidence-img" />
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline events */}
              {selectedAlert.timeline?.length > 0 && (
                <div className="modal-section">
                  <h3 className="modal-section-title">Event Log</h3>
                  <div className="modal-timeline">
                    {selectedAlert.timeline.map((event, i) => (
                      <div key={i} className="modal-timeline-node">
                        <span className="modal-node-time">{formatTime(event.timestamp)}</span>
                        <span className="modal-node-text">{event.event}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
