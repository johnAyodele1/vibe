import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import styles from "./Admin.module.css";
import { API_BASE_URL } from "../../config";

interface Analytics {
  totalUsers: number;
  totalReports: number;
  pendingReports: number;
  activeMatches: number;
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

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
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
  };

  useEffect(() => {
    if (localStorage.getItem("isAdminAuthenticated") !== "true") {
      navigate("/admin/login");
      return;
    }
    fetchData();
  }, []);

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
    } catch (error) {
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
        <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
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
    </div>
  );
};

export default AdminDashboard;
