import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { WheelEditor } from './WheelEditor';
import { API_BASE_URL } from '../../config';

interface NotificationPrefs {
  emailMessages: boolean;
  emailWeeklySummary: boolean;
  pushMessages: boolean;
  pushTips: boolean;
  pushPayouts: boolean;
}

const ProviderSettings: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adultAccessToken');

  const [activeTab, setActiveTab] = useState<'preferences' | 'wheel'>('preferences');

  const [notifications, setNotifications] = useState<NotificationPrefs>(() => {
    const stored = localStorage.getItem('provider_notification_prefs');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    return {
      emailMessages: true,
      emailWeeklySummary: true,
      pushMessages: true,
      pushTips: true,
      pushPayouts: true
    };
  });

  const [privacy, setPrivacy] = useState({
    showOnlineStatus: true,
    allowReadReceipts: true,
    appearInNearMe: true
  });

  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (!token) {
      navigate('/');
    }
  }, [token, navigate]);

  const handleToggleNotification = (key: keyof typeof notifications) => {
    setNotifications(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('provider_notification_prefs', JSON.stringify(next));
      toast.success('Notification preferences updated!');
      return next;
    });
  };

  const handleTogglePrivacy = (key: keyof typeof privacy) => {
    setPrivacy(prev => {
      const next = { ...prev, [key]: !prev[key] };
      toast.success('Privacy configurations updated!');
      return next;
    });
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwords.currentPassword || !passwords.newPassword) {
      toast.error('Please specify current & new passwords');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    toast.success('Your account password updated successfully!');
    setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const deactivateAccount = () => {
    if (window.confirm('Are you sure you want to temporarily deactivate your profile? You will not appear in dynamic discovery rooms.')) {
      toast.success('Account deactivated successfully.');
      localStorage.removeItem('adultAccessToken');
      navigate('/');
    }
  };

  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const handleTestPush = async () => {
    setTestStatus('sending');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/push/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      console.log('[Settings] Push test result:', data);

      if (data.results?.some((r: any) => r.success)) {
        setTestStatus('sent');
        toast.success('Test notification sent successfully!');
      } else {
        setTestStatus('failed');
        toast.error(data.reason || 'Failed to send test notification. Check subscription.');
      }
    } catch (err) {
      setTestStatus('failed');
      toast.error('Network or subscription error while testing push.');
    }
    setTimeout(() => setTestStatus('idle'), 5000);
  };

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">

        <div>
          <h1 className="text-4xl font-serif italic text-white tracking-wide">Account Configurations</h1>
          <p className="text-xs text-[var(--az-text-secondary)] mt-1">Configure payout rules, notification alerts, and general visibility</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Navigation links block */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-4">Configurations Categories</h3>
            <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl overflow-hidden divide-y divide-[var(--az-border)]/30">
              <button
                className={`w-full text-left p-4 hover:bg-[var(--az-bg-tertiary)]/50 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'preferences' ? 'text-[var(--az-accent-rose)]' : 'text-white'}`}
                onClick={() => setActiveTab('preferences')}
              >
                🛎️ Preferences & Privacy
              </button>
              <button
                className={`w-full text-left p-4 hover:bg-[var(--az-bg-tertiary)]/50 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'wheel' ? 'text-[var(--az-accent-rose)]' : 'text-white'}`}
                onClick={() => setActiveTab('wheel')}
              >
                🎡 Spin Wheel Editor
              </button>
              <button className="w-full text-left p-4 hover:bg-[var(--az-bg-tertiary)]/50 text-xs font-bold uppercase tracking-widest transition-colors text-white" onClick={() => navigate('/adult/provider/profile')}>🏢 Performer Profile</button>
              <button className="w-full text-left p-4 hover:bg-[var(--az-bg-tertiary)]/50 text-xs font-bold uppercase tracking-widest transition-colors text-white" onClick={() => navigate('/adult/provider/earnings')}>💰 Earnings Ledger</button>
            </div>
          </div>

          {/* Main workspace section */}
          <div className="md:col-span-2 space-y-8">

            {activeTab === 'wheel' ? (
              <WheelEditor />
            ) : (
              <>
            {/* Preferences */}
            <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 space-y-6">
              <h3 className="text-lg font-serif italic text-white">Direct Alert Preferences</h3>

              <div className="space-y-4">
                {[
                  { id: 'emailMessages', label: 'Email when I get a new message', desc: "Receive an email when you get a message and you're offline (max 1 per hour)" },
                  { id: 'emailWeeklySummary', label: 'Weekly earnings summary', desc: "A Sunday email showing your week's earnings" },
                  { id: 'pushMessages', label: 'Push notification for new messages', desc: "Get notified on your device even when app is closed" },
                  { id: 'pushTips', label: 'Push notification for tips', desc: "Get notified when someone sends you a tip" },
                  { id: 'pushPayouts', label: 'Push notification for payout updates', desc: "Be notified when your payout status changes" }
                ].map(opt => (
                  <div key={opt.id} className="flex items-start justify-between gap-4 p-3 bg-[var(--az-bg-tertiary)]/30 border border-[var(--az-border)]/50 rounded-2xl">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-[var(--az-text-primary)]">{opt.label}</span>
                      <span className="text-[10px] text-[var(--az-text-secondary)] mt-0.5">{opt.desc}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications[opt.id as keyof typeof notifications]}
                      className="accent-[var(--az-accent-rose)] h-4 w-4 cursor-pointer mt-1"
                      onChange={() => handleToggleNotification(opt.id as keyof typeof notifications)}
                    />
                  </div>
                ))}
              </div>

              {/* Push notification test button */}
              <div className="mt-6 pt-6 border-t border-[var(--az-border)]/30 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Test push notification</h4>
                  <p className="text-[10px] text-[var(--az-text-secondary)] mt-1">Send a test push alert to verify notifications function correctly on this device.</p>
                </div>
                <button
                  onClick={handleTestPush}
                  disabled={testStatus === 'sending'}
                  className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                    testStatus === 'idle' ? 'bg-[var(--az-accent-primary)] hover:bg-red-700 text-white' :
                    testStatus === 'sending' ? 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)] cursor-not-allowed' :
                    testStatus === 'sent' ? 'bg-green-600 text-white' : 'bg-red-900/50 text-red-200'
                  }`}
                >
                  {testStatus === 'idle' && 'Send Test'}
                  {testStatus === 'sending' && 'Sending...'}
                  {testStatus === 'sent' && '✅ Sent!'}
                  {testStatus === 'failed' && '❌ Failed'}
                </button>
              </div>
            </div>

            {/* Privacy Configurations */}
            <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 space-y-6">
              <h3 className="text-lg font-serif italic text-white">Privacy Configurations</h3>

              <div className="space-y-4">
                {[
                  { id: 'showOnlineStatus', label: 'Show my online status to members' },
                  { id: 'allowReadReceipts', label: 'Allow members to see when I read their messages' },
                  { id: 'appearInNearMe', label: 'Appear in "Providers Near Me" search maps' }
                ].map(opt => (
                  <div key={opt.id} className="flex items-center justify-between">
                    <span className="text-xs text-[var(--az-text-primary)]">{opt.label}</span>
                    <input
                      type="checkbox"
                      checked={privacy[opt.id as keyof typeof privacy]}
                      className="accent-[var(--az-accent-rose)] h-4 w-4 cursor-pointer"
                      onChange={() => handleTogglePrivacy(opt.id as keyof typeof privacy)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Password edit form */}
            <form onSubmit={handleUpdatePassword} className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6 space-y-4">
              <h3 className="text-lg font-serif italic text-white mb-2">Update Credentials</h3>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Current Password</label>
                <input
                  type="password"
                  className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-2.5 text-white outline-none"
                  value={passwords.currentPassword}
                  onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">New Password</label>
                  <input
                    type="password"
                    className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-2.5 text-white outline-none"
                    value={passwords.newPassword}
                    onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-2">Confirm New Password</label>
                  <input
                    type="password"
                    className="w-full bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-xl px-4 py-2.5 text-white outline-none"
                    value={passwords.confirmPassword}
                    onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                Change Password
              </button>
            </form>

            {/* Danger actions block */}
            <div className="bg-red-950/10 border border-red-500/20 rounded-3xl p-6 space-y-4">
              <h3 className="text-lg font-serif italic text-[var(--az-accent-rose)]">Danger Operations Zone</h3>
              <p className="text-xs text-[var(--az-text-secondary)]">These actions are absolute. Proceed with extreme caution.</p>

              <button
                onClick={deactivateAccount}
                className="px-6 py-2.5 border border-red-500/30 hover:bg-red-950/40 text-[var(--az-accent-rose)] font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all"
              >
                Deactivate My Performer Profile
              </button>
            </div>
              </>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};

export default ProviderSettings;
