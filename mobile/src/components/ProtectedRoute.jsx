import { Navigate } from "react-router";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({ children }) {
  const { authUser, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
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
