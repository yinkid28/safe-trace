import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import SafeTraceLogo from "../components/SafeTraceLogo";
import "./Login.css";

export default function Login() {
  const { login, resetPassword, user, error, clearError, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

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

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    setSubmitting(true);

    try {
      await resetPassword(email.trim());
      setResetSuccess(true);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/user-not-found") {
        setLocalError("No account found with this email address.");
      } else if (err.code === "auth/invalid-email") {
        setLocalError("Please enter a valid email address.");
      } else if (err.code === "auth/too-many-requests") {
        setLocalError("Too many requests. Please try again later.");
      } else {
        setLocalError(err.message || "Failed to send reset email. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const enterResetMode = () => {
    setResetMode(true);
    setResetSuccess(false);
    setLocalError(null);
    clearError();
  };

  const exitResetMode = () => {
    setResetMode(false);
    setResetSuccess(false);
    setLocalError(null);
    clearError();
  };

  return (
    <div className="dashboard-login-page">
      <div className="login-backdrop-graphics">
        <div className="graphic-circle c1"></div>
        <div className="graphic-circle c2"></div>
      </div>

      <div className="login-card-container">
        <div className="login-card-header">
          <div className="login-logo-lock"><SafeTraceLogo size="md" /></div>
          <p className="login-logo-subtitle">Security Agency Command Center</p>
        </div>

        {resetMode ? (
          <div className="login-form-fields">
            {resetSuccess ? (
              <div className="login-reset-success">
                Check your email for a password reset link.
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="login-form-fields">
                {(localError || error) && (
                  <div className="login-error-alert">{localError || error}</div>
                )}

                <div className="login-input-group">
                  <label className="login-input-lbl" htmlFor="reset-email">Staff Email</label>
                  <input
                    id="reset-email"
                    type="email"
                    placeholder="officer.name@safetrace.test"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="auth-input login-input-box"
                    required
                    autoComplete="email"
                  />
                </div>

                <button type="submit" className="login-submit-btn" disabled={submitting}>
                  {submitting ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            )}

            <button type="button" className="login-forgot-link" onClick={exitResetMode}>
              Back to Login
            </button>
          </div>
        ) : (
          <>
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

              <button type="button" className="login-forgot-link" onClick={enterResetMode}>
                Forgot Password?
              </button>

              <button type="submit" className="login-submit-btn" disabled={submitting}>
                {submitting ? "Signing into Command..." : "Access Terminal"}
              </button>
            </form>
          </>
        )}

        <div className="login-card-footer">
          <p className="footer-notice">Agency staff only. Contact admin for terminal provisioning.</p>
        </div>
      </div>
    </div>
  );
}
