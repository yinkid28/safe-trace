import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import "./Home.css";

const DEFAULT_AGENCY_ID = "agency_yaba";

export default function Home() {
  const { user, logout, refreshProfile } = useAuth();
  const [family, setFamily] = useState(null);
  const [showCreateFamily, setShowCreateFamily] = useState(false);
  const [familyName, setFamilyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

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

  if (!user) return null;

  const handleCreateFamily = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmed = familyName.trim();
    if (!trimmed) {
      setError("Please enter a family name.");
      return;
    }

    setCreating(true);
    try {
      // Create the family document
      const familyRef = doc(collection(db, "families"));
      await setDoc(familyRef, {
        name: trimmed,
        members: [user.uid],
        adminUserId: user.uid,
        agencyId: DEFAULT_AGENCY_ID,
        createdAt: serverTimestamp(),
      });

      // Update the user's profile with familyId and promote to family_admin
      await updateDoc(doc(db, "users", user.uid), {
        familyId: familyRef.id,
        role: "family_admin",
      });

      await refreshProfile();
      setShowCreateFamily(false);
      setFamilyName("");
    } catch (err) {
      setError("Failed to create family. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1 className="home-greeting">Hi, {user.name?.split(" ")[0]}</h1>
          <div className="home-status">
            <span
              className={`status-dot ${user.phoneStatus === "online" ? "online" : "offline"}`}
            />
            {user.phoneStatus === "online" ? "Online" : "Offline"}
          </div>
        </div>
        <button className="logout-btn" onClick={logout}>
          Log out
        </button>
      </header>

      {user.role !== "agency_staff" && (
        <button className="panic-button" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96l-6.93-12a2 2 0 00-3.5 0l-6.93 12A2 2 0 005.07 19z" />
          </svg>
          <span className="panic-label">PANIC</span>
          <span className="panic-hint">Coming soon</span>
        </button>
      )}

      {family && (
        <section className="home-card">
          <h2 className="card-title">Family</h2>
          <p className="card-value">{family.name}</p>
          <p className="card-detail">
            {family.members?.length || 0} member{family.members?.length !== 1 ? "s" : ""}
          </p>
        </section>
      )}

      {!user.familyId && user.role !== "agency_staff" && (
        <section className="home-card">
          <h2 className="card-title">Family</h2>
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
          ) : (
            <>
              <p className="card-detail">
                You're not part of a family group yet.
              </p>
              <button
                className="btn-primary"
                style={{ marginTop: "0.75rem" }}
                onClick={() => setShowCreateFamily(true)}
              >
                Create a Family
              </button>
            </>
          )}
        </section>
      )}

      {user.role !== "agency_staff" && (
        <section className="home-card">
          <h2 className="card-title">Safe Zones</h2>
          {user.safeZones?.length > 0 ? (
            <ul className="safe-zone-list">
              {user.safeZones.map((zone, i) => (
                <li key={i} className="safe-zone-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="zone-icon">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {zone.label || `Zone ${i + 1}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="card-detail">No safe zones set up yet.</p>
          )}
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
