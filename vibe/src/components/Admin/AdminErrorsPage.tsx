import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { io } from "socket.io-client";
import styles from "./Admin.module.css";
import { API_BASE_URL } from "../../config";

interface ErrorRecord {
  _id: string;
  errorId: string;
  fingerprint: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  zone: 'dating' | 'adult' | 'admin' | 'unknown';
  category: string;
  request?: {
    method?: string;
    route?: string;
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
  };
  userId?: string;
  accountType?: string;
  message: string;
  stack?: string;
  statusCode?: number;
  errorCode?: string;
  operation?: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  escalated?: boolean;
  escalatedAt?: string;
  createdAt: string;
}

interface SocketErrorPayload {
  priority?: string;
  message?: string;
  route?: string;
  operation?: string;
  count?: number;
}

const PRIORITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'CRITICAL', icon: '🔴' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.12)', label: 'HIGH',     icon: '🟠' },
  medium:   { color: '#eab308', bg: 'rgba(234,179,8,0.12)',  label: 'MEDIUM',   icon: '🟡' },
  low:      { color: '#a08898', bg: 'rgba(160,136,152,0.1)', label: 'LOW',      icon: '⚪' },
};

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
};

export const AdminErrorsPage: React.FC = () => {
  const navigate = useNavigate();
  const [priority, setPriority] = useState<string>('all');
  const [zone, setZone] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [resolved, setResolved] = useState<boolean>(false);
  const [selected, setSelected] = useState<ErrorRecord | null>(null);

  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  });
  const [loading, setLoading] = useState(true);

  // Resolution note
  const [resolutionNote, setResolutionNote] = useState("");

  const fetchErrors = useCallback(async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const queryParams = new URLSearchParams({
        priority,
        zone,
        category,
        resolved: resolved ? 'true' : 'false',
        limit: '50'
      });

      const res = await fetch(`${API_BASE_URL}/admin/errors?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setErrors(data.errors || []);
        if (data.counts) {
          setCounts(data.counts);
        }
      }
    } catch (err) {
      console.error("Error fetching errors:", err);
    } finally {
      setLoading(false);
    }
  }, [priority, zone, category, resolved]);

  // Socket setup
  useEffect(() => {
    const token = localStorage.getItem("adminToken");
    const socketUrl = API_BASE_URL?.replace("/api", "") || window.location.origin;

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("Admin socket connected for error monitoring:", socket.id);
    });

    socket.on("admin:new_error", (err: SocketErrorPayload) => {
      void fetchErrors();
      // Toast for critical and high
      if (err.priority === 'critical') {
        toast.error(`🔴 CRITICAL: ${err.message} on ${err.route || err.operation || ''}`);
      } else if (err.priority === 'high') {
        toast.warning(`🟠 HIGH: ${err.message}`);
      }
    });

    socket.on("admin:error_escalated", (err: SocketErrorPayload) => {
      void fetchErrors();
      toast.error(`🔴 ESCALATED TO CRITICAL: ${err.route || err.operation || ''} (${err.count} occurrences)`);
    });

    socket.on("admin:error_count_update", () => {
      void fetchErrors();
    });

    socket.on("admin:error_resolved", () => {
      void fetchErrors();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchErrors]);

  useEffect(() => {
    if (localStorage.getItem("isAdminAuthenticated") !== "true") {
      navigate("/admin/login");
      return;
    }
    let isMounted = true;
    const load = async () => {
      await fetchErrors();
      if (!isMounted) return;
    };
    void load();

    // Auto-refresh every 15s fallback
    const interval = setInterval(() => {
      void fetchErrors();
    }, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchErrors, navigate]);

  const handleResolve = async (errorId: string) => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/errors/${errorId}/resolve`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ note: resolutionNote })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Error resolved!");
        setResolutionNote("");
        setSelected(null);
        void fetchErrors();
      } else {
        toast.error(data.message || "Failed to resolve error");
      }
    } catch {
      toast.error("Network error occurred");
    }
  };

  const handleClearAllResolved = async () => {
    if (!window.confirm("Are you sure you want to delete all resolved errors older than 7 days?")) return;
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/errors/resolved`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Successfully cleared ${data.deleted} resolved errors!`);
        void fetchErrors();
      } else {
        toast.error(data.message || "Failed to clear resolved errors");
      }
    } catch {
      toast.error("Network error occurred");
    }
  };

  const selectAndLoadFullError = async (err: ErrorRecord) => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/errors/${err.errorId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSelected(data.errorRecord || data.data || err);
      } else {
        setSelected(err);
      }
    } catch {
      setSelected(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAdminAuthenticated");
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  return (
    <div className={styles.dashboardContainer}>
      {/* Page Header */}
      <header className={styles.dashboardHeader}>
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-sm bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors" style={{ textDecoration: 'none' }}>
            ← Main Dashboard
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-serif">Centralized Error Monitor 🔴</h1>
            <p className="text-xs text-neutral-400 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Live — auto-refreshing via socket and 15s polling
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {resolved && (
            <button
              onClick={handleClearAllResolved}
              className="bg-neutral-800 hover:bg-red-950 hover:text-red-300 text-zinc-400 border border-neutral-700 text-xs font-bold px-3 py-2 rounded-lg transition-colors uppercase tracking-wider"
            >
              🗑️ Purge Older Resolved (&gt;7d)
            </button>
          )}
          <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
        </div>
      </header>

      {/* Priority Pills */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {Object.entries(PRIORITY_CONFIG).map(([level, config]) => (
          <div
            key={level}
            className="border rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02] flex flex-col justify-between"
            style={{
              background: priority === level ? config.bg : 'rgba(26,26,28,0.4)',
              borderColor: priority === level ? config.color : 'rgba(255,255,255,0.08)',
              padding: '1rem',
              borderRadius: '1rem',
              borderWidth: '1px'
            }}
            onClick={() => setPriority(priority === level ? 'all' : level)}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-bold" style={{ color: config.color }}>
                {config.icon} {config.label}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-white">
                {counts[level] || 0}
              </span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold ml-1">Unresolved</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#1a1a1c] border border-neutral-800 p-4 rounded-2xl mb-6" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1rem', padding: '1rem', borderRadius: '1rem', background: '#1a1a1c', border: '1px solid #27272a' }}>
        <div className="flex flex-wrap items-center gap-3" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-500 mb-1" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold' }}>Priority</span>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs px-3 py-2 text-white outline-none focus:border-red-500"
              style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '12px' }}
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical Only</option>
              <option value="high">High Only</option>
              <option value="medium">Medium Only</option>
              <option value="low">Low Only</option>
            </select>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-500 mb-1" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold' }}>Zone</span>
            <select
              value={zone}
              onChange={e => setZone(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs px-3 py-2 text-white outline-none focus:border-red-500"
              style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '12px' }}
            >
              <option value="all">All Zones</option>
              <option value="dating">Dating Zone</option>
              <option value="adult">Adult Zone</option>
              <option value="admin">Admin Panel</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-500 mb-1" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold' }}>Category</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-lg text-xs px-3 py-2 text-white outline-none focus:border-red-500"
              style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '0.5rem', padding: '0.5rem', color: 'white', fontSize: '12px' }}
            >
              <option value="all">All Categories</option>
              <option value="payment">Payment</option>
              <option value="auth">Auth</option>
              <option value="upload">Upload</option>
              <option value="push">Push</option>
              <option value="email">Email</option>
              <option value="database">Database</option>
              <option value="server">Server</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-400 font-bold cursor-pointer bg-neutral-950/50 hover:bg-neutral-950 border border-neutral-800/80 px-4 py-2.5 rounded-xl transition-all" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={resolved}
              onChange={e => {
                setResolved(e.target.checked);
                setSelected(null);
              }}
              className="accent-red-500"
              style={{ accentColor: '#ef4444' }}
            />
            Show Resolved Errors
          </label>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" style={{ display: 'grid', gridTemplateColumns: selected ? '3fr 2fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Error Rows Listing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {loading ? (
            <div className="text-center py-12 text-zinc-500 italic">Loading errors data...</div>
          ) : errors.length === 0 ? (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center text-zinc-500 italic" style={{ padding: '3rem', background: '#1a1a1c', border: '1px solid #27272a', borderRadius: '1rem', textAlign: 'center', color: '#71717a' }}>
              🎉 No unresolved errors found matching your filters. Perfect uptime!
            </div>
          ) : (
            errors.map(err => {
              const config = PRIORITY_CONFIG[err.priority] || PRIORITY_CONFIG.medium;
              const isSelected = selected?.errorId === err.errorId;

              return (
                <div
                  key={err.errorId}
                  onClick={() => selectAndLoadFullError(err)}
                  className={`border rounded-2xl p-4 cursor-pointer transition-all flex items-start gap-4 hover:bg-neutral-900/50`}
                  style={{
                    display: 'flex',
                    alignItems: 'start',
                    gap: '1rem',
                    padding: '1rem',
                    borderRadius: '1rem',
                    cursor: 'pointer',
                    background: isSelected ? '#1c1917' : '#09090b',
                    borderColor: isSelected ? '#ef4444' : '#27272a',
                    borderWidth: '1px'
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
                    style={{ background: config.bg, color: config.color, width: '2.5rem', height: '2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.75rem', flexShrink: 0 }}
                  >
                    {config.icon}
                  </div>

                  <div className="flex-grow min-w-0" style={{ flexGrow: 1, minWidth: 0 }}>
                    <div className="flex flex-wrap items-center gap-2 mb-1" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span className="font-mono text-[11px] font-bold text-zinc-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded" style={{ fontFamily: 'monospace', fontSize: '11px', color: '#a1a1aa', padding: '0.125rem 0.5rem', border: '1px solid #27272a', background: '#18181b', borderRadius: '0.25rem' }}>
                        {err.errorId}
                      </span>
                      {err.request?.method && (
                        <span className="font-mono text-[10px] font-black text-amber-500 uppercase" style={{ color: '#f59e0b', fontWeight: '900', fontSize: '10px' }}>
                          {err.request.method}
                        </span>
                      )}
                      {err.request?.route && (
                        <span className="font-mono text-xs text-white truncate max-w-xs block font-bold" style={{ color: 'white', fontWeight: 'bold', fontSize: '12px' }}>
                          {err.request.route}
                        </span>
                      )}
                      {err.statusCode && (
                        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.25 rounded`} style={{
                          background: err.statusCode >= 500 ? '#450a0a' : '#451a03',
                          color: err.statusCode >= 500 ? '#f87171' : '#fb923c',
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.25rem',
                          fontSize: '10px'
                        }}>
                          {err.statusCode}
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-bold text-zinc-100 break-words leading-snug mb-2" style={{ color: '#f4f4f5', fontWeight: 'bold', fontSize: '14px', margin: '0.5rem 0', wordBreak: 'break-all' }}>
                      {err.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-bold" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold' }}>
                      <span style={{ background: '#18181b', border: '1px solid #27272a', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                        📁 {err.category}
                      </span>
                      <span style={{ background: '#18181b', border: '1px solid #27272a', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                        🗺️ {err.zone}
                      </span>
                      {err.userId && (
                        <span className="text-zinc-500 truncate max-w-[120px]" title={err.userId}>
                          👤 User: {err.userId}
                        </span>
                      )}
                      <span>
                        ⏰ {timeAgo(err.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0" style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: '0.5rem', flexShrink: 0 }}>
                    {err.count > 1 && (
                      <span className="bg-red-950/40 border border-red-900 text-red-400 font-mono text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(127,29,29,0.2)', border: '1px solid #991b1b', color: '#f87171', padding: '0.125rem 0.5rem', borderRadius: '1rem', fontSize: '10px', fontWeight: '900' }}>
                        ×{err.count}
                      </span>
                    )}

                    {!err.resolved ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(err);
                          handleResolve(err.errorId);
                        }}
                        className="bg-red-600/10 hover:bg-red-600 hover:text-white border border-red-500/20 text-red-400 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', padding: '0.25rem 0.5rem', borderRadius: '0.5rem', fontSize: '10px', textTransform: 'uppercase', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="text-green-500 text-xs font-bold flex items-center gap-1" style={{ color: '#10b981', fontWeight: 'bold', fontSize: '12px' }}>
                        ✓ Resolved
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Detail Panel */}
        {selected && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 text-white sticky top-6" style={{ background: '#1a1a1c', border: '1px solid #27272a', padding: '1.25rem', borderRadius: '1rem', color: 'white', position: 'sticky', top: '1.5rem', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3 mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <div className="flex items-center gap-2" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="font-mono text-sm font-bold text-zinc-400 bg-neutral-950 border border-neutral-800 px-2.5 py-1 rounded" style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', color: '#a1a1aa' }}>
                  {selected.errorId}
                </span>
                <span
                  className="text-[10px] uppercase font-black px-2 py-1 rounded"
                  style={{
                    backgroundColor: PRIORITY_CONFIG[selected.priority]?.bg,
                    color: PRIORITY_CONFIG[selected.priority]?.color,
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    fontWeight: '900',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.25rem'
                  }}
                >
                  {selected.priority.toUpperCase()}
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-zinc-400 hover:text-zinc-200 text-lg font-black bg-neutral-950 border border-neutral-800 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: '#09090b', border: '1px solid #27272a', width: '2rem', height: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa', borderRadius: '50%', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div className="space-y-5" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Message */}
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold' }}>Error Message</span>
                <p className="text-sm font-bold bg-neutral-950 border border-neutral-850 p-3 rounded-xl break-words leading-relaxed text-red-400 font-mono" style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.75rem', borderRadius: '0.75rem', wordBreak: 'break-all', color: '#f87171', fontFamily: 'monospace' }}>
                  {selected.message}
                </p>
                {selected.errorCode && (
                  <div className="mt-1.5 flex items-center gap-1.5" style={{ marginTop: '0.375rem', display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                    <span className="text-[10px] text-zinc-400 font-bold" style={{ fontSize: '10px', color: '#a1a1aa' }}>Error Code:</span>
                    <code className="text-[11px] font-bold font-mono text-yellow-500 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800" style={{ color: '#eab308', background: '#09090b', padding: '0.125rem 0.375rem', border: '1px solid #27272a', borderRadius: '0.25rem' }}>
                      {selected.errorCode}
                    </code>
                  </div>
                )}
              </div>

              {/* Request Metadata */}
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-2" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>Request Context</span>
                <div className="grid grid-cols-2 gap-3 bg-neutral-950/60 p-3.5 rounded-xl border border-neutral-800/40 text-xs font-mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'rgba(9,9,11,0.6)', border: '1px solid rgba(39,39,42,0.4)', padding: '0.875rem', borderRadius: '0.75rem' }}>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase block" style={{ fontSize: '10px', color: '#71717a' }}>Method</span>
                    <strong className="text-amber-500 uppercase" style={{ color: '#f59e0b' }}>{selected.request?.method || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase block" style={{ fontSize: '10px', color: '#71717a' }}>Route</span>
                    <strong className="text-zinc-300 break-all" style={{ color: '#d4d4d8', wordBreak: 'break-all' }}>{selected.request?.route || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase block" style={{ fontSize: '10px', color: '#71717a' }}>Status Code</span>
                    <strong className="text-red-400" style={{ color: '#f87171' }}>{selected.statusCode || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase block" style={{ fontSize: '10px', color: '#71717a' }}>Zone / Category</span>
                    <strong className="text-zinc-300 uppercase" style={{ color: '#d4d4d8' }}>{selected.zone} / {selected.category}</strong>
                  </div>
                  {selected.operation && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span className="text-zinc-500 text-[10px] uppercase block" style={{ fontSize: '10px', color: '#71717a' }}>Operation</span>
                      <strong className="text-indigo-400 break-all" style={{ color: '#818cf8', wordBreak: 'break-all' }}>{selected.operation}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Sanitised Request Body */}
              {selected.request?.body && Object.keys(selected.request.body).length > 0 && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold' }}>Sanitized Body</span>
                  <pre className="bg-neutral-950 border border-neutral-850 p-3 rounded-xl overflow-x-auto text-[11px] font-mono text-zinc-300" style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.75rem', borderRadius: '0.75rem', overflowX: 'auto', fontSize: '11px', color: '#d4d4d8' }}>
                    {JSON.stringify(selected.request.body, null, 2)}
                  </pre>
                </div>
              )}

              {/* User Context */}
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-2" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.5rem' }}>User Context</span>
                <div className="grid grid-cols-2 gap-3 bg-neutral-950/60 p-3.5 rounded-xl border border-neutral-800/40 text-xs font-mono" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'rgba(9,9,11,0.6)', border: '1px solid rgba(39,39,42,0.4)', padding: '0.875rem', borderRadius: '0.75rem' }}>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase block" style={{ fontSize: '10px', color: '#71717a' }}>User ID</span>
                    <strong className="text-zinc-300 break-all truncate block" style={{ color: '#d4d4d8', wordBreak: 'break-all' }}>{selected.userId || 'Guest'}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] uppercase block" style={{ fontSize: '10px', color: '#71717a' }}>Role</span>
                    <strong className="text-zinc-300 capitalize" style={{ color: '#d4d4d8' }}>{selected.accountType || 'Guest'}</strong>
                  </div>
                </div>
              </div>

              {/* Stack Trace (admin-only) */}
              {selected.stack && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold' }}>Stack Trace (Admin Only)</span>
                  <pre className="bg-neutral-950 border border-neutral-850 p-3.5 rounded-xl overflow-x-auto text-[9px] font-mono text-zinc-400 leading-tight max-h-48 whitespace-pre-wrap select-text" style={{ background: '#09090b', border: '1px solid #27272a', padding: '0.875rem', borderRadius: '0.75rem', overflowX: 'auto', fontSize: '9px', color: '#a1a1aa', maxHeight: '12rem', whiteSpace: 'pre-wrap' }}>
                    {selected.stack}
                  </pre>
                </div>
              )}

              {/* Resolution Form */}
              {!selected.resolved ? (
                <div className="border-t border-neutral-800 pt-4" style={{ borderTop: '1px solid #27272a', paddingTop: '1rem' }}>
                  <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1.5" style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.375rem' }}>Resolution Note</span>
                  <textarea
                    value={resolutionNote}
                    onChange={e => setResolutionNote(e.target.value)}
                    placeholder="Describe how this error was resolved or mitigated..."
                    rows={3}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-2.5 text-xs text-white focus:border-red-500 outline-none resize-none mb-3"
                    style={{ width: '100%', background: '#09090b', border: '1px solid #27272a', borderRadius: '0.75rem', padding: '0.625rem', color: 'white', fontSize: '12px', outline: 'none', resize: 'none', marginBottom: '0.75rem' }}
                  />
                  <button
                    onClick={() => handleResolve(selected.errorId)}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs uppercase font-black tracking-widest rounded-xl transition-all"
                    style={{ width: '100%', background: '#dc2626', color: 'white', padding: '0.625rem', borderRadius: '0.75rem', textTransform: 'uppercase', fontWeight: '900', letterSpacing: '0.1em', cursor: 'pointer', border: 'none' }}
                  >
                    ✓ Mark Error as Resolved
                  </button>
                </div>
              ) : (
                <div className="bg-green-950/30 border border-green-900/60 text-green-400 rounded-xl p-4 text-xs" style={{ background: 'rgba(5,150,105,0.1)', border: '1px solid rgba(5,150,105,0.4)', color: '#34d399', padding: '1rem', borderRadius: '0.75rem', fontSize: '12px' }}>
                  <strong className="block uppercase tracking-wider font-bold mb-1" style={{ textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.25rem' }}>✓ Resolved Successfully</strong>
                  <p className="text-zinc-450 mb-2" style={{ color: '#a1a1aa', marginBottom: '0.5rem' }}>Note: {selected.resolutionNote || 'No notes left.'}</p>
                  <span className="text-[10px] text-zinc-500 font-mono" style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>
                    At: {selected.resolvedAt ? new Date(selected.resolvedAt).toLocaleString() : 'N/A'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminErrorsPage;
