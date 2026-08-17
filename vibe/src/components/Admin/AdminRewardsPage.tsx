import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import styles from "./Admin.module.css";
import { API_BASE_URL } from "../../config";
import { formatAmount } from "../../lib/pricing";

interface Task {
  _id: string;
  title: string;
  description?: string;
  type: string;
  reward: number;
  actionUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

interface Stat {
  _id: string;
  title: string;
  type: string;
  completionsCount: number;
  totalCreditsAwarded: number;
}

export const AdminRewardsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal / Form state
  const [showModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("daily_checkin");
  const [reward, setReward] = useState<number>(10);
  const [actionUrl, setActionUrl] = useState("");
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);

  const fetchTasksAndStats = async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const [tasksRes, statsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/rewards/tasks`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/admin/rewards/stats`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const tasksData = await tasksRes.json();
      const statsData = await statsRes.json();

      if (tasksData.success) {
        setTasks(tasksData.data || []);
      }
      if (statsData.success) {
        setStats(statsData.data || []);
      }
    } catch (error) {
      console.error("Error fetching tasks or stats:", error);
      toast.error("Failed to load rewards tasks data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (localStorage.getItem("isAdminAuthenticated") !== "true") {
      navigate("/admin/login");
      return;
    }
    fetchTasksAndStats();
  }, []);

  const openCreateModal = () => {
    setEditingTask(null);
    setTitle("");
    setDescription("");
    setType("daily_checkin");
    setReward(10);
    setActionUrl("");
    setSortOrder(0);
    setIsActive(true);
    setShowCreateModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || "");
    setType(task.type);
    setReward(task.reward);
    setActionUrl(task.actionUrl || "");
    setSortOrder(task.sortOrder || 0);
    setIsActive(task.isActive);
    setShowCreateModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !type || reward < 1) {
      toast.error("Title, Type, and a valid Reward amount are required");
      return;
    }

    try {
      const token = localStorage.getItem("adminToken");
      const url = editingTask
        ? `${API_BASE_URL}/admin/rewards/tasks/${editingTask._id}`
        : `${API_BASE_URL}/admin/rewards/tasks`;
      const method = editingTask ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          type,
          reward,
          actionUrl,
          sortOrder,
          isActive,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(editingTask ? "Task updated" : "Task created successfully!");
        setShowCreateModal(false);
        setEditingTask(null);
        fetchTasksAndStats();
      } else {
        toast.error(data.message || "Failed to save task");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while saving");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;

    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/rewards/tasks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Task deleted successfully");
        fetchTasksAndStats();
      } else {
        toast.error(data.message || "Could not delete task");
      }
    } catch (err) {
      console.error(err);
      toast.error("Delete request failed");
    }
  };

  const toggleTaskActive = async (task: Task) => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/rewards/tasks/${task._id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...task,
          isActive: !task.isActive,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Active state toggled");
        fetchTasksAndStats();
      } else {
        toast.error(data.message || "Failed to toggle state");
      }
    } catch (err) {
      console.error(err);
      toast.error("Toggle request failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAdminAuthenticated");
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  if (loading) return <div className={styles.dashboardContainer}>Loading Reward Tasks...</div>;

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-sm bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors">
            ← Main Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-serif">Reward Task Manager 🎁</h1>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
      </header>

      {/* Stats summary section */}
      <div className={styles.section}>
        <h2>Completion Stats Per Task</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8 mt-4">
          {stats.map(stat => (
            <div key={stat._id} className={`${styles.statCard} relative overflow-hidden bg-neutral-900 border border-neutral-800 p-5 rounded-xl`}>
              <h4 className="font-bold text-white text-sm line-clamp-1">{stat.title}</h4>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{stat.type}</p>
              <div className="flex items-end justify-between mt-4">
                <div>
                  <p className="text-xs text-zinc-400">Completions</p>
                  <p className="text-lg font-bold text-white">{stat.completionsCount}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-400">Awarded</p>
                  <p className="text-lg font-bold text-yellow-400">💎 {formatAmount(stat.totalCreditsAwarded)}</p>
                </div>
              </div>
            </div>
          ))}
          {stats.length === 0 && (
            <div className="col-span-full text-center text-xs text-zinc-500 italic py-6">
              No completions recorded yet.
            </div>
          )}
        </div>
      </div>

      <div className={styles.section}>
        <div className="flex items-center justify-between mb-4">
          <h2>Active Reward Tasks</h2>
          <button
            onClick={openCreateModal}
            className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            + Create Task
          </button>
        </div>

        <div className={styles.tableContainer}>
          <table>
            <thead>
              <tr>
                <th>Title / Description</th>
                <th>Type</th>
                <th>Reward</th>
                <th>Action URL</th>
                <th>Sort Order</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task._id}>
                  <td>
                    <div className="font-bold text-white">{task.title}</div>
                    {task.description && <div className="text-xs text-zinc-500 mt-0.5">{task.description}</div>}
                  </td>
                  <td className="text-zinc-300 font-mono text-xs">{task.type}</td>
                  <td className="text-yellow-400 font-bold font-mono">💎 {formatAmount(task.reward)}</td>
                  <td className="text-zinc-400 text-xs font-mono">{task.actionUrl || "—"}</td>
                  <td className="text-zinc-300 font-mono text-xs">{task.sortOrder}</td>
                  <td>
                    <button
                      onClick={() => toggleTaskActive(task)}
                      className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        task.isActive
                          ? "bg-green-950/20 border-green-500 text-green-500"
                          : "bg-red-950/20 border-red-500 text-red-500"
                      }`}
                    >
                      {task.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold px-3 py-1.5 rounded"
                        onClick={() => openEditModal(task)}
                      >
                        Edit
                      </button>
                      <button
                        className="bg-red-900/40 hover:bg-red-900 border border-red-800 text-white text-xs font-semibold px-3 py-1.5 rounded"
                        onClick={() => handleDelete(task._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-xs text-zinc-500 italic py-8">
                    No reward tasks found. Create one above to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT FORM MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[15000] flex items-center justify-center p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl text-left text-white"
          >
            <h3 className="text-xl font-bold mb-6 font-serif">
              {editingTask ? "Edit Reward Task" : "Create New Reward Task"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Task Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-red-600 focus:outline-none"
                  placeholder="e.g. Watch a Live Cam for 30 seconds"
                  required
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Description (Optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-red-600 focus:outline-none"
                  placeholder="e.g. Support our creators and get bonus credits"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Type *</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-red-600 focus:outline-none"
                  >
                    <option value="daily_checkin">Daily Check-in</option>
                    <option value="watch_cam">Watch Live Cam</option>
                    <option value="send_message">Send Chat Message</option>
                    <option value="custom">Custom Task</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Reward Amount (Credits) *</label>
                  <input
                    type="number"
                    value={reward}
                    onChange={(e) => setReward(parseInt(e.target.value) || 0)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-red-600 focus:outline-none"
                    min="1"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Action URL</label>
                <input
                  type="text"
                  value={actionUrl}
                  onChange={(e) => setActionUrl(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-red-600 focus:outline-none"
                  placeholder="e.g. /cams or /rooms"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 items-center pt-2">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Sort Order</label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-red-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 bg-neutral-950 border border-neutral-800 text-red-600 rounded"
                  />
                  <label htmlFor="isActive" className="text-xs uppercase tracking-wider text-zinc-400 font-bold select-none cursor-pointer">
                    Active Task
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 border-t border-neutral-800 pt-4">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-widest cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest cursor-pointer transition-colors"
              >
                Save Task
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminRewardsPage;
