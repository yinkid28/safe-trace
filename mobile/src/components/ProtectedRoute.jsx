import { Navigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import SafeTraceLogo from "./SafeTraceLogo";

export default function ProtectedRoute({ children }) {
  const { authUser, user, loading } = useAuth();

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

  // Auth exists but no Firestore profile (orphaned auth user) — go to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
