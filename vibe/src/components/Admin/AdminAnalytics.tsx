import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { API_BASE_URL } from "../../config";
import { formatAmount } from "../../lib/pricing";
import {
  LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, BarChart, Bar
} from 'recharts';

const CHART_COLORS = {
  crimson:    '#c8102e',
  gold:       '#c9a84c',
  rose:       '#e8496a',
  purple:     '#a78bfa',
  green:      '#22c55e',
  muted:      '#5a3d47',
  gridLine:   'rgba(200,16,46,0.1)',
  background: '#130d10',
};

interface AnalyticsOverview {
  users: {
    totalMembers: number;
    totalProviders: number;
    activeToday: number;
    newToday: number;
    onlineNow: number;
  };
  earnings: {
    totalPlatformFees: number;
    totalPlatformNaira: number;
    pendingPayouts: number;
    pendingPayoutsNaira: number;
  };
  content: {
    activeCamSessions: number;
    totalMessages: number;
    totalTransactions: number;
  };
}

interface TopProviderItem {
  id?: string;
  stageName: string;
  profilePhoto?: string;
  earnings: number;
}

interface RecentTxItem {
  id?: string;
  description?: string;
  fromName?: string;
  toName?: string;
  type: string;
  amount: number;
}

interface RetentionData {
  day1: number;
  day7: number;
  day30: number;
}

const AdminAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState("30d");
  const [loading, setLoading] = useState(true);

  // Overview stats state
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);

  // Chart data states
  const [dauData, setDauData] = useState<Record<string, unknown>[]>([]);
  const [earningsDaily, setEarningsDaily] = useState<Record<string, unknown>[]>([]);
  const [earningsBreakdown, setEarningsBreakdown] = useState<Record<string, unknown>[]>([]);
  const [topProviders, setTopProviders] = useState<TopProviderItem[]>([]);
  const [recentTx, setRecentTx] = useState<RecentTxItem[]>([]);
  const [retention, setRetention] = useState<RetentionData | null>(null);

  const fetchAllData = useCallback(async () => {
    try {
      const token = localStorage.getItem("adminToken");
      const headers = { Authorization: `Bearer ${token}` };

      // Determine date filters
      const today = new Date();
      const fromDate = new Date();
      if (dateRange === "7d") fromDate.setDate(today.getDate() - 7);
      else if (dateRange === "30d") fromDate.setDate(today.getDate() - 30);
      else if (dateRange === "90d") fromDate.setDate(today.getDate() - 90);
      const fromStr = fromDate.toISOString().slice(0, 10);
      const toStr = today.toISOString().slice(0, 10);

      const [
        overviewRes,
        dauRes,
        earningsDailyRes,
        breakdownRes,
        topProvidersRes,
        retentionRes,
        recentTxRes
      ] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/analytics/overview`, { headers }),
        fetch(`${API_BASE_URL}/admin/analytics/users/daily?from=${fromStr}&to=${toStr}`, { headers }),
        fetch(`${API_BASE_URL}/admin/analytics/earnings/daily?from=${fromStr}&to=${toStr}`, { headers }),
        fetch(`${API_BASE_URL}/admin/analytics/earnings/breakdown`, { headers }),
        fetch(`${API_BASE_URL}/admin/analytics/providers/top?limit=10`, { headers }),
        fetch(`${API_BASE_URL}/admin/analytics/users/retention`, { headers }),
        fetch(`${API_BASE_URL}/admin/analytics/transactions/recent?limit=20`, { headers })
      ]);

      const [
        overviewData,
        dauDataJson,
        earningsDailyJson,
        breakdownJson,
        topProvidersJson,
        retentionJson,
        recentTxJson
      ] = await Promise.all([
        overviewRes.json(),
        dauRes.json(),
        earningsDailyRes.json(),
        breakdownRes.json(),
        topProvidersRes.json(),
        retentionRes.json(),
        recentTxRes.json()
      ]);

      if (overviewData.success) setOverview(overviewData);
      if (dauDataJson.success) setDauData(dauDataJson.data);
      if (earningsDailyJson.success) setEarningsDaily(earningsDailyJson.data);
      if (breakdownJson.success) setEarningsBreakdown(breakdownJson.data);
      if (topProvidersJson.success) setTopProviders(topProvidersJson.data);
      if (retentionJson.success) setRetention(retentionJson);
      if (recentTxJson.success) setRecentTx(recentTxJson.data);

    } catch (error) {
      console.error("Error fetching analytics data:", error);
      toast.error("Failed to load analytics dashboard");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    if (localStorage.getItem("isAdminAuthenticated") !== "true") {
      navigate("/admin/login");
      return;
    }
    let isMounted = true;
    const load = async () => {
      await fetchAllData();
      if (!isMounted) return;
    };
    void load();

    // Auto-refresh recent transactions every 10s
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem("adminToken");
        const headers = { Authorization: `Bearer ${token}` };
        const res = await fetch(`${API_BASE_URL}/admin/analytics/transactions/recent?limit=20`, { headers });
        const json = await res.json();
        if (json.success) {
          setRecentTx(json.data);
        }
      } catch {
        /* Ignore background polling errors silently */
      }
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchAllData, navigate]);

  const handleLogout = () => {
    localStorage.removeItem("isAdminAuthenticated");
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-[#0d040a] text-white flex items-center justify-center">
        <p className="text-sm font-bold uppercase tracking-widest text-amber-500 animate-pulse">
          Loading Analytics Dashboard...
        </p>
      </div>
    );
  }

  const rate = 100; // standard fallback rate for display

  return (
    <div className="min-h-screen bg-[#0d040a] text-white font-sans p-6 md:p-8 space-y-10">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-red-950 pb-6">
        <div>
          <h1 className="text-3xl font-serif italic text-white tracking-wide">Analytics Dashboard</h1>
          <p className="text-xs text-neutral-400 mt-1">Platform operations audit and real-time system performance</p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <select
            className="bg-[#1b0a14] border border-red-950 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none cursor-pointer"
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          <Link to="/admin" className="px-4 py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs font-bold rounded-xl transition-all">
            ← Control Panel
          </Link>

          <button onClick={handleLogout} className="px-4 py-2 bg-red-950 border border-red-900 hover:bg-red-900 text-xs font-bold rounded-xl transition-all">
            Logout
          </button>
        </div>
      </header>

      {/* Main stats counters */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-4 md:p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Total Members</p>
            <p className="text-2xl md:text-3xl font-mono font-bold text-red-500">{overview.users.totalMembers.toLocaleString()}</p>
            <p className="text-[10px] text-neutral-500 mt-2">Registered standard users</p>
          </div>

          <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-4 md:p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Total Providers</p>
            <p className="text-2xl md:text-3xl font-mono font-bold text-amber-500">{overview.users.totalProviders.toLocaleString()}</p>
            <p className="text-[10px] text-neutral-500 mt-2">Active service providers</p>
          </div>

          <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-4 md:p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Active Today</p>
            <p className="text-2xl md:text-3xl font-mono font-bold text-green-400">{overview.users.activeToday.toLocaleString()}</p>
            <p className="text-[10px] text-neutral-500 mt-2">+{overview.users.newToday} registered today</p>
          </div>

          <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-4 md:p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Online Now</p>
            <p className="text-2xl md:text-3xl font-mono font-bold text-purple-400 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              {overview.users.onlineNow.toLocaleString()}
            </p>
            <p className="text-[10px] text-neutral-500 mt-2">Live connected clients</p>
          </div>
        </div>
      )}

      {/* Platform Earnings Card */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-6">
            <p className="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-4">Platform 15% Fees Earnings</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">All-Time Platform Fees</span>
                <span className="text-xl md:text-2xl font-mono font-bold text-amber-500">💎 {formatAmount(overview.earnings.totalPlatformFees)}</span>
                <span className="text-xs text-neutral-400 block mt-1">₦{overview.earnings.totalPlatformNaira.toLocaleString()} Naira</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-500 block">Pending Payouts</span>
                <span className="text-xl md:text-2xl font-mono font-bold text-red-400">💎 {formatAmount(overview.earnings.pendingPayouts)}</span>
                <span className="text-xs text-neutral-400 block mt-1">₦{overview.earnings.pendingPayoutsNaira.toLocaleString()} Naira</span>
              </div>
            </div>
          </div>

          <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-neutral-400 font-bold mb-3">Content Stats</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-[#1a0e16] p-2 rounded-xl border border-red-950/20">
                  <span className="text-neutral-500 block font-bold text-[9px] uppercase">Active Cams</span>
                  <span className="font-mono text-amber-500 text-lg font-bold">{overview.content.activeCamSessions}</span>
                </div>
                <div className="bg-[#1a0e16] p-2 rounded-xl border border-red-950/20">
                  <span className="text-neutral-500 block font-bold text-[9px] uppercase">Total Msg</span>
                  <span className="font-mono text-purple-400 text-lg font-bold">{overview.content.totalMessages}</span>
                </div>
                <div className="bg-[#1a0e16] p-2 rounded-xl border border-red-950/20">
                  <span className="text-neutral-500 block font-bold text-[9px] uppercase">Total Tx</span>
                  <span className="font-mono text-green-400 text-lg font-bold">{overview.content.totalTransactions}</span>
                </div>
              </div>
            </div>
            {retention && (
              <div className="mt-3 text-xs text-neutral-400 flex justify-between items-center bg-[#1a0e16]/50 p-2 rounded-xl">
                <span className="font-bold">Member Retention:</span>
                <span>Day 1: {retention.day1}% | Day 7: {retention.day7}% | Day 30: {retention.day30}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unique Active Users per Day */}
        <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-6">
          <h3 className="text-sm font-serif italic text-neutral-200 mb-6 uppercase tracking-wider">Unique Active Users & Registration Growth</h3>
          {dauData.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-neutral-600 text-xs italic">No activity logged for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dauData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
                <XAxis dataKey="date" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
                <YAxis stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#130d10', border: '1px solid rgba(200,16,46,0.3)', borderRadius: 8 }}
                  labelStyle={{ color: '#f5edf0' }}
                />
                <Line type="monotone" dataKey="activeUsers" stroke={CHART_COLORS.crimson} strokeWidth={2} dot={false} name="Active Users" />
                <Line type="monotone" dataKey="newMembers" stroke={CHART_COLORS.gold} strokeWidth={2} dot={false} name="New Members" />
                <Line type="monotone" dataKey="newProviders" stroke={CHART_COLORS.rose} strokeWidth={2} dot={false} name="New Providers" />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Earnings Over Time Area Chart */}
        <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-6">
          <h3 className="text-sm font-serif italic text-neutral-200 mb-6 uppercase tracking-wider">Platform Earnings Performance Over Time</h3>
          {earningsDaily.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-neutral-600 text-xs italic">No earnings logged for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={earningsDaily}>
                <defs>
                  <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CHART_COLORS.crimson} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.crimson} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
                <XAxis dataKey="date" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
                <YAxis stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#130d10', border: '1px solid rgba(200,16,46,0.3)', borderRadius: 8 }} />
                <Area type="monotone" dataKey="platformFees" stroke={CHART_COLORS.crimson} fill="url(#earningsGradient)" name="Platform Fees (💎)" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Earnings by Source Donut */}
        <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-6">
          <h3 className="text-sm font-serif italic text-neutral-200 mb-6 uppercase tracking-wider">Fees Collected by Service Source</h3>
          {earningsBreakdown.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-neutral-600 text-xs italic">No fee breakdown available</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={earningsBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90}>
                  {earningsBreakdown.map((_, index) => (
                    <Cell key={index} fill={Object.values(CHART_COLORS)[index % Object.values(CHART_COLORS).length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: '#130d10', border: '1px solid rgba(200,16,46,0.3)', borderRadius: 8 }} />
                <Legend formatter={(value) => <span style={{ color: '#a08898', fontSize: 12 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Growth representation bar */}
        <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-6">
          <h3 className="text-sm font-serif italic text-neutral-200 mb-6 uppercase tracking-wider">Members vs Providers Stacked Growth</h3>
          {dauData.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-neutral-600 text-xs italic">No growth statistics to display</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dauData}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
                <XAxis dataKey="date" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
                <YAxis stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#130d10', border: '1px solid rgba(200,16,46,0.3)', borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="newMembers" fill={CHART_COLORS.crimson} name="New Members" radius={[2,2,0,0]} />
                <Bar dataKey="newProviders" fill={CHART_COLORS.gold} name="New Providers" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Providers */}
        <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-6">
          <h3 className="text-sm font-serif italic text-neutral-200 mb-4 uppercase tracking-wider">Top Performer Providers This Month</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-red-950/40 text-neutral-500 uppercase tracking-widest">
                  <th className="pb-3 font-semibold">Avatar</th>
                  <th className="pb-3 font-semibold">Stage Name</th>
                  <th className="pb-3 font-semibold text-right">Net Month Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-950/20 text-neutral-300">
                {topProviders.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="pt-4 text-center italic text-neutral-600">No performers found for this month</td>
                  </tr>
                ) : (
                  topProviders.map((p, idx) => (
                    <tr key={p.id || idx} className="hover:bg-red-950/10 transition-colors">
                      <td className="py-2.5">
                        <img src={p.profilePhoto} alt={p.stageName} className="w-8 h-8 rounded-full object-cover border border-red-950/50" />
                      </td>
                      <td className="py-2.5 font-sans font-bold text-white">{p.stageName}</td>
                      <td className="py-2.5 text-right font-bold text-amber-500">💎 {formatAmount(p.earnings)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Recent Transactions Feed */}
        <div className="bg-[#130d10] border border-red-950/40 rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-serif italic text-neutral-200 uppercase tracking-wider">Live Recent Transaction Audit</h3>
            <span className="text-[10px] text-amber-500 font-bold tracking-widest animate-pulse uppercase">● Live Auto-Syncing</span>
          </div>

          <div className="space-y-3 max-h-64 overflow-y-auto pr-2 divide-y divide-red-950/15">
            {recentTx.length === 0 ? (
              <p className="text-neutral-600 text-xs italic text-center py-8">No transactions executed recently</p>
            ) : (
              recentTx.map((tx, idx) => (
                <div key={tx.id || idx} className="pt-2.5 first:pt-0 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <div>
                      <p className="font-bold text-white text-[11px]">{tx.description || `${tx.fromName} paid ${tx.toName}`}</p>
                      <p className="text-[9px] text-neutral-500 lowercase font-mono">type: {tx.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-green-400">💎 {formatAmount(tx.amount)}</p>
                    <p className="text-[9px] text-neutral-500 font-mono">≈ ₦{(tx.amount * rate).toLocaleString()}</p>
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

export default AdminAnalytics;
