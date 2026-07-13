import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import "./AdminPanel.css";

export default function AdminPanel() {
  const { user } = useAuth();
  const [agencies, setAgencies] = useState([]);
  const [adminUsers, setAdminUsers] = useState({});
  const [activeTab, setActiveTab] = useState("pending");
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState(null);

  const isAdmin = user?.role === "platform_admin";

  // Real-time listener for all agencies (only when user is platform admin)
  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = onSnapshot(
      collection(db, "agencies"),
      (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setAgencies(list);

        // Fetch admin user profiles for each agency
        const adminIds = [...new Set(list.map((a) => a.adminUserId).filter(Boolean))];
        adminIds.forEach(async (uid) => {
          if (adminUsers[uid]) return; // already fetched
          try {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (userSnap.exists()) {
              setAdminUsers((prev) => ({ ...prev, [uid]: userSnap.data() }));
            }
          } catch {
            // Silently skip — admin user doc may not be readable
          }
        });
      },
      (err) => {
        console.error("Error loading agencies:", err);
        setError("Failed to load agencies. Check your permissions.");
      }
    );

    return unsubscribe;
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guard: only platform admins can access (placed after hooks)
  if (!isAdmin) {
    return (
      <div className="admin-access-denied">
        <span className="denied-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="48" height="48"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></span>
        <h2>Access Denied</h2>
        <p>You do not have permission to view this page. Platform admin access required.</p>
      </div>
    );
  }

  const handleStatusChange = async (agencyId, newStatus) => {
    setUpdatingId(agencyId);
    setError(null);
    try {
      await updateDoc(doc(db, "agencies", agencyId), { status: newStatus });
    } catch (err) {
      console.error("Error updating agency status:", err);
      setError("Failed to update agency status. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Filter by tab
  const filteredAgencies = agencies.filter((a) => {
    if (activeTab === "pending") return a.status === "pending";
    if (activeTab === "verified") return a.status === "verified";
    return true; // "all"
  });

  const pendingCount = agencies.filter((a) => a.status === "pending").length;
  const verifiedCount = agencies.filter((a) => a.status === "verified").length;

  return (
    <div className="admin-panel-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <h1 className="admin-title">Agency Management</h1>
          <p className="admin-subtitle">Review and verify security agency registrations</p>
        </div>
      </header>

      {error && <div className="admin-error-banner">{error}</div>}

      {/* Tabs */}
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === "pending" ? "active" : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          Pending
          {pendingCount > 0 && <span className="tab-count pending-count">{pendingCount}</span>}
        </button>
        <button
          className={`admin-tab ${activeTab === "verified" ? "active" : ""}`}
          onClick={() => setActiveTab("verified")}
        >
          Verified
          <span className="tab-count verified-count">{verifiedCount}</span>
        </button>
        <button
          className={`admin-tab ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All
          <span className="tab-count">{agencies.length}</span>
        </button>
      </div>

      {/* Agency cards */}
      {filteredAgencies.length === 0 ? (
        <div className="admin-empty-state">
          <span className="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="48" height="48"><path d="M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18" /><path d="M6 12H4a2 2 0 00-2 2v6a2 2 0 002 2h2" /><path d="M18 9h2a2 2 0 012 2v9a2 2 0 01-2 2h-2" /><path d="M10 6h4" /><path d="M10 10h4" /><path d="M10 14h4" /><path d="M10 18h4" /></svg></span>
          <p>No {activeTab === "all" ? "" : activeTab} agencies found.</p>
        </div>
      ) : (
        <div className="admin-cards-list">
          {filteredAgencies.map((agency) => {
            const admin = adminUsers[agency.adminUserId];
            const isPending = agency.status === "pending";

            return (
              <div
                key={agency.id}
                className={`admin-agency-card ${agency.status}`}
              >
                <div className="agency-card-top">
                  <div className="agency-info">
                    <h3 className="agency-name">{agency.name}</h3>
                    <span className={`agency-status-badge ${agency.status}`}>
                      {agency.status.toUpperCase()}
                    </span>
                  </div>
                  <span className="agency-created">{formatDate(agency.createdAt)}</span>
                </div>

                <div className="agency-details-grid">
                  {agency.address && (
                    <div className="detail-item">
                      <span className="detail-label">Address</span>
                      <span className="detail-value">{agency.address}</span>
                    </div>
                  )}
                  {agency.areaOfOperation && (
                    <div className="detail-item">
                      <span className="detail-label">Area of Operation</span>
                      <span className="detail-value">{agency.areaOfOperation}</span>
                    </div>
                  )}
                  {agency.phone && (
                    <div className="detail-item">
                      <span className="detail-label">Phone</span>
                      <span className="detail-value">{agency.phone}</span>
                    </div>
                  )}
                  {admin && (
                    <div className="detail-item">
                      <span className="detail-label">Admin Contact</span>
                      <span className="detail-value">{admin.name} ({admin.email})</span>
                    </div>
                  )}
                </div>

                <div className="agency-card-actions">
                  {isPending ? (
                    <button
                      className="btn-approve"
                      disabled={updatingId === agency.id}
                      onClick={() => handleStatusChange(agency.id, "verified")}
                    >
                      {updatingId === agency.id ? "Approving..." : "Approve"}
                    </button>
                  ) : (
                    <button
                      className="btn-revoke"
                      disabled={updatingId === agency.id}
                      onClick={() => handleStatusChange(agency.id, "pending")}
                    >
                      {updatingId === agency.id ? "Revoking..." : "Revoke"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
