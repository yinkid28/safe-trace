import { useEffect, useState, useRef } from "react";
import { Link } from "react-router";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { db, storage } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocation } from "../hooks/useLocation";
import { useFamilyMembers } from "../hooks/useFamilyMembers";
import { useAnomalyDetection } from "../hooks/useAnomalyDetection";
import "./Home.css";

// Workaround for Leaflet default marker icons failing under Vite
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const DEFAULT_AGENCY_ID = "agency_yaba";

/** Generate a human-readable join code like "ADK-4429" */
function generateJoinCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion
  const l1 = letters[Math.floor(Math.random() * letters.length)];
  const l2 = letters[Math.floor(Math.random() * letters.length)];
  const l3 = letters[Math.floor(Math.random() * letters.length)];
  const num = String(Math.floor(1000 + Math.random() * 9000)); // 4 digits
  return `${l1}${l2}${l3}-${num}`;
}

const SIMULATED_ROUTE = [
  { lat: 6.5095, lng: 3.3810, label: "Sabo, Yaba", speed: 15, heading: 45 },
  { lat: 6.5158, lng: 3.3775, label: "Yabatech Campus", speed: 22, heading: 120 },
  { lat: 6.5190, lng: 3.3680, label: "Tejuosho Market", speed: 45, heading: 270 },
  { lat: 6.5250, lng: 3.3700, label: "Jibowu", speed: 30, heading: 90 },
  { lat: 6.5158, lng: 3.3985, label: "UNILAG", speed: 12, heading: 180 },
];

// Component to dynamically pan map to current location
function ChangeMapView({ center }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

export default function Home() {
  const { user, refreshProfile } = useAuth();
  const { position } = useLocation();
  const { members } = useFamilyMembers(user?.familyId, user?.uid);
  const {
    anomalyAlert, escalate, countdown: aiCountdown,
    confirmSafe, resetEscalation, enabled: aiEnabled,
  } = useAnomalyDetection(user);
  const [family, setFamily] = useState(null);
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [showJoinFamily, setShowJoinFamily] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [joinFamilyId, setJoinFamilyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Agency picker state
  const [agencies, setAgencies] = useState([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState("");
  const [showDirectAgency, setShowDirectAgency] = useState(false);
  const [linkingAgency, setLinkingAgency] = useState(false);

  // Safe Zones Panel States
  const [showAddZone, setShowAddZone] = useState(false);
  const [zoneLabel, setZoneLabel] = useState("");
  const [zoneLat, setZoneLat] = useState("");
  const [zoneLng, setZoneLng] = useState("");
  const [modifyingZones, setModifyingZones] = useState(false);

  // Panic SOS & Tracking States
  const [panicCountdown, setPanicCountdown] = useState(null);
  const [currentAlertId, setCurrentAlertId] = useState(null);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentSimIndex, setCurrentSimIndex] = useState(0);
  const [journeyPath, setJourneyPath] = useState([]); // List of lat/lng recorded during active tracking

  const trackingInterval = useRef(null);
  const countdownInterval = useRef(null);
  const positionRef = useRef(null);

  // Keep positionRef in sync so tracking interval can read latest GPS
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Fetch Family Data
  useEffect(() => {
    if (!user?.familyId) {
      setFamily(null);
      return;
    }

    getDoc(doc(db, "families", user.familyId)).then((snap) => {
      if (snap.exists()) {
        setFamily(snap.data());
      }
    });
  }, [user?.familyId]);

  // Fetch verified agencies for picker
  useEffect(() => {
    const q = query(collection(db, "agencies"), where("status", "==", "verified"));
    getDocs(q).then((snap) => {
      setAgencies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }).catch(() => {});
  }, []);

  // AI anomaly auto-escalation: create an alert if user didn't confirm safe
  useEffect(() => {
    if (!escalate || !anomalyAlert) return;

    const loc = position
      ? { lat: position.lat, lng: position.lng, speed: position.speed || 0, heading: position.heading || 0 }
      : { lat: SIMULATED_ROUTE[0].lat, lng: SIMULATED_ROUTE[0].lng, speed: 0, heading: 0 };

    const alertRef = doc(collection(db, "alerts"));
    setDoc(alertRef, {
      userId: user.uid,
      userName: user.name,
      familyId: user.familyId || "no_family",
      agencyId: family?.agencyId || user.directAgencyId || DEFAULT_AGENCY_ID,
      type: "ai_anomaly",
      status: "new",
      createdAt: new Date(),
      lastKnownLocation: loc,
      locationName: `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
      riskScore: anomalyAlert.riskScore,
      explanations: anomalyAlert.explanations,
      evidenceUrls: [],
      escalated: true,
      escalatedAt: new Date(),
      trajectory: [{ lat: loc.lat, lng: loc.lng, timestamp: new Date().toISOString() }],
      timeline: [
        { event: "AI flagged anomalous movement", timestamp: new Date() },
        { event: "User did not respond to check-in", timestamp: new Date() },
        { event: "Alert auto-escalated to agency", timestamp: new Date() },
      ],
      notes: [],
    }).then(() => {
      resetEscalation();
    }).catch((err) => {
      console.error("AI alert creation failed:", err);
      resetEscalation();
    });
  }, [escalate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      stopTracking();
      if (countdownInterval.current) clearInterval(countdownInterval.current);
    };
  }, []);

  if (!user) return null;

  const handleCreateFamily = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmed = familyName.trim();
    if (!trimmed) {
      setError("Please enter a family name.");
      return;
    }

    const agencyId = selectedAgencyId || DEFAULT_AGENCY_ID;
    if (!agencyId) {
      setError("Please select a backup security agency.");
      return;
    }

    setCreating(true);
    try {
      const joinCode = generateJoinCode();
      const familyRef = doc(collection(db, "families"));
      await setDoc(familyRef, {
        name: trimmed,
        joinCode,
        members: [user.uid],
        adminUserId: user.uid,
        agencyId,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", user.uid), {
        familyId: familyRef.id,
        role: "family_admin",
      });

      await refreshProfile();
      setShowCreateFamily(false);
      setFamilyName("");
      setSelectedAgencyId("");
    } catch (err) {
      console.error("Create family error:", err);
      setError(err.message || "Failed to create family. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  // Safe Zones Handling
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

      await refreshProfile();
      setZoneLabel("");
      setZoneLat("");
      setZoneLng("");
      setShowAddZone(false);
    } catch (err) {
      console.error("Failed to add safe zone:", err);
    } finally {
      setModifyingZones(false);
    }
  };

  const handleDeleteSafeZone = async (index) => {
    setModifyingZones(true);
    try {
      const updatedSafeZones = (user.safeZones || []).filter((_, i) => i !== index);
      await updateDoc(doc(db, "users", user.uid), {
        safeZones: updatedSafeZones,
      });
      await refreshProfile();
    } catch (err) {
      console.error("Failed to delete safe zone:", err);
    } finally {
      setModifyingZones(false);
    }
  };

  // Panic Button Actions
  const startPanicCountdown = () => {
    if (panicCountdown !== null || isAlertActive) return;
    setPanicCountdown(3);

    countdownInterval.current = setInterval(() => {
      setPanicCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval.current);
          triggerPanicAlert();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelPanicCountdown = () => {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
    }
    setPanicCountdown(null);
  };

  const triggerPanicAlert = async () => {
    setIsAlertActive(true);

    // Use real GPS if available, fall back to simulated coordinates (but zero speed/heading)
    const fallbackLoc = SIMULATED_ROUTE[0];
    const loc = position
      ? { lat: position.lat, lng: position.lng, speed: position.speed || 0, heading: position.heading || 0 }
      : { lat: fallbackLoc.lat, lng: fallbackLoc.lng, speed: 0, heading: 0 };

    const timelineEvents = [
      { event: "Panic triggered", timestamp: new Date() },
    ];

    // Attempt to capture evidence photo before creating the alert
    let photoBase64 = null;
    try {
      const photo = await Camera.getPhoto({
        quality: 70,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        allowEditing: false,
        width: 1280,
      });
      photoBase64 = photo.base64String;
      timelineEvents.push({ event: "Evidence photo captured", timestamp: new Date() });
    } catch {
      // Camera unavailable or permission denied — continue without photo
    }

    try {
      const alertRef = doc(collection(db, "alerts"));
      const alertId = alertRef.id;
      setCurrentAlertId(alertId);

      timelineEvents.push({ event: "Alert escalated to agency", timestamp: new Date() });

      const alertData = {
        userId: user.uid,
        userName: user.name,
        familyId: user.familyId || "no_family",
        agencyId: family?.agencyId || user.directAgencyId || DEFAULT_AGENCY_ID,
        type: "panic",
        status: "new",
        createdAt: new Date(),
        lastKnownLocation: loc,
        locationName: position ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}` : fallbackLoc.label,
        riskScore: 1.0,
        explanations: ["Manual panic button triggered by user"],
        evidenceUrls: [],
        escalated: true,
        escalatedAt: new Date(),
        trajectory: [{ lat: loc.lat, lng: loc.lng, timestamp: new Date().toISOString() }],
        timeline: timelineEvents,
        notes: [],
      };

      await setDoc(alertRef, alertData);

      // Upload evidence photo to Cloud Storage if captured
      if (photoBase64) {
        try {
          const byteChars = atob(photoBase64);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteArray[i] = byteChars.charCodeAt(i);
          }
          const blob = new Blob([byteArray], { type: "image/jpeg" });
          const storageRef = ref(storage, `evidence/${alertId}/photo_${Date.now()}.jpg`);
          await uploadBytes(storageRef, blob);
          const url = await getDownloadURL(storageRef);
          await updateDoc(alertRef, { evidenceUrls: arrayUnion(url) });
        } catch {
          // Photo upload failed — alert still exists without the image
        }
      }

      // Start location tracking
      setJourneyPath([{ lat: loc.lat, lng: loc.lng }]);
      startTracking(alertId, 0);
    } catch (err) {
      console.error("SOS Trigger Error:", err);
      setIsAlertActive(false);
    }
  };

  // Safe Tracking / Simulated Journey Methods
  const startTracking = (alertId = null, startIdx = 0) => {
    setIsTracking(true);
    let simIdx = startIdx;
    setCurrentSimIndex(simIdx);

    // Use real GPS if available for initial point
    const gps = positionRef.current;
    const initialPt = gps || SIMULATED_ROUTE[simIdx];
    const path = [{ lat: initialPt.lat, lng: initialPt.lng }];
    setJourneyPath(path);

    trackingInterval.current = setInterval(async () => {
      // Prefer real GPS; fall back to simulated route
      const currentGps = positionRef.current;
      let loc;
      if (currentGps) {
        loc = {
          lat: currentGps.lat,
          lng: currentGps.lng,
          speed: currentGps.speed || 0,
          heading: currentGps.heading || 0,
          label: `${currentGps.lat.toFixed(4)}, ${currentGps.lng.toFixed(4)}`,
        };
      } else {
        simIdx = (simIdx + 1) % SIMULATED_ROUTE.length;
        setCurrentSimIndex(simIdx);
        loc = SIMULATED_ROUTE[simIdx];
      }

      const newCoord = { lat: loc.lat, lng: loc.lng };
      setJourneyPath((prev) => [...prev, newCoord]);

      // 1. Update User Document
      try {
        await updateDoc(doc(db, "users", user.uid), {
          lastLocation: {
            lat: loc.lat,
            lng: loc.lng,
            speed: loc.speed,
            heading: loc.heading,
          },
          lastSeen: new Date(),
        });
      } catch (err) {
        console.error("Error updating user location:", err);
      }

      // 2. If SOS Alert is active, update Alert Document trajectory
      const activeAlertId = alertId || currentAlertId;
      if (activeAlertId) {
        try {
          const alertRef = doc(db, "alerts", activeAlertId);
          const snap = await getDoc(alertRef);
          if (snap.exists()) {
            const data = snap.data();
            const currentTrajectory = data.trajectory || [];

            await updateDoc(alertRef, {
              lastKnownLocation: {
                lat: loc.lat,
                lng: loc.lng,
                speed: loc.speed,
                heading: loc.heading,
              },
              locationName: loc.label,
              trajectory: [...currentTrajectory, { ...newCoord, timestamp: new Date().toISOString() }],
            });
          }
        } catch (err) {
          console.error("Error updating alert path:", err);
        }
      }
    }, 4500); // Ticks every 4.5 seconds
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (trackingInterval.current) {
      clearInterval(trackingInterval.current);
    }
  };

  const handleCheckInSafe = async () => {
    stopTracking();
    cancelPanicCountdown();
    setIsAlertActive(false);

    if (currentAlertId) {
      try {
        const alertRef = doc(db, "alerts", currentAlertId);
        const snap = await getDoc(alertRef);
        if (snap.exists()) {
          const data = snap.data();
          const currentTimeline = data.timeline || [];

          await updateDoc(alertRef, {
            status: "resolved",
            resolvedAt: new Date(),
            timeline: [
              ...currentTimeline,
              { event: "User checked in safely", timestamp: new Date() },
              { event: "Alert marked resolved", timestamp: new Date() },
            ],
          });
        }
      } catch (err) {
        console.error("Check-in Error:", err);
      }
      setCurrentAlertId(null);
    }

    // Set user back online
    try {
      await updateDoc(doc(db, "users", user.uid), {
        phoneStatus: "online",
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Use real GPS for display when available, fall back to simulated
  const simPosition = SIMULATED_ROUTE[currentSimIndex];
  const activePosition = position
    ? { lat: position.lat, lng: position.lng, speed: position.speed || 0, heading: position.heading || 0, label: `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}` }
    : simPosition;

  const handleJoinFamily = async (e) => {
    e.preventDefault();
    setError(null);

    const code = joinFamilyId.trim().toUpperCase();
    if (!code) {
      setError("Please enter a family code.");
      return;
    }

    setJoining(true);
    try {
      // Look up family by joinCode
      const q = query(collection(db, "families"), where("joinCode", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) {
        setError("Family not found. Check the code and try again.");
        setJoining(false);
        return;
      }

      const familyDoc = snap.docs[0];
      const familyId = familyDoc.id;

      // Add user to the family's members array
      await updateDoc(doc(db, "families", familyId), {
        members: arrayUnion(user.uid),
      });

      // Set the user's familyId
      await updateDoc(doc(db, "users", user.uid), {
        familyId,
      });

      await refreshProfile();
      setShowJoinFamily(false);
      setJoinFamilyId("");
    } catch (err) {
      setError("Failed to join family. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleCopyFamilyCode = () => {
    const code = family?.joinCode;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLinkDirectAgency = async () => {
    if (!selectedAgencyId) {
      setError("Please select a security agency.");
      return;
    }
    setLinkingAgency(true);
    setError(null);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        directAgencyId: selectedAgencyId,
      });
      await refreshProfile();
      setShowDirectAgency(false);
      setSelectedAgencyId("");
    } catch (err) {
      setError("Failed to link agency. Please try again.");
    } finally {
      setLinkingAgency(false);
    }
  };

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1 className="home-greeting">Hi, {user.name?.split(" ")[0]}</h1>
          <div className="home-status">
            <span
              className={`status-dot ${user.phoneStatus === "online" && !isAlertActive ? "online" : "offline"}`}
            />
            {isAlertActive ? "Distress Alert Broadcasted" : (user.phoneStatus === "online" ? "Online" : "Offline")}
          </div>
        </div>
      </header>

      {/* PANIC SOS TRIGGER */}
      {user.role !== "agency_staff" && (
        <div className="panic-section">
          {panicCountdown !== null ? (
            <button className="panic-button triggering" onClick={cancelPanicCountdown}>
              <div className="countdown-ring">
                <span className="countdown-number">{panicCountdown}</span>
              </div>
              <span className="panic-label">CANCEL SOS</span>
              <span className="panic-hint">Tap to abort broadcast</span>
            </button>
          ) : isAlertActive ? (
            <button className="panic-button active" onClick={handleCheckInSafe}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sos-pulse">
                <path d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z" />
              </svg>
              <span className="panic-label">SOS ACTIVE</span>
              <span className="panic-hint">Check in to signal safety</span>
            </button>
          ) : (
            <button className="panic-button ready" onClick={startPanicCountdown}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z" />
              </svg>
              <span className="panic-label">PANIC</span>
              <span className="panic-hint">Press to broadcast emergency SOS</span>
            </button>
          )}
        </div>
      )}

      {/* AI ANOMALY CHECK-IN PROMPT */}
      {anomalyAlert && !escalate && (
        <section className="home-card anomaly-checkin">
          <h2 className="card-title anomaly-title">Are you okay?</h2>
          <p className="card-detail">
            Our AI detected unusual movement. If you don't respond, an alert
            will be sent to your family and agency in <strong>{aiCountdown}s</strong>.
          </p>
          {anomalyAlert.explanations.length > 0 && (
            <ul className="anomaly-reasons">
              {anomalyAlert.explanations.map((ex, i) => (
                <li key={i}>{ex}</li>
              ))}
            </ul>
          )}
          <button className="btn-primary anomaly-safe-btn" onClick={confirmSafe}>
            I'm Safe
          </button>
        </section>
      )}

      {/* ACTIVE TRACKING JOURNEY SCREEN */}
      {isTracking && (
        <section className="home-card tracking-card">
          <div className="tracking-header">
            <h2 className="card-title live-indicator">
              <span className="pulse-dot"></span> Live Journey Tracker
            </h2>
            <button className="btn-safe-checkin" onClick={handleCheckInSafe}>
              Check In Safe
            </button>
          </div>

          <div className="telemetry-grid">
            <div className="tel-card">
              <span className="tel-label">Location</span>
              <span className="tel-value">{activePosition.label}</span>
            </div>
            <div className="tel-card">
              <span className="tel-label">Current Speed</span>
              <span className="tel-value">{activePosition.speed} km/h</span>
            </div>
            <div className="tel-card">
              <span className="tel-label">Heading</span>
              <span className="tel-value">{activePosition.heading}°</span>
            </div>
          </div>

          {/* Leaflet Interactive Route Map */}
          <div className="map-wrapper">
            <MapContainer
              center={[activePosition.lat, activePosition.lng]}
              zoom={14}
              scrollWheelZoom={false}
              className="journey-map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ChangeMapView center={[activePosition.lat, activePosition.lng]} />

              {/* Draw trajectory route polyline */}
              {journeyPath.length > 1 && (
                <Polyline positions={journeyPath.map(p => [p.lat, p.lng])} color="#6B4F3A" weight={4} />
              )}

              <Marker position={[activePosition.lat, activePosition.lng]}>
                <Popup>
                  <strong>{user.name}</strong> <br />
                  Speed: {activePosition.speed} km/h <br />
                  Location: {activePosition.label}
                </Popup>
              </Marker>
            </MapContainer>
          </div>
        </section>
      )}

      {/* START TRACKING TOGGLE */}
      {user.role !== "agency_staff" && !isTracking && !isAlertActive && (
        <section className="home-card tracking-toggle-card">
          <div className="toggle-info">
            <h3 className="toggle-title">Safe Journey Monitoring</h3>
            <p className="card-detail">Enable real-time location routing and AI safety updates.</p>
          </div>
          <button className="btn-primary" onClick={() => startTracking(null, 0)}>
            Start Monitoring
          </button>
        </section>
      )}

      {family && (
        <section className="home-card">
          <h2 className="card-title">Family</h2>
          <p className="card-value">{family.name}</p>
          <p className="card-detail">
            {family.members?.length || 0} member{family.members?.length !== 1 ? "s" : ""}
          </p>
          {user.uid === family?.adminUserId && family?.joinCode && (
            <div className="family-id-row">
              <span className="family-id-label">Join Code:</span>
              <code className="family-id-value">{family.joinCode}</code>
              <button
                className="copy-btn"
                onClick={handleCopyFamilyCode}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
          {/* Family members list */}
          <div className="family-members-list">
            <h3 className="members-list-title">Members</h3>
            <div className="member-item">
              <span className={`status-dot ${user.phoneStatus === "online" ? "online" : "offline"}`} />
              <span className="member-name">{user.name} (You)</span>
            </div>
            {members.length > 0 ? (
              members.map((m) => (
                <div key={m.uid} className="member-item">
                  <span className={`status-dot ${m.phoneStatus === "online" ? "online" : "offline"}`} />
                  <span className="member-name">{m.name}</span>
                  <span className="member-status-text">
                    {m.phoneStatus === "online" ? "Online" : "Offline"}
                  </span>
                </div>
              ))
            ) : (
              <p className="card-detail">No other members yet. Share your join code to invite family.</p>
            )}
          </div>
        </section>
      )}

      {!user.familyId && !user.directAgencyId && user.role !== "agency_staff" && (
        <section className="home-card">
          <h2 className="card-title">Get Protected</h2>
          {showCreateFamily ? (
            <form onSubmit={handleCreateFamily} className="create-family-form">
              {error && <div className="form-error">{error}</div>}
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder='e.g. "Ogunleye Family"'
                className="auth-input"
                required
              />
              {agencies.length > 0 && (
                <select
                  className="auth-input"
                  value={selectedAgencyId}
                  onChange={(e) => setSelectedAgencyId(e.target.value)}
                  required
                >
                  <option value="">Select a backup security agency</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowCreateFamily(false);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          ) : showJoinFamily ? (
            <form onSubmit={handleJoinFamily} className="create-family-form">
              {error && <div className="form-error">{error}</div>}
              <input
                type="text"
                value={joinFamilyId}
                onChange={(e) => setJoinFamilyId(e.target.value)}
                placeholder='Enter join code (e.g. ADK-4429)'
                className="auth-input"
                required
              />
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowJoinFamily(false);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={joining}>
                  {joining ? "Joining..." : "Join"}
                </button>
              </div>
            </form>
          ) : showDirectAgency ? (
            <div className="create-family-form">
              {error && <div className="form-error">{error}</div>}
              <p className="card-detail">
                Register directly under a security agency without a family group.
              </p>
              {agencies.length > 0 ? (
                <select
                  className="auth-input"
                  value={selectedAgencyId}
                  onChange={(e) => setSelectedAgencyId(e.target.value)}
                >
                  <option value="">Select a security agency</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              ) : (
                <p className="card-detail">No agencies available yet.</p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowDirectAgency(false);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={linkingAgency || !selectedAgencyId}
                  onClick={handleLinkDirectAgency}
                >
                  {linkingAgency ? "Linking..." : "Link to Agency"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="card-detail">
                You're not part of a family group yet. Choose how you want to be protected.
              </p>
              <div className="form-actions-vertical" style={{ marginTop: "0.75rem" }}>
                <button
                  className="btn-primary"
                  onClick={() => setShowCreateFamily(true)}
                >
                  Create a Family
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setShowJoinFamily(true)}
                >
                  Join a Family
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setShowDirectAgency(true)}
                >
                  Register under Agency
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* SAFE ZONES PANEL */}
      {user.role !== "agency_staff" && (
        <section className="home-card">
          <div className="safe-zones-header">
            <h2 className="card-title">Safe Zones</h2>
            {!showAddZone && (
              <button className="btn-add-zone" onClick={() => setShowAddZone(true)}>
                + Add
              </button>
            )}
          </div>

          {showAddZone ? (
            <form onSubmit={handleAddSafeZone} className="add-zone-form">
              <input
                type="text"
                placeholder="Zone name (e.g. Home, Office)"
                value={zoneLabel}
                onChange={(e) => setZoneLabel(e.target.value)}
                className="auth-input"
                required
              />
              <div className="coordinate-inputs">
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Latitude (e.g. 6.515)"
                  value={zoneLat}
                  onChange={(e) => setZoneLat(e.target.value)}
                  className="auth-input"
                  required
                />
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Longitude (e.g. 3.377)"
                  value={zoneLng}
                  onChange={(e) => setZoneLng(e.target.value)}
                  className="auth-input"
                  required
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddZone(false)}
                  disabled={modifyingZones}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={modifyingZones}>
                  {modifyingZones ? "Adding..." : "Add Zone"}
                </button>
              </div>
            </form>
          ) : user.safeZones?.length > 0 ? (
            <ul className="safe-zone-list">
              {user.safeZones.map((zone, i) => (
                <li key={i} className="safe-zone-item-wrapper">
                  <div className="safe-zone-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="zone-icon">
                      <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div>
                      <span className="zone-name">{zone.label || `Zone ${i + 1}`}</span>
                      <span className="zone-coord">{zone.lat?.toFixed(4)}, {zone.lng?.toFixed(4)}</span>
                    </div>
                  </div>
                  <button
                    className="btn-delete-zone"
                    onClick={() => handleDeleteSafeZone(i)}
                    disabled={modifyingZones}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-detail">No safe zones set up yet.</p>
          )}
          <Link to="/map" className="btn-secondary manage-map-link">
            Manage on Map
          </Link>
        </section>
      )}

      <section className="home-card">
        <h2 className="card-title">Account</h2>
        <div className="account-row">
          <span className="account-label">Email</span>
          <span className="account-value">{user.email}</span>
        </div>
        <div className="account-row">
          <span className="account-label">Phone</span>
          <span className="account-value">{user.phone}</span>
        </div>
        <div className="account-row">
          <span className="account-label">Role</span>
          <span className="account-value role-badge">
            {user.role === "family_admin"
              ? "Family Admin"
              : user.role === "agency_staff"
                ? "Agency Staff"
                : "Member"}
          </span>
        </div>
      </section>
    </div>
  );
}
