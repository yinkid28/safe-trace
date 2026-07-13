import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import SafeTraceLogo from "../components/SafeTraceLogo";
import "./Auth.css";

export default function Login() {
  const { login, resetPassword, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many failed attempts. Try again later.");
      } else {
        setError(err?.message || "Login failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(email.trim());
      setResetSuccess(true);
    } catch (err) {
      const code = err?.code || "";
      if (code === "auth/user-not-found") {
        setError("No account found with this email address.");
      } else if (code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many requests. Please try again later.");
      } else {
        setError(err?.message || "Failed to send reset email. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const enterResetMode = () => {
    setResetMode(true);
    setResetSuccess(false);
    setError(null);
  };

  const exitResetMode = () => {
    setResetMode(false);
    setResetSuccess(false);
    setError(null);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <SafeTraceLogo size="md" />
        <p className="auth-subtitle">Stay safe, stay connected</p>

        {resetMode ? (
          <div className="auth-form">
            {resetSuccess ? (
              <div className="auth-reset-success">
                Check your email for a password reset link.
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="auth-form">
                {error && <div className="auth-error">{error}</div>}

                <label className="auth-label">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="auth-input"
                  />
                </label>

                <button type="submit" className="auth-button" disabled={submitting}>
                  {submitting ? "Sending..." : "Send Reset Link"}
                </button>
              </form>
            )}

            <button type="button" className="auth-forgot-link" onClick={exitResetMode}>
              Back to Login
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="auth-form">
              {error && <div className="auth-error">{error}</div>}

              <label className="auth-label">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="auth-input"
                />
              </label>

              <label className="auth-label">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="auth-input"
                />
              </label>

              <button type="button" className="auth-forgot-link" onClick={enterResetMode}>
                Forgot Password?
              </button>

              <button type="submit" className="auth-button" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <p className="auth-footer">
              Don't have an account? <Link to="/register">Register</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
