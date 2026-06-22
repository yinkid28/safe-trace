import { Routes, Route } from "react-router";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import FamilyMap from "./pages/Map";
import FamilyAlerts from "./pages/Alerts";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route path="map" element={<FamilyMap />} />
        <Route path="alerts" element={<FamilyAlerts />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
