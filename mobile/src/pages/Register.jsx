import { useState } from "react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import "./Auth.css";

// Agency codes map to Firestore agency doc IDs.
// In production this would be validated server-side.
const AGENCY_CODES = {
  YABA2024: "agency_yaba",
};

export default function Register() {
  const { register, user, loading } = useAuth();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    agencyCode: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const updateField = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const selectRole = (selected) => {
    setRole(selected);
    setError(null);
    setStep(2);
  };

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

    let agencyId = null;
    if (role === "agency_staff") {
      const code = form.agencyCode.trim().toUpperCase();
      agencyId = AGENCY_CODES[code];
      if (!agencyId) {
        setError("Invalid agency code. Contact your agency administrator.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await register({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role,
        agencyId,
      });
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

  // Step 1: choose role
  if (step === 1) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-logo">SafeTrace</h1>
          <p className="auth-subtitle">How will you use SafeTrace?</p>

          <div className="role-options">
            <button
              type="button"
              className="role-card"
              onClick={() => selectRole("user")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="role-icon">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <span className="role-title">User / Family</span>
              <span className="role-desc">
                Track your safety and stay connected with family
              </span>
            </button>

            <button
              type="button"
              className="role-card"
              onClick={() => selectRole("agency_staff")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="role-icon">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="role-title">Security Agency</span>
              <span className="role-desc">
                Monitor and respond to safety alerts
              </span>
            </button>
          </div>

          <p className="auth-footer">
            Already have an account? <Link to="/login">Sign In</Link>
          </p>
        </div>
      </div>
    );
  }

  // Step 2: registration form
  return (
    <div className="auth-page">
      <div className="auth-card">
        <button type="button" className="back-btn" onClick={() => setStep(1)}>
          &larr; Back
        </button>
        <h1 className="auth-logo">SafeTrace</h1>
        <p className="auth-subtitle">
          {role === "agency_staff"
            ? "Register as agency staff"
            : "Create your account"}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}

          <label className="auth-label">
            Full Name
            <input
              type="text"
              value={form.name}
              onChange={updateField("name")}
              required
              autoComplete="name"
              className="auth-input"
            />
          </label>

          <label className="auth-label">
            Email
            <input
              type="email"
              value={form.email}
              onChange={updateField("email")}
              required
              autoComplete="email"
              className="auth-input"
            />
          </label>

          <label className="auth-label">
            Phone Number
            <input
              type="tel"
              value={form.phone}
              onChange={updateField("phone")}
              required
              placeholder="+2348012345678"
              autoComplete="tel"
              className="auth-input"
            />
          </label>

          {role === "agency_staff" && (
            <label className="auth-label">
              Agency Code
              <input
                type="text"
                value={form.agencyCode}
                onChange={updateField("agencyCode")}
                required
                placeholder="Enter code from your agency"
                className="auth-input"
              />
              <span className="input-hint">
                Get this code from your agency administrator
              </span>
            </label>
          )}

          <label className="auth-label">
            Password
            <input
              type="password"
              value={form.password}
              onChange={updateField("password")}
              required
              minLength={6}
              autoComplete="new-password"
              className="auth-input"
            />
          </label>

          <label className="auth-label">
            Confirm Password
            <input
              type="password"
              value={form.confirmPassword}
              onChange={updateField("confirmPassword")}
              required
              autoComplete="new-password"
              className="auth-input"
            />
          </label>

          <button type="submit" className="auth-button" disabled={submitting}>
            {submitting ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
