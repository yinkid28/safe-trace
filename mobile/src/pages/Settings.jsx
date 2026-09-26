import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./Settings.css";

// Workaround for Leaflet marker icons in Vite
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom picker icon
const pickerIcon = L.divIcon({
  className: "custom-marker picker-marker",
  html: `<div class="marker-dot picker-dot"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Map click listener component
function MapEvents({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function Settings() {
  const { user, logout, refreshProfile } = useAuth();
  const [agency, setAgency] = useState(null);
  
  // Safe Zone Picker States
  const [zoneLabel, setZoneLabel] = useState("");
  const [zoneLat, setZoneLat] = useState("");
  const [zoneLng, setZoneLng] = useState("");
  const [modifyingZones, setModifyingZones] = useState(false);
  const [pickerPosition, setPickerPosition] = useState(null);
  const [shareZone, setShareZone] = useState(false);
  const [family, setFamily] = useState(null);

  const isHomeLabel = (label) => /\bhome\b/i.test(label);

  // Fetch family data for sharing
  useEffect(() => {
    if (!user?.familyId) { setFamily(null); return; }
    getDoc(doc(db, "families", user.familyId)).then((snap) => {
      if (snap.exists()) setFamily(snap.data());
    });
  }, [user?.familyId]);

  // Fetch Linked Agency Details
  useEffect(() => {
    // default fallback to agency_yaba if not set
    const agencyId = user?.agencyId || "agency_yaba";
    getDoc(doc(db, "agencies", agencyId)).then((snap) => {
      if (snap.exists()) {
        setAgency(snap.data());
      }
    });
  }, [user?.agencyId]);

  if (!user) return null;

  const handleMapClick = (lat, lng) => {
    setZoneLat(lat.toFixed(6));
    setZoneLng(lng.toFixed(6));
    setPickerPosition([lat, lng]);
  };

  const handleAddSafeZone = async (e) => {
    e.preventDefault();
    if (!zoneLabel || !zoneLat || !zoneLng) return;

    setModifyingZones(true);
    try {
      const newZone = {
        label: zoneLabel.trim(),
        lat: parseFloat(zoneLat),
        lng: parseFloat(zoneLng),
      };

      const updatedSafeZones = [...(user.safeZones || []), newZone];
      await updateDoc(doc(db, "users", user.uid), {
        safeZones: updatedSafeZones,
      });

      // Auto-share "Home" zones or manually shared zones to family
      if (user.familyId && (isHomeLabel(newZone.label) || shareZone)) {
        await updateDoc(doc(db, "families", user.familyId), {
          sharedSafeZones: arrayUnion({
            label: newZone.label,
            lat: newZone.lat,
            lng: newZone.lng,
            addedBy: user.uid,
          }),
        });
        const snap = await getDoc(doc(db, "families", user.familyId));
        if (snap.exists()) setFamily(snap.data());
      }

      await refreshProfile();
      setZoneLabel("");
      setZoneLat("");
      setZoneLng("");
      setPickerPosition(null);
      setShareZone(false);
      alert("Safe Zone added successfully!");
    } catch (err) {
      console.error("Failed to add safe zone:", err);
      alert("Error adding safe zone.");
    } finally {
      setModifyingZones(false);
    }
  };

  const handleDeleteSafeZone = async (index) => {
    if (!window.confirm("Are you sure you want to remove this Safe Zone?")) return;
    setModifyingZones(true);
    try {
      const deletedZone = (user.safeZones || [])[index];
      const updatedSafeZones = (user.safeZones || []).filter((_, i) => i !== index);
      await updateDoc(doc(db, "users", user.uid), {
        safeZones: updatedSafeZones,
      });

      // Also remove from family shared zones if it was shared by this user
      if (user.familyId && family?.sharedSafeZones) {
        const updatedShared = family.sharedSafeZones.filter(
          (sz) => !(sz.addedBy === user.uid && sz.lat === deletedZone.lat && sz.lng === deletedZone.lng && sz.label === deletedZone.label)
        );
        if (updatedShared.length !== family.sharedSafeZones.length) {
          await updateDoc(doc(db, "families", user.familyId), {
            sharedSafeZones: updatedShared,
          });
          setFamily((prev) => prev ? { ...prev, sharedSafeZones: updatedShared } : prev);
        }
      }

      await refreshProfile();
    } catch (err) {
      console.error("Failed to remove safe zone:", err);
    } finally {
      setModifyingZones(false);
    }
  };

  const defaultCenter = [6.5158, 3.3775]; // Yabatech center

  return (
    <div className="settings-page">
      <header className="settings-header">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-subtitle">Manage safe zones, profile, & responder agency</p>
      </header>

      <div className="settings-scroll-container">
        {/* PROFILE BLOCK */}
        <section className="settings-section profile-card">
          <h2 className="section-title-line">Personal Information</h2>
          <div className="profile-info-grid">
            <div className="profile-field">
              <span className="profile-lbl">Full Name</span>
              <span className="profile-val">{user.name}</span>
            </div>
            <div className="profile-field">
              <span className="profile-lbl">Email Address</span>
              <span className="profile-val">{user.email}</span>
            </div>
            <div className="profile-field">
              <span className="profile-lbl">Phone Number</span>
              <span className="profile-val">{user.phone}</span>
            </div>
            <div className="profile-field">
              <span className="profile-lbl">Account Role</span>
              <span className="profile-val role-pill">{user.role?.toUpperCase()}</span>
            </div>
          </div>
        </section>

        {/* MAPPED SAFE ZONE COORDINATOR */}
        {user.role !== "agency_staff" && (
          <section className="settings-section">
            <h2 className="section-title-line">Safe Zones Map Coordinator</h2>
            <p className="section-desc-text">
              Tap anywhere on the map to pre-fill coordinates, give the zone a name, and save it.
            </p>

            <div className="settings-picker-layout">
              {/* Coordinate map */}
              <div className="picker-map-wrapper">
                <MapContainer
                  center={defaultCenter}
                  zoom={14}
                  scrollWheelZoom={true}
                  className="picker-leaflet-map"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapEvents onMapClick={handleMapClick} />
                  
                  {/* Plot currently selecting picker */}
                  {pickerPosition && (
                    <Marker position={pickerPosition} icon={pickerIcon} />
                  )}

                  {/* Plot existing safe zones */}
                  {(user.safeZones || []).map((zone, i) => (
                    <Marker key={i} position={[zone.lat, zone.lng]}>
                      <Popup>
                        <strong>{zone.label}</strong> <br />
                        Lat: {zone.lat.toFixed(5)} <br />
                        Lng: {zone.lng.toFixed(5)}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>

              {/* Coordinator Form */}
              <form onSubmit={handleAddSafeZone} className="picker-coords-form">
                <div className="picker-input-group">
                  <label className="picker-input-lbl">Zone Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Home, Office, Yabatech"
                    value={zoneLabel}
                    onChange={(e) => setZoneLabel(e.target.value)}
                    className="auth-input"
                    required
                  />
                </div>
                <div className="picker-coords-inputs-row">
                  <div className="picker-input-group">
                    <label className="picker-input-lbl">Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="6.5158"
                      value={zoneLat}
                      onChange={(e) => setZoneLat(e.target.value)}
                      className="auth-input"
                      required
                    />
                  </div>
                  <div className="picker-input-group">
                    <label className="picker-input-lbl">Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="3.3775"
                      value={zoneLng}
                      onChange={(e) => setZoneLng(e.target.value)}
                      className="auth-input"
                      required
                    />
                  </div>
                </div>
                {user.familyId && (
                  <label className="share-zone-toggle">
                    <input
                      type="checkbox"
                      checked={shareZone || isHomeLabel(zoneLabel)}
                      onChange={(e) => setShareZone(e.target.checked)}
                    />
                    Share with family
                    {isHomeLabel(zoneLabel) && (
                      <span className="auto-share-hint">(auto-shared)</span>
                    )}
                  </label>
                )}
                <button
                  type="submit"
                  className="btn-primary picker-submit-btn"
                  disabled={modifyingZones}
                >
                  {modifyingZones ? "Adding..." : "Add Safe Zone"}
                </button>
              </form>
            </div>

            {/* List of existing zones */}
            <div className="existing-zones-list-wrapper">
              <h3 className="sub-section-title">Your Safe Zones</h3>
              {(user.safeZones || []).length === 0 ? (
                <p className="card-detail">No safe zones configured yet.</p>
              ) : (
                <div className="zones-grid-layout">
                  {(user.safeZones || []).map((zone, i) => (
                    <div key={i} className="zone-grid-card">
                      <div className="zone-grid-card-text">
                        <span className="zone-grid-lbl">{zone.label}</span>
                        <span className="zone-grid-coords">
                          {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)}
                        </span>
                      </div>
                      <button
                        className="btn-delete-zone-grid"
                        onClick={() => handleDeleteSafeZone(i)}
                        disabled={modifyingZones}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* AGENCY DETAILS */}
        {agency && (
          <section className="settings-section agency-details-card">
            <h2 className="section-title-line">Emergency Responder Agency</h2>
            <div className="agency-details-body">
              <h3 className="agency-name-title">{agency.name}</h3>
              <p className="agency-info-desc">
                Linked fall-back responder. Alerts escalated to this agency will display live on their monitoring terminal.
              </p>
              <div className="agency-contacts-grid">
                <div className="agency-contact-item">
                  <span className="contact-lbl">Hotline</span>
                  <span className="contact-val">{agency.phone || "N/A"}</span>
                </div>
                <div className="agency-contact-item">
                  <span className="contact-lbl">Command Center Address</span>
                  <span className="contact-val">{agency.address || "N/A"}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* LOGOUT ACTION */}
        <section className="logout-section">
          <button className="btn-danger-logout" onClick={logout}>
            Log Out Account
          </button>
        </section>
      </div>
    </div>
  );
}
