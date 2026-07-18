import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

const ProviderDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAdultAuth();
  const token = localStorage.getItem('adultAccessToken');

  const [isLive, setIsLive] = useState(false);
  const [stats, setStats] = useState<any>({
    todayEarnings: 2400,
    weekEarnings: 18500,
    monthEarnings: 74200,
    profileViews: 1247,
    newMessages: 23,
    activeSubs: 89,
    avgRating: 4.8,
    reviewCount: 312
  });

  const [recentSessions] = useState<any[]>([
    { date: 'Yesterday 9PM - 11:30PM', tips: 4200, peakViewers: 89 },
    { date: '2 days ago 8PM - 10PM', tips: 2800, peakViewers: 64 }
  ]);

  const [recentMessages] = useState<any[]>([
    { id: '1', name: 'MemberName123', text: 'Hey, are you available tonight?', time: '2 min ago' },
    { id: '2', name: 'DiscreetUser', text: 'Loved your last show! ❤️', time: '1 hr ago' },
    { id: '3', name: 'User_8821', text: '[🔒 Premium message]', time: '3 hr ago' }
  ]);

  const [schedule] = useState<any[]>([
    { day: 'Mon', hours: '8PM – 2AM' },
    { day: 'Wed', hours: '9PM – 1AM' },
    { day: 'Fri', hours: '8PM – 3AM' },
    { day: 'Sat', hours: 'All day' }
  ]);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    const fetchDashboardData = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success && data.data.user) {
          const profile = data.data.user.providerProfile || {};
          setIsLive(profile.isLive ?? false);
          setStats({
            todayEarnings: Math.floor(profile.totalEarnings * 0.2) || 2400,
            weekEarnings: Math.floor(profile.totalEarnings * 0.6) || 18500,
            monthEarnings: profile.totalEarnings || 74200,
            profileViews: 1247,
            newMessages: 23,
            activeSubs: 89,
            avgRating: profile.rating?.average || 4.8,
            reviewCount: profile.rating?.count || 312
          });
        }
      } catch (err) {
        console.error('Failed to load real dashboard metrics:', err);
      }
    };
    fetchDashboardData();
  }, [token, navigate]);

  const toggleStatus = async () => {
    const newLiveState = !isLive;
    setIsLive(newLiveState);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isLive: newLiveState })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update online/offline state');
      toast.success(newLiveState ? "You're now live to members!" : "You're now offline.");
    } catch (err: any) {
      toast.error(err.message);
      setIsLive(!newLiveState); // revert
    }
  };

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-10">

        {/* Top Header Row with Status Toggle */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[var(--az-border)]/50 pb-6">
          <div>
            <h1 className="text-4xl font-serif italic text-white tracking-wide">
              Provider Studio
            </h1>
            <p className="text-xs text-[var(--az-text-secondary)] mt-1">
              Welcome back, <span className="text-[var(--az-accent-rose)] font-bold">{user?.firstName || 'Stage Name'}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--az-text-secondary)] font-mono font-bold uppercase">System Status:</span>
            <button
              onClick={toggleStatus}
              className={`px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all flex items-center gap-2 ${isLive ? 'bg-green-950/40 text-green-400 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-[var(--az-bg-secondary)] text-[var(--az-text-secondary)] border-[var(--az-border)]'}`}
            >
              <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-400 animate-ping' : 'bg-grey-500'}`} />
              {isLive ? 'Online & Streaming' : 'Go Live / Offline'}
            </button>
          </div>
        </div>

        {/* Earnings Hero summary card */}
        <div className="bg-[var(--az-bg-secondary)] border-2 border-[var(--az-accent-gold)] rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-[-50%] right-[-10%] w-96 h-96 bg-[var(--az-accent-gold)] rounded-full blur-[120px] opacity-10 pointer-events-none" />

          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--az-text-muted)] mb-6">Earnings Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-1">
              <p className="text-xs text-[var(--az-text-secondary)] font-serif italic">Today's Earnings</p>
              <p className="text-4xl font-mono font-bold text-[var(--az-accent-gold)]">💎 {stats.todayEarnings}</p>
              <p className="text-xs text-[var(--az-text-muted)]">${(stats.todayEarnings * 0.0075).toFixed(2)} est.</p>
            </div>
            <div className="space-y-1 border-t md:border-t-0 md:border-l border-[var(--az-border)]/50 pt-4 md:pt-0 md:pl-8">
              <p className="text-xs text-[var(--az-text-secondary)] font-serif italic">This Week</p>
              <p className="text-4xl font-mono font-bold text-white">💎 {stats.weekEarnings}</p>
              <p className="text-xs text-[var(--az-text-muted)]">${(stats.weekEarnings * 0.0075).toFixed(2)} est.</p>
            </div>
            <div className="space-y-1 border-t md:border-t-0 md:border-l border-[var(--az-border)]/50 pt-4 md:pt-0 md:pl-8">
              <p className="text-xs text-[var(--az-text-secondary)] font-serif italic">This Month</p>
              <p className="text-4xl font-mono font-bold text-white">💎 {stats.monthEarnings}</p>
              <p className="text-xs text-[var(--az-text-muted)]">${(stats.monthEarnings * 0.0075).toFixed(2)} est.</p>
            </div>
          </div>

          <div className="border-t border-[var(--az-border)]/50 mt-8 pt-4 flex justify-between items-center">
            <span className="text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest font-bold">Payout Threshold: $50.00 USD</span>
            <Link to="/adult/provider/earnings" className="text-xs text-[var(--az-accent-rose)] hover:underline uppercase font-bold tracking-widest">
              View Detailed Earnings History →
            </Link>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Profile Views', val: stats.profileViews, sub: '+12% today' },
            { label: 'New Messages', val: stats.newMessages, sub: 'unread' },
            { label: 'Active Subs', val: stats.activeSubs, sub: 'this month' },
            { label: 'Avg Rating', val: `★ ${stats.avgRating}`, sub: `${stats.reviewCount} reviews` }
          ].map((st, i) => (
            <div key={i} className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-6 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">{st.label}</p>
              <p className="text-3xl font-serif text-white mb-1 font-bold">{st.val}</p>
              <p className="text-[10px] text-[var(--az-text-muted)] font-mono">{st.sub}</p>
            </div>
          ))}
        </div>

        {/* Dashboard split content slots */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left Block: Recent Sessions + Schedule */}
          <div className="space-y-6">
            <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-serif italic text-white">Recent Cams Sessions</h3>
                <button onClick={() => navigate('/adult/provider/live')} className="text-xs text-[var(--az-accent-gold)] uppercase font-bold tracking-widest hover:underline">
                  Go Stream Room →
                </button>
              </div>

              <div className="space-y-4">
                {recentSessions.map((session, i) => (
                  <div key={i} className="flex justify-between items-center border-b border-[var(--az-border)]/50 pb-3 last:border-0 last:pb-0 text-sm">
                    <div>
                      <p className="font-medium text-white">{session.date}</p>
                      <p className="text-[10px] text-[var(--az-text-secondary)]">👁️ {session.peakViewers} peak spectators</p>
                    </div>
                    <span className="font-mono text-[var(--az-accent-gold)] font-bold">💎 {session.tips}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-serif italic text-white">Weekly Availability Schedule</h3>
                <button onClick={() => navigate('/adult/provider/profile')} className="text-xs text-[var(--az-accent-rose)] uppercase font-bold tracking-widest hover:underline">
                  Edit Calendar →
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {schedule.map((sch, i) => (
                  <div key={i} className="bg-[var(--az-bg-tertiary)] rounded-xl p-3 text-center border border-[var(--az-border)]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-accent-rose)] mb-1">{sch.day}</p>
                    <p className="text-xs text-white whitespace-nowrap">{sch.hours}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Block: Recent Messages Inbox Previews */}
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-serif italic text-white">Recent Member Messages</h3>
              <button onClick={() => navigate('/adult/provider/messages')} className="text-xs text-[var(--az-accent-gold)] uppercase font-bold tracking-widest hover:underline">
                Open Full Inbox →
              </button>
            </div>

            <div className="space-y-4 flex-grow">
              {recentMessages.map(msg => (
                <div key={msg.id} className="p-4 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl flex items-center justify-between hover:scale-[1.01] transition-transform cursor-pointer" onClick={() => navigate('/adult/provider/messages')}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--az-bg-primary)] border border-[var(--az-border)] flex items-center justify-center text-xs font-mono">
                      👤
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{msg.name}</h4>
                      <p className="text-[11px] text-[var(--az-text-secondary)] mt-0.5">{msg.text}</p>
                    </div>
                  </div>
                  <span className="text-[9px] text-[var(--az-text-muted)] font-mono">{msg.time}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default ProviderDashboard;
