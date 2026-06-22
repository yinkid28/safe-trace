import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import "./DashboardFeed.css";

export default function DashboardFeed() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!user?.agencyId) return;

    // Real-time listener for alerts linked to this agency
    const q = query(
      collection(db, "alerts"),
      where("agencyId", "==", user.agencyId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setAlerts(list);
    }, (error) => {
      console.error("Error reading dashboard alerts:", error);
    });

    return unsubscribe;
  }, [user?.agencyId]);

  // Tab & Search filters
  const filteredAlerts = alerts.filter((alert) => {
    // 1. Tab Status Filter
    if (activeTab === "new" && alert.status !== "new") return false;
    if (activeTab === "active" && alert.status !== "acknowledged") return false;
    if (activeTab === "resolved" && alert.status !== "resolved") return false;

    // 2. Search Query Filter
    if (searchQuery.trim() !== "") {
      const matchName = alert.userName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchLoc = alert.locationName?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchType = alert.type.toLowerCase().includes(searchQuery.toLowerCase());
      return matchName || matchLoc || matchType;
    }

    return true;
  });

  // Sort Alerts: Float panic alerts (status !== resolved) to the top, then sort by date DESC
  const sortedAlerts = [...filteredAlerts].sort((a, b) => {
    const isAPanic = a.type === "panic" && a.status !== "resolved";
    const isBPanic = b.type === "panic" && b.status !== "resolved";
    if (isAPanic && !isBPanic) return -1;
    if (!isAPanic && isBPanic) return 1;

    // Sort by createdAt descending
    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
    return dateB - dateA;
  });

  const getAlertTimeAgo = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMs = new Date() - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hr ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // Summaries
  const totalCount = alerts.length;
  const newCount = alerts.filter(a => a.status === "new").length;
  const activeCount = alerts.filter(a => a.status === "acknowledged").length;
  const resolvedCount = alerts.filter(a => a.status === "resolved").length;

  return (
    <div className="dashboard-feed-page">
      {/* HEADER SECTION */}
      <header className="feed-header">
        <div className="feed-header-left">
          <h1 className="feed-title">Emergency Alert Feed</h1>
          <p className="feed-subtitle">Real-time status of family SOS distress signals</p>
        </div>
        <div className="feed-header-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by name, location, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="feed-search-input"
          />
        </div>
      </header>

      {/* STATS TABS */}
      <div className="feed-stats-tabs">
        <button className={`stat-tab-card ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>
          <span className="stat-tab-lbl">All Incidents</span>
          <span className="stat-tab-count">{totalCount}</span>
        </button>
        <button className={`stat-tab-card new-tab ${activeTab === "new" ? "active" : ""}`} onClick={() => setActiveTab("new")}>
          <div className="tab-dot-row">
            <span className="stat-tab-lbl">Unacknowledged</span>
            {newCount > 0 && <span className="pulsing-badge-dot"></span>}
          </div>
          <span className="stat-tab-count danger-text">{newCount}</span>
        </button>
        <button className={`stat-tab-card active-tab ${activeTab === "active" ? "active" : ""}`} onClick={() => setActiveTab("active")}>
          <span className="stat-tab-lbl">Being Handled</span>
          <span className="stat-tab-count warning-text">{activeCount}</span>
        </button>
        <button className={`stat-tab-card resolved-tab ${activeTab === "resolved" ? "active" : ""}`} onClick={() => setActiveTab("resolved")}>
          <span className="stat-tab-lbl">Resolved</span>
          <span className="stat-tab-count safe-text">{resolvedCount}</span>
        </button>
      </div>

      {/* ALERTS FEED CONTAINER */}
      {sortedAlerts.length === 0 ? (
        <div className="feed-empty-card">
          <span className="empty-feed-icon">🚨</span>
          <p className="empty-feed-text">No active safety alerts. Terminal monitoring is fully secure.</p>
        </div>
      ) : (
        <div className="feed-cards-grid">
          {sortedAlerts.map((alert) => {
            const isPanic = alert.type === "panic";
            const isAnomaly = alert.type === "ai_anomaly";
            const isOffline = alert.type === "offline";
            
            return (
              <div key={alert.id} className={`feed-alert-card ${alert.status} ${alert.type}`}>
                {/* Header row */}
                <div className="alert-card-header-row">
                  <div className="badge-row">
                    <span className={`alert-type-badge ${alert.type}`}>
                      {alert.type === "ai_anomaly" ? "AI ANOMALY" : alert.type.toUpperCase()}
                    </span>
                    {alert.escalated && (
                      <span className="alert-badge-escalated">ESCALATED</span>
                    )}
                  </div>
                  <span className="alert-card-time-ago">{getAlertTimeAgo(alert.createdAt)}</span>
                </div>

                {/* Body Row */}
                <div className="alert-card-body-section">
                  <div className="alert-card-profile">
                    <div className={`avatar-initials ${alert.type}`}>
                      {alert.userName.charAt(0)}
                    </div>
                    <div className="profile-details">
                      <h3 className="profile-user-name">{alert.userName}</h3>
                      <span className="profile-loc-details">Near: 📍 {alert.locationName || "Unknown"}</span>
                    </div>
                  </div>

                  <div className="alert-telemetry-details">
                    <div className="telemetry-item-row">
                      <span className="tel-lbl">Phone Status:</span>
                      <span className={`tel-val ${alert.phoneStatus === "offline" ? "offline-state" : "online-state"}`}>
                        {alert.phoneStatus === "offline" ? "OFFLINE" : "ONLINE"}
                      </span>
                    </div>
                    {alert.riskScore !== undefined && alert.riskScore !== null && (
                      <div className="telemetry-item-row">
                        <span className="tel-lbl">Risk Index:</span>
                        <span className={`tel-val risk-score-txt`}>{alert.riskScore.toFixed(2)}</span>
                      </div>
                    )}
                    {alert.evidenceUrls?.length > 0 && (
                      <div className="telemetry-item-row">
                        <span className="tel-lbl">Photos Uploaded:</span>
                        <span className="tel-val">{alert.evidenceUrls.length} file(s)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Row */}
                <div className="alert-card-footer-section">
                  <span className={`alert-status-text ${alert.status}`}>
                    Status: {alert.status === "new" ? "UNACKNOWLEDGED" : alert.status.toUpperCase()}
                  </span>
                  <Link to={`/alerts/${alert.id}`} className="btn-alert-details-link">
                    Open Details &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
