import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import SafeTraceLogo from "./SafeTraceLogo";

export default function ProtectedRoute({ children }) {
  const { authUser, user, loading, refreshProfile } = useAuth();
  const [retried, setRetried] = useState(false);

  // If auth exists but profile is missing, retry once before giving up.
  // This handles the brief window after registration where onAuthStateChanged
  // fires before the Firestore user doc is written.
  useEffect(() => {
    if (!loading && authUser && !user && !retried) {
      try {
        const result = refreshProfile();
        if (result && typeof result.then === "function") {
          result.catch(() => {}).finally(() => setRetried(true));
        } else {
          setRetried(true);
        }
      } catch {
        setRetried(true);
      }
    }
  }, [loading, authUser, user, retried, refreshProfile]);

  if (loading) {
    return (
      <div className="loading-screen">
        <SafeTraceLogo size="md" animate />
      </div>
    );
  }

  // No auth session — go to login
  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  // Auth exists but no profile — wait for retry before redirecting
  if (!user) {
    if (!retried) {
      return (
        <div className="loading-screen">
          <SafeTraceLogo size="md" animate />
        </div>
      );
    }
    // Retry done, still no profile — orphaned auth user
    return <Navigate to="/login" replace />;
  }

  return children;
}
