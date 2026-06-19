import { Routes, Route } from "react-router";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";

function Placeholder({ title }) {
  return (
    <div style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>
      <h2>{title}</h2>
      <p style={{ marginTop: "0.5rem" }}>Coming in a future update.</p>
    </div>
  );
}

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
        <Route path="map" element={<Placeholder title="Map" />} />
        <Route path="alerts" element={<Placeholder title="Alerts" />} />
        <Route path="settings" element={<Placeholder title="Settings" />} />
      </Route>
    </Routes>
  );
}
