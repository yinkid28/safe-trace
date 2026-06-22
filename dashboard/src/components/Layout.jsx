import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Layout.css";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="dashboard-layout">
      {/* Left Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-top">
          <div className="sidebar-logo">
            <span className="logo-icon">🛡️</span>
            <span className="logo-text">SafeTrace</span>
          </div>
          <p className="sidebar-badge">Agency Terminal</p>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <span className="nav-icon">📊</span>
            <span className="nav-lbl">Alert Feed</span>
          </NavLink>
          <NavLink to="/map" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
            <span className="nav-icon">🗺️</span>
            <span className="nav-lbl">Situational Map</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile-summary">
            <div className="avatar-circle">
              {user.name.charAt(0)}
            </div>
            <div className="user-text">
              <span className="user-name">{user.name}</span>
              <span className="user-role">Staff Responder</span>
            </div>
          </div>
          <button className="btn-sidebar-logout" onClick={handleLogout}>
            🚪 Log Out
          </button>
        </div>
      </aside>

      {/* Right Content Area */}
      <main className="dashboard-main-content">
        <Outlet />
      </main>
    </div>
  );
}
