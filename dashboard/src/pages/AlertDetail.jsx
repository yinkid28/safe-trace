import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, onSnapshot, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./AlertDetail.css";

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

// Custom active/alert icon
const distressIcon = L.divIcon({
  className: "custom-marker alert-details-map-marker",
  html: `<div class="marker-dot alert-details-dot"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Map recentering component
function RecenterMap({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

export default function AlertDetail() {
  const { alertId } = useParams();
  const { user } = useAuth();
  const [alertData, setAlertData] = useState(null);
  const [family, setFamily] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!alertId) return;

    // Listen to alert details in real-time
    const unsubscribe = onSnapshot(doc(db, "alerts", alertId), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAlertData({ id: snap.id, ...data });

        // Fetch family details if familyId is set
        if (data.familyId && data.familyId !== "no_family") {
          const famSnap = await getDoc(doc(db, "families", data.familyId));
          if (famSnap.exists()) {
            setFamily(famSnap.data());
          }
        }
      }
    }, (error) => {
      console.error("Error reading alert details:", error);
    });

    return unsubscribe;
  }, [alertId]);

  if (!alertData) {
    return (
      <div className="detail-loading-state">
        <p>Loading alert file details...</p>
      </div>
    );
  }

  // Handle status update (New -> Acknowledged -> Resolved)
  const handleStatusChange = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      const alertRef = doc(db, "alerts", alertId);
      const updateData = { status: newStatus };
      const currentTimeline = alertData.timeline || [];

      if (newStatus === "acknowledged") {
        updateData.acknowledgedAt = new Date();
        updateData.acknowledgedBy = user.uid;
        updateData.timeline = [
          ...currentTimeline,
          { event: `Alert acknowledged by Responder ${user.name}`, timestamp: new Date() }
        ];
      } else if (newStatus === "resolved") {
        updateData.resolvedAt = new Date();
        updateData.resolvedBy = user.uid;
        updateData.timeline = [
          ...currentTimeline,
          { event: `Alert resolved and closed by Responder ${user.name}`, timestamp: new Date() }
        ];
      }

      await updateDoc(alertRef, updateData);
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Add notes timeline log
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    try {
      const alertRef = doc(db, "alerts", alertId);
      const currentNotes = alertData.notes || [];
      const newNote = {
        text: noteText.trim(),
        author: user.uid,
        authorName: user.name,
        timestamp: new Date().toISOString(),
      };

      await updateDoc(alertRef, {
        notes: [...currentNotes, newNote],
      });
      setNoteText("");
    } catch (err) {
      console.error("Failed to append note:", err);
    }
  };

  const getFormattedTime = (dateObj) => {
    if (!dateObj) return "";
    const date = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getFormattedDate = (dateObj) => {
    if (!dateObj) return "";
    const date = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  const locationPos = alertData.lastKnownLocation?.lat 
    ? [alertData.lastKnownLocation.lat, alertData.lastKnownLocation.lng] 
    : null;

  const trajectoryPoints = alertData.trajectory 
    ? alertData.trajectory.map(p => [p.lat, p.lng]) 
    : [];

  return (
    <div className="alert-detail-page">
      {/* HEADER BARS */}
      <div className="detail-top-nav">
        <Link to="/dashboard" className="btn-back-feed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"1em",height:"1em",verticalAlign:"middle"}}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg> Back to Dashboard
        </Link>
        <div className="status-selector-wrapper">
          <label className="select-lbl">Incident Status: </label>
          <select
            value={alertData.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className={`status-dropdown-control ${alertData.status}`}
          >
            <option value="new">UNACKNOWLEDGED (NEW)</option>
            <option value="acknowledged">BEING HANDLED (ACTIVE)</option>
            <option value="resolved">RESOLVED (CLOSED)</option>
          </select>
        </div>
      </div>

      {/* BODY GRID CORES */}
      <div className="detail-grid-layout">
        {/* LEFT COLUMN: Map & Telemetry Details */}
        <div className="detail-column-left">
          {/* USER DISTRESS DETAILS */}
          <section className="detail-card-section user-meta-details-card">
            <div className="meta-card-header">
              <h2 className="meta-user-name">{alertData.userName}</h2>
              <span className={`alert-badge-type ${alertData.type}`}>
                {alertData.type.toUpperCase()}
              </span>
            </div>
            <div className="meta-fields-grid">
              <div className="meta-field">
                <span className="field-lbl">Triggered</span>
                <span className="field-val">
                  {getFormattedDate(alertData.createdAt)} at {getFormattedTime(alertData.createdAt)}
                </span>
              </div>
              <div className="meta-field">
                <span className="field-lbl">Linked Family</span>
                <span className="field-val">{family?.name || "N/A"}</span>
              </div>
              <div className="meta-field">
                <span className="field-lbl">Phone Line Connection</span>
                <span className={`field-val ${alertData.phoneStatus === "offline" ? "danger-text" : "safe-text"}`}>
                  {alertData.phoneStatus === "offline" ? "OFFLINE" : "ONLINE"}
                </span>
              </div>
              {alertData.riskScore !== undefined && alertData.riskScore !== null && (
                <div className="meta-field">
                  <span className="field-lbl">Movement Risk Score</span>
                  <span className="field-val risk-value">{Math.round(alertData.riskScore * 100)}%</span>
                </div>
              )}
            </div>
          </section>

          {/* Leaflet Journey Trajectory Map */}
          {locationPos && (
            <section className="detail-card-section map-details-card">
              <h3 className="card-inner-title">Distress Map Trajectory</h3>
              <div className="details-map-frame">
                <MapContainer
                  center={locationPos}
                  zoom={14}
                  scrollWheelZoom={true}
                  className="alert-route-leaflet-map"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <RecenterMap center={locationPos} />

                  {trajectoryPoints.length > 1 && (
                    <Polyline positions={trajectoryPoints} color="#D92D20" weight={4} />
                  )}

                  <Marker position={locationPos} icon={distressIcon}>
                    <Popup>
                      <strong>{alertData.userName}</strong> <br />
                      Last Location: {alertData.locationName || "Coordinates"} <br />
                      Speed: {alertData.lastKnownLocation?.speed || 0} km/h
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
              <div className="coordinates-readout">
                <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"0.9em",height:"0.9em",verticalAlign:"middle",display:"inline"}}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg> Location Coordinates: <strong>{alertData.lastKnownLocation.lat.toFixed(5)} N, {alertData.lastKnownLocation.lng.toFixed(5)} E</strong></span>
                {alertData.locationName && (
                  <span className="loc-name-txt">Location Name: <strong>{alertData.locationName}</strong></span>
                )}
              </div>
            </section>
          )}

          {/* AI EXPLANATIONS */}
          {alertData.explanations?.length > 0 && (
            <section className="detail-card-section ai-explanations-card">
              <h3 className="card-inner-title danger-text"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"1em",height:"1em",verticalAlign:"middle",display:"inline",marginRight:"0.3em"}}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" /></svg>AI Anomaly Explanation Log</h3>
              <ul className="details-ai-list">
                {alertData.explanations.map((exp, i) => (
                  <li key={i} className="details-ai-item">{exp}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN: Evidence, Timeline & Notes */}
        <div className="detail-column-right">
          {/* EVIDENCE PHOTOS */}
          {alertData.evidenceUrls?.length > 0 && (
            <section className="detail-card-section evidence-card">
              <h3 className="card-inner-title">Captured SOS Evidence</h3>
              <div className="evidence-grid">
                {alertData.evidenceUrls.map((url, i) => (
                  <div key={i} className="evidence-thumbnail-wrapper" onClick={() => setSelectedPhoto(url)}>
                    <img src={url} alt="Emergency capture" className="evidence-thumbnail" />
                    <span className="zoom-hover-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"0.75em",height:"0.75em",verticalAlign:"middle",display:"inline",marginRight:"0.2em"}}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>Expand</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TIMELINE LOG */}
          {alertData.timeline?.length > 0 && (
            <section className="detail-card-section timeline-card">
              <h3 className="card-inner-title">Chronological Log Timeline</h3>
              <div className="timeline-track-list">
                {alertData.timeline.map((event, i) => (
                  <div key={i} className="timeline-node-item">
                    <span className="node-time-lbl">{getFormattedTime(event.timestamp)}</span>
                    <span className="node-desc-text">{event.event}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* NOTES AREA */}
          <section className="detail-card-section notes-card">
            <h3 className="card-inner-title">Staff Action Notes</h3>
            
            <form onSubmit={handleAddNote} className="add-note-form-control">
              <textarea
                placeholder="Type response notes, dispatched unit logs, actions taken..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="note-textarea-box"
                required
              />
              <button type="submit" className="btn-primary note-submit-btn">
                Add Log Note
              </button>
            </form>

            <div className="notes-feed-list-wrapper">
              {(alertData.notes || []).length === 0 ? (
                <p className="no-notes-placeholder">No action notes logged yet.</p>
              ) : (
                <div className="notes-thread-list">
                  {alertData.notes.map((note, i) => (
                    <div key={i} className="note-bubble-card">
                      <div className="note-bubble-header">
                        <span className="note-bubble-author">{note.authorName}</span>
                        <span className="note-bubble-time">{new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &middot; {new Date(note.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <p className="note-bubble-text">{note.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* FULL PHOTO VIEW LIGHTBOX */}
      {selectedPhoto && (
        <div className="photo-lightbox-backdrop" onClick={() => setSelectedPhoto(null)}>
          <div className="photo-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-lightbox" onClick={() => setSelectedPhoto(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"1.5em",height:"1.5em"}}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <img src={selectedPhoto} alt="Full view" className="lightbox-img" />
            <div className="lightbox-actions-strip">
              <a href={selectedPhoto} target="_blank" rel="noreferrer" className="btn-lightbox-download" download>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"1em",height:"1em",verticalAlign:"middle",display:"inline",marginRight:"0.3em"}}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>Open Full Resolution Link
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
