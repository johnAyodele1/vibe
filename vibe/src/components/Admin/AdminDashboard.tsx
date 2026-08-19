import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import styles from "./Admin.module.css";
import { API_BASE_URL } from "../../config";

interface Analytics {
  totalUsers: number;
  totalReports: number;
  pendingReports: number;
  activeMatches: number;
  siteVisits: number;
}

interface Report {
  _id: string;
  reporter: { firstName: string; lastName: string; email: string };
  reported: { _id: string; firstName: string; lastName: string; email: string; isBlocked: boolean };
  reason: string;
  status: string;
  createdAt: string;
}

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  isBlocked: boolean;
  createdAt: string;
}

interface RateHistoryItem {
  value: number;
  changedAt: string;
  changedBy: string;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const [analyticsRes, reportsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/analytics`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/reports`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const analyticsData = await analyticsRes.json();
      const reportsData = await reportsRes.json();
      const usersData = await usersRes.json();

      if (analyticsData.success) setAnalytics(analyticsData.data);
      if (reportsData.success) setReports(reportsData.data.reports);
      if (usersData.success) setUsers(usersData.data.users);
    } catch (error) {
      console.error("Error fetching admin data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("isAdminAuthenticated") !== "true") {
      navigate("/admin/login");
      return;
    }
    let isMounted = true;
    const load = async () => {
      await fetchData();
      if (!isMounted) return;
    };
    void load();
    return () => { isMounted = false; };
  }, [fetchData, navigate]);

  const handleAction = async (action: string, targetId: string, reportId?: string) => {
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
      const token = localStorage.getItem("adminToken");
      const response = await fetch(`${API_BASE_URL}/admin/action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, targetId, reportId }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        fetchData(); // Refresh data
      } else {
        toast.error(data.message);
      }
    } catch {
      toast.error("Action failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAdminAuthenticated");
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  if (loading) return <div className={styles.dashboardContainer}>Loading Admin Dashboard...</div>;

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <h1>Admin Dashboard</h1>
        <div className="flex items-center gap-4">
          <Link to="/admin/analytics" style={{ marginRight: '8px', display: 'inline-block', backgroundColor: '#130d10', color: 'white', border: '1px solid #c8102e', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', textDecoration: 'none' }}>
            📊 Analytics
          </Link>
          <Link to="/admin/rewards" style={{ marginRight: '8px', display: 'inline-block', backgroundColor: '#c8102e', color: 'white', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', textDecoration: 'none' }}>
            🎁 Reward Tasks
          </Link>
          <Link to="/admin/payouts" style={{ marginRight: '8px', display: 'inline-block', backgroundColor: '#7c3aed', color: 'white', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', textDecoration: 'none' }}>
            💸 Payouts & Disputes
          </Link>
          <Link to="/admin/errors" style={{ marginRight: '16px', display: 'inline-block', backgroundColor: '#dc2626', color: 'white', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', textDecoration: 'none' }}>
            🔴 Error Monitor
          </Link>
          <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
        </div>
      </header>

      {analytics && (
        <div className={styles.analyticsGrid}>
          <div className={styles.statCard}>
            <h3>Total Users</h3>
            <span className={styles.statValue}>{analytics.totalUsers}</span>
          </div>
          <div className={styles.statCard}>
            <h3>Total Reports</h3>
            <span className={styles.statValue}>{analytics.totalReports}</span>
          </div>
          <div className={styles.statCard}>
            <h3>Pending Reports</h3>
            <span className={styles.statValue}>{analytics.pendingReports}</span>
          </div>
          <div className={styles.statCard}>
            <h3>Active Matches</h3>
            <span className={styles.statValue}>{analytics.activeMatches}</span>
          </div>
          <div className={styles.statCard}>
            <h3>Site Visits</h3>
            <span className={styles.statValue}>{analytics.siteVisits}</span>
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h2>Recent Reports</h2>
        <div className={styles.tableContainer}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reporter</th>
                <th>Reported User</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report._id}>
                  <td>{new Date(report.createdAt).toLocaleDateString()}</td>
                  <td>{report.reporter?.firstName} {report.reporter?.lastName}</td>
                  <td>{report.reported?.firstName} {report.reported?.lastName} ({report.reported?.email})</td>
                  <td>{report.reason}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[report.status + 'Badge']}`}>
                      {report.status}
                    </span>
                  </td>
                  <td>
                    {report.status === 'pending' && (
                      <>
                        <button
                          className={`${styles.actionBtn} ${styles.blockBtn}`}
                          onClick={() => handleAction('block', report.reported._id, report._id)}
                        >
                          Block
                        </button>
                        <button
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={() => handleAction('dismiss_report', report.reported._id, report._id)}
                        >
                          Dismiss
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.section}>
        <h2>User Management</h2>
        <div className={styles.tableContainer}>
          <table>
            <thead>
              <tr>
                <th>Joined</th>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>{u.firstName} {u.lastName}</td>
                  <td>{u.email}</td>
                  <td>{u.isBlocked ? "Blocked" : "Active"}</td>
                  <td>
                    <button
                      className={`${styles.actionBtn} ${styles.blockBtn}`}
                      onClick={() => handleAction(u.isBlocked ? 'unblock' : 'block', u._id)}
                    >
                      {u.isBlocked ? "Unblock" : "Block"}
                    </button>
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => handleAction('delete', u._id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.section}>
        <h2>System Settings</h2>
        <RateConfigPanel />
      </div>
    </div>
  );
};

const RateConfigPanel: React.FC = () => {
  const [config, setConfig] = useState<{ rate: number; history: RateHistoryItem[] } | null>(null);
  const [newRate, setNewRate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const fetchRateConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/config/diamond-rate`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data);
      }
    } catch (err) {
      console.error("Failed to fetch rate config:", err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      await fetchRateConfig();
      if (!isMounted) return;
    };
    void load();
    return () => { isMounted = false; };
  }, [fetchRateConfig]);

  const handleSave = async () => {
    const rate = parseInt(newRate, 10);
    if (!rate || rate < 1) {
      toast.error("Please enter a valid rate");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/config/diamond-rate`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ rate })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Rate updated successfully: ₦${rate} per diamond`);
        setNewRate("");
        fetchRateConfig();
      } else {
        toast.error(data.message || "Failed to update rate");
      }
    } catch {
      toast.error("Could not update rate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#1a1a1c] border border-neutral-800 rounded-2xl p-8 text-white max-w-3xl">
      <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-white">
        💎 Diamond Exchange Rate Management
      </h3>
      <p className="text-sm text-neutral-400 mb-6">
        Configure how much 1 diamond is worth in Nigerian Naira (₦).
        Changing this affects all future Naira displays, earnings calculations, and payment amounts immediately.
        It does NOT retroactively alter past transactions.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-6">
            <span className="text-xs uppercase tracking-wider text-neutral-500 font-bold block mb-1">Current rate:</span>
            <span className="text-2xl font-mono text-amber-500 font-bold block">
              ₦{config?.rate ?? "100"} per 💎 diamond
            </span>
            <span className="text-xs text-neutral-400 mt-2 block font-serif italic">
              Example: 1,000 Naira = {Math.floor(1000 / (config?.rate || 100))} diamonds
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-neutral-400 font-bold block mb-2">
                New rate (₦ per diamond)
              </label>
              <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2">
                <span className="text-neutral-500 font-bold mr-2">₦</span>
                <input
                  type="number"
                  min="1"
                  className="bg-transparent border-none outline-none text-white w-full font-mono font-bold"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  placeholder={config?.rate?.toString() || "100"}
                />
                <span className="text-neutral-500 text-xs uppercase font-bold ml-2">per 💎</span>
              </div>
            </div>

            {newRate && (
              <p className="text-xs text-amber-500 font-mono">
                Preview: 1,000 Naira = {Math.floor(1000 / (parseInt(newRate, 10) || 1))} diamonds
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !newRate}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all uppercase text-xs tracking-widest disabled:opacity-50"
            >
              {saving ? "Saving..." : "Update Rate"}
            </button>

            <p className="text-[10px] text-red-500/80 italic">
              ⚠️ Changing this updates all Naira displays immediately. Notify users before major rate changes.
            </p>
          </div>
        </div>

        <div className="flex flex-col">
          <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-bold mb-3">Rate Change History</h4>
          <div className="flex-grow bg-neutral-900 border border-neutral-800 rounded-xl p-4 max-h-[250px] overflow-y-auto space-y-3">
            {!config?.history || config.history.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">No previous rate changes logged.</p>
            ) : (
              config.history.slice().reverse().map((h, i) => (
                <div key={i} className="border-b border-neutral-800 pb-2 last:border-0 last:pb-0">
                  <div className="flex justify-between text-xs font-bold text-neutral-300">
                    <span>₦{h.value} / 💎</span>
                    <span className="text-neutral-500">
                      {new Date(h.changedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    Changed by: {h.changedBy}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
