import { useState } from "react";
import { Link } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import "./AgencyRegister.css";

export default function AgencyRegister() {
  const [form, setForm] = useState({
    agencyName: "",
    address: "",
    area: "",
    phone: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const updateField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      // Generate the agency doc ref first (no write yet) so we have the ID
      const agencyRef = doc(collection(db, "agencies"));

      // 1. Create Firebase Auth user for the agency admin
      const result = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password
      );

      // 2. Create the user profile doc IMMEDIATELY so AuthContext's
      //    onAuthStateChanged handler finds it when it runs.
      await setDoc(doc(db, "users", result.user.uid), {
        name: form.adminName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: "agency_admin",
        agencyId: agencyRef.id,
        familyId: null,
        lastLocation: null,
        lastSeen: null,
        phoneStatus: "online",
        safeZones: [],
        createdAt: serverTimestamp(),
      });

      // 3. Update display name and create the agency document
      await updateProfile(result.user, { displayName: form.adminName.trim() });

      await setDoc(agencyRef, {
        name: form.agencyName.trim(),
        address: form.address.trim(),
        areaOfOperation: form.area.trim(),
        phone: form.phone.trim(),
        adminUserId: result.user.uid,
        staffUserIds: [result.user.uid],
        status: "pending",
        createdAt: serverTimestamp(),
      });

      setSuccess(true);
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("An account with this email already exists.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak.");
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="agency-register-page">
        <div className="register-card">
          <div className="register-header">
            <div className="register-icon success-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"1.75rem",height:"1.75rem"}}><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></div>
            <h1 className="register-title">Registration Submitted</h1>
          </div>
          <div className="success-body">
            <p>
              Your agency <strong>{form.agencyName}</strong> has been registered
              and is <strong>pending verification</strong>.
            </p>
            <p>
              A platform administrator will review and verify your agency.
              Once verified, you can log in to the dashboard and your agency
              will appear to SafeTrace users.
            </p>
          </div>
          <Link to="/login" className="register-submit-btn" style={{ textAlign: "center", textDecoration: "none" }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="agency-register-page">
      <div className="register-card">
        <div className="register-header">
          <Link to="/" className="back-home-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:"0.85em",height:"0.85em",verticalAlign:"middle",display:"inline",marginRight:"0.2em"}}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>Back to SafeTrace</Link>
          <div className="register-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 className="register-title">Register Your Agency</h1>
          <p className="register-subtitle">
            Set up your security agency on SafeTrace to receive and respond to emergency alerts.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          {error && <div className="register-error">{error}</div>}

          <fieldset className="register-fieldset">
            <legend>Agency Information</legend>

            <div className="input-group">
              <label htmlFor="agencyName">Agency Name</label>
              <input
                id="agencyName"
                type="text"
                value={form.agencyName}
                onChange={updateField("agencyName")}
                placeholder="e.g. Lagos Watch Security"
                className="register-input"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="address">Office Address</label>
              <input
                id="address"
                type="text"
                value={form.address}
                onChange={updateField("address")}
                placeholder="e.g. 15 Herbert Macaulay Way, Yaba"
                className="register-input"
                required
              />
            </div>

            <div className="input-row">
              <div className="input-group">
                <label htmlFor="area">Area of Operation</label>
                <input
                  id="area"
                  type="text"
                  value={form.area}
                  onChange={updateField("area")}
                  placeholder="e.g. Yaba, Surulere, Ebute-Metta"
                  className="register-input"
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="phone">Contact Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={updateField("phone")}
                  placeholder="+2348012345678"
                  className="register-input"
                  required
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="register-fieldset">
            <legend>Admin Account</legend>

            <div className="input-group">
              <label htmlFor="adminName">Your Full Name</label>
              <input
                id="adminName"
                type="text"
                value={form.adminName}
                onChange={updateField("adminName")}
                placeholder="e.g. Adebayo Olusegun"
                className="register-input"
                required
              />
            </div>

            <div className="input-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={updateField("email")}
                placeholder="admin@youragency.com"
                className="register-input"
                required
              />
            </div>

            <div className="input-row">
              <div className="input-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={updateField("password")}
                  minLength={6}
                  className="register-input"
                  required
                />
              </div>
              <div className="input-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={updateField("confirmPassword")}
                  className="register-input"
                  required
                />
              </div>
            </div>
          </fieldset>

          <button type="submit" className="register-submit-btn" disabled={submitting}>
            {submitting ? "Registering..." : "Register Agency"}
          </button>

          <p className="register-footer-note">
            Already registered? <Link to="/login">Log in to dashboard</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
