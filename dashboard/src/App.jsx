import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AgencyRegister from "./pages/AgencyRegister";
import DashboardFeed from "./pages/DashboardFeed";
import AlertDetail from "./pages/AlertDetail";
import MapView from "./pages/MapView";
import AdminPanel from "./pages/AdminPanel";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/agency/register" element={<AgencyRegister />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardFeed />} />
            <Route path="alerts/:alertId" element={<AlertDetail />} />
            <Route path="map" element={<MapView />} />
            <Route path="admin" element={<AdminPanel />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
