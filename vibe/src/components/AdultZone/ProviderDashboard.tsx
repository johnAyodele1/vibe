import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { usePricingStore, formatNaira, formatAmount } from '../../lib/pricing';
import { toast } from 'sonner';

const ProviderDashboard: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adultAccessToken');

  const [stageName, setStageName] = useState('Stage Name');
  const [isLoading, setIsLoading] = useState(true);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [stats, setStats] = useState<any>({
    todayEarnings: 0,
    weekEarnings: 0,
    monthEarnings: 0,
    profileViews: 0,
    newMessages: 0,
    activeSubs: 0,
    avgRating: 0,
    reviewCount: 0
  });

  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [recentMessages, setRecentMessages] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('New update from me');
  const [notificationBody, setNotificationBody] = useState('I have something new for you.');
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    const fetchDashboardData = async () => {
      try {
        setIsLoading(true);
        const userRes = await fetch(`${API_BASE_URL}/v1/adult/providers/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        if (userRes.ok && userData.success && userData.data.user) {
          const profile = userData.data.user.providerProfile || {};
          setStageName(profile.stageName || userData.data.user.displayName || userData.data.user.username || 'Stage Name');
        }

        try {
          const sessionRes = await fetch(`${API_BASE_URL}/adult/cams/my-active-session`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const sessionData = await sessionRes.json();
          if (sessionRes.ok && sessionData.success && sessionData.data?.activeSession) {
            setHasActiveSession(true);
          } else {
            setHasActiveSession(false);
          }
        } catch (sessionErr) {
          console.error('Failed to load active cam session:', sessionErr);
        }

        const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/dashboard`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const d = data.data;
          setStats(d.stats);
          setRecentSessions(d.recentSessions || []);

          try {
            const subscriberRes = await fetch(`${API_BASE_URL}/v1/adult/providers/me/subscribers`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const subscriberData = await subscriberRes.json();
            if (subscriberRes.ok && subscriberData.success) {
              setStats((current: any) => ({ ...current, activeSubs: subscriberData.data?.activeSubs || 0 }));
            }
          } catch (subscriberErr) {
            console.error('Failed to load subscriber count:', subscriberErr);
          }
          setRecentMessages(d.recentMessages || []);

          const dayShortNames: { [key: string]: string } = {
            'Monday': 'Mon',
            'Tuesday': 'Tue',
            'Wednesday': 'Wed',
            'Thursday': 'Thu',
            'Friday': 'Fri',
            'Saturday': 'Sat',
            'Sunday': 'Sun'
          };

          const formatTime = (timeStr: string) => {
            if (!timeStr) return '';
            const [h, m] = timeStr.split(':');
            const hours = parseInt(h, 10);
            const minutes = parseInt(m, 10);
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 === 0 ? 12 : hours % 12;
            const displayMinutes = minutes > 0 ? `:${m}` : '';
            return `${displayHours}${displayMinutes}${ampm}`;
          };

          const formatHours = (start: string, end: string) => {
            if (start === '00:00' && end === '23:59') return 'All day';
            return `${formatTime(start)} – ${formatTime(end)}`;
          };

          const mappedSchedule = (d.schedule || [])
            .filter((s: any) => s.active)
            .map((s: any) => ({
              day: dayShortNames[s.day] || s.day,
              hours: formatHours(s.start, s.end)
            }));

          setSchedule(mappedSchedule);
        }
      } catch (err) {
        console.error('Failed to load real dashboard metrics:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboardData();
  }, [token, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--az-bg-primary)] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[var(--az-accent-gold)] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Loading Performer Studio...</p>
        </div>
      </div>
    );
  }

  const openNotifySubscribers = () => {
    if (stats.activeSubs <= 0) {
      toast.info('You do not have any active subscribers yet.');
      return;
    }
    setIsNotifyModalOpen(true);
  };

  const sendSubscriberNotification = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSendingNotification || stats.activeSubs <= 0) return;

    setIsSendingNotification(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/providers/me/subscribers/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: notificationTitle, body: notificationBody })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        toast.error(data.message || 'Could not notify subscribers');
        return;
      }

      toast.success(data.message || 'Notification sent to subscribers');
      setIsNotifyModalOpen(false);
    } catch (error) {
      console.error('Failed to notify subscribers:', error);
      toast.error('Could not notify subscribers');
    } finally {
      setIsSendingNotification(false);
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
              Welcome back, <span className="text-[var(--az-accent-rose)] font-bold">{stageName}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--az-text-secondary)] font-mono font-bold uppercase">System Status:</span>
            {hasActiveSession ? (
              <button
                onClick={() => navigate('/adult/provider/live')}
                className="px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all flex items-center gap-2 bg-green-950/40 text-green-400 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.2)] hover:scale-105"
              >
                <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
                Online & Streaming
              </button>
            ) : (
              <button
                onClick={() => navigate('/adult/provider/live?autoStart=true')}
                className="px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest border transition-all flex items-center gap-2 bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] border-[var(--az-border)] hover:border-[var(--az-accent-rose)] hover:text-[var(--az-accent-rose)] hover:scale-105"
              >
                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                Go Live
              </button>
            )}
          </div>
        </div>

        {/* Earnings Hero summary card */}
        <div className="bg-[var(--az-bg-secondary)] border-2 border-[var(--az-accent-gold)] rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute top-[-50%] right-[-10%] w-96 h-96 bg-[var(--az-accent-gold)] rounded-full blur-[120px] opacity-10 pointer-events-none" />

          <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--az-text-muted)] mb-6">Earnings Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-1">
              <p className="text-xs text-[var(--az-text-secondary)] font-serif italic">Today's Earnings</p>
              <p className="text-4xl font-mono font-bold text-[var(--az-accent-gold)]">💎 {formatAmount(stats.todayEarnings)}</p>
              <p className="text-xs text-[var(--az-text-muted)]">≈ {formatNaira(stats.todayEarnings * usePricingStore.getState().diamondNairaRate)} est.</p>
            </div>
            <div className="space-y-1 border-t md:border-t-0 md:border-l border-[var(--az-border)]/50 pt-4 md:pt-0 md:pl-8">
              <p className="text-xs text-[var(--az-text-secondary)] font-serif italic">This Week</p>
              <p className="text-4xl font-mono font-bold text-white">💎 {formatAmount(stats.weekEarnings)}</p>
              <p className="text-xs text-[var(--az-text-muted)]">≈ {formatNaira(stats.weekEarnings * usePricingStore.getState().diamondNairaRate)} est.</p>
            </div>
            <div className="space-y-1 border-t md:border-t-0 md:border-l border-[var(--az-border)]/50 pt-4 md:pt-0 md:pl-8">
              <p className="text-xs text-[var(--az-text-secondary)] font-serif italic">This Month</p>
              <p className="text-4xl font-mono font-bold text-white">💎 {formatAmount(stats.monthEarnings)}</p>
              <p className="text-xs text-[var(--az-text-muted)]">≈ {formatNaira(stats.monthEarnings * usePricingStore.getState().diamondNairaRate)} est.</p>
            </div>
          </div>

          <div className="border-t border-[var(--az-border)]/50 mt-8 pt-4 flex justify-between items-center">
            <span className="text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest font-bold">Payout Threshold: 5,000 diamonds (≈ {formatNaira(5000 * usePricingStore.getState().diamondNairaRate)})</span>
            <Link to="/adult/provider/earnings" className="text-xs text-[var(--az-accent-rose)] hover:underline uppercase font-bold tracking-widest">
              View Detailed Earnings History →
            </Link>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Profile Views', val: stats.profileViews, sub: null, onClick: undefined },
            { label: 'New Messages', val: stats.newMessages, sub: 'unread', onClick: undefined },
            { label: 'Active Subs', val: stats.activeSubs, sub: 'Notify Subs', onClick: openNotifySubscribers },
            { label: 'Avg Rating', val: `★ ${stats.avgRating}`, sub: `${stats.reviewCount} reviews`, onClick: undefined }
          ].map((st, i) => (
            <div key={i} className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-6 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">{st.label}</p>
              <p className="text-3xl font-serif text-white mb-1 font-bold">{st.val}</p>
              {st.sub && (st.onClick ? (
                <button type="button" onClick={st.onClick} className="text-[10px] text-[var(--az-text-muted)] font-mono underline underline-offset-2 hover:text-white transition-colors">
                  {st.sub}
                </button>
              ) : <p className="text-[10px] text-[var(--az-text-muted)] font-mono">{st.sub}</p>)}
            </div>
          ))}
        </div>

        {isNotifyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="notify-subs-title">
            <div className="w-full max-w-lg rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)] p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 id="notify-subs-title" className="text-xl font-serif italic text-white">Notify Your Subscribers</h2>
                  <p className="mt-1 text-xs text-[var(--az-text-secondary)]">Send a push notification to your {stats.activeSubs} active subscriber{stats.activeSubs === 1 ? '' : 's'}.</p>
                </div>
                <button type="button" onClick={() => setIsNotifyModalOpen(false)} className="text-[var(--az-text-muted)] hover:text-white text-xl" aria-label="Close">×</button>
              </div>

              <form onSubmit={sendSubscriberNotification} className="space-y-4">
                <div>
                  <label htmlFor="subscriber-notification-title" className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Title</label>
                  <input id="subscriber-notification-title" value={notificationTitle} onChange={e => setNotificationTitle(e.target.value)} maxLength={80} required className="w-full rounded-xl border border-[var(--az-border)] bg-[var(--az-bg-tertiary)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--az-accent-gold)]" />
                </div>
                <div>
                  <label htmlFor="subscriber-notification-body" className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Message</label>
                  <textarea id="subscriber-notification-body" value={notificationBody} onChange={e => setNotificationBody(e.target.value)} maxLength={240} rows={4} required className="w-full resize-none rounded-xl border border-[var(--az-border)] bg-[var(--az-bg-tertiary)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--az-accent-gold)]" />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsNotifyModalOpen(false)} className="rounded-full border border-[var(--az-border)] px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] hover:text-white">Cancel</button>
                  <button type="submit" disabled={isSendingNotification || !notificationTitle.trim() || !notificationBody.trim()} className="rounded-full bg-[var(--az-accent-gold)] px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-50">
                    {isSendingNotification ? 'Sending…' : 'Send Push Notification'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
                {recentSessions.length > 0 ? (
                  recentSessions.map((session, i) => (
                    <div key={i} className="flex justify-between items-center border-b border-[var(--az-border)]/50 pb-3 last:border-0 last:pb-0 text-sm">
                      <div>
                        <p className="font-medium text-white">{session.date}</p>
                        <p className="text-[10px] text-[var(--az-text-secondary)]">👁️ {session.peakViewers} peak spectators</p>
                      </div>
                      <span className="font-mono text-[var(--az-accent-gold)] font-bold">💎 {formatAmount(session.tips)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[var(--az-text-muted)] italic text-center py-4">No recent streaming sessions recorded.</p>
                )}
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
                {schedule.length > 0 ? (
                  schedule.map((sch, i) => (
                    <div key={i} className="bg-[var(--az-bg-tertiary)] rounded-xl p-3 text-center border border-[var(--az-border)]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-accent-rose)] mb-1">{sch.day}</p>
                      <p className="text-xs text-white whitespace-nowrap">{sch.hours}</p>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-4 text-center">
                    <p className="text-xs text-[var(--az-text-muted)] italic">No availability set. Update your calendar.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Block: Recent Messages Inbox Previews */}
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 flex flex-col h-full animate-fadeIn">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-serif italic text-white">Recent Member Messages</h3>
              <button onClick={() => navigate('/adult/provider/messages')} className="text-xs text-[var(--az-accent-gold)] uppercase font-bold tracking-widest hover:underline">
                Open Full Inbox →
              </button>
            </div>

            <div className="space-y-4 flex-grow flex flex-col justify-start">
              {recentMessages.length > 0 ? (
                recentMessages.map(msg => (
                  <div key={msg.id} className="p-4 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl flex items-center justify-between hover:scale-[1.01] transition-transform cursor-pointer" onClick={() => navigate('/adult/provider/messages')}>
                    <div className="flex items-center gap-3 min-w-0 mr-4 flex-1">
                      <div className="w-10 h-10 rounded-full bg-[var(--az-bg-primary)] border border-[var(--az-border)] flex items-center justify-center text-xs font-mono flex-shrink-0">
                        👤
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-white truncate">{msg.name}</h4>
                        <p className="text-[11px] text-[var(--az-text-secondary)] mt-0.5 truncate">{msg.text}</p>
                      </div>
                    </div>
                    <span className="text-[9px] text-[var(--az-text-muted)] font-mono flex-shrink-0">{msg.time}</span>
                  </div>
                ))
              ) : (
                <div className="flex-grow flex flex-col items-center justify-center text-center py-12">
                  <span className="text-2xl mb-2">✉️</span>
                  <p className="text-xs text-[var(--az-text-muted)] italic">Your inbox is currently empty.</p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default ProviderDashboard;
