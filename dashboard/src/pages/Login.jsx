import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

export default function Login() {
  const { login, user, error, clearError, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  if (loading) return null;
  if (user) return <Navigate to={user.role === "platform_admin" ? "/dashboard/admin" : "/dashboard"} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    setSubmitting(true);

    try {
      const profile = await login(email.trim(), password);
      const dest = profile?.role === "platform_admin" ? "/dashboard/admin" : "/dashboard";
      navigate(dest, { replace: true });
    } catch (err) {
      console.error(err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setLocalError("Invalid email or password.");
      } else {
        setLocalError(err.message || "Failed to log in. Please check credentials.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-login-page">
      <div className="login-backdrop-graphics">
        <div className="graphic-circle c1"></div>
        <div className="graphic-circle c2"></div>
      </div>
      
      <div className="login-card-container">
        <div className="login-card-header">
          <div className="login-logo-lock">🛡️</div>
          <h1 className="login-logo-title">SafeTrace</h1>
          <p className="login-logo-subtitle">Security Agency Command Center</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form-fields">
          {(localError || error) && (
            <div className="login-error-alert">{localError || error}</div>
          )}

          <div className="login-input-group">
            <label className="login-input-lbl" htmlFor="staff-email">Staff Email</label>
            <input
              id="staff-email"
              type="email"
              placeholder="officer.name@safetrace.test"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input login-input-box"
              required
              autoComplete="email"
            />
          </div>

          <div className="login-input-group">
            <label className="login-input-lbl" htmlFor="staff-password">Password</label>
            <input
              id="staff-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input login-input-box"
              required
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="login-submit-btn" disabled={submitting}>
            {submitting ? "Signing into Command..." : "Access Terminal"}
          </button>
        </form>

        <div className="login-card-footer">
          <p className="footer-notice">Agency staff only. Contact admin for terminal provisioning.</p>
        </div>
      </div>
    </div>
  );
}
