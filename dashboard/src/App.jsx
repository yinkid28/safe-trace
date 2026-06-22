import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import DashboardFeed from "./pages/DashboardFeed";
import AlertDetail from "./pages/AlertDetail";
import MapView from "./pages/MapView";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardFeed />} />
            <Route path="alerts/:alertId" element={<AlertDetail />} />
            <Route path="map" element={<MapView />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
