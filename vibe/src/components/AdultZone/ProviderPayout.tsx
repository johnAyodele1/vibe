import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Lottie from 'lottie-react';
import { API_BASE_URL } from '../../config';
import { formatAmount } from '../../lib/pricing';

// Minimal valid Lottie JSON objects defined directly to avoid JSON resolve issues in Vite/TS
const minimalLottie = {
  v: "5.5.7",
  meta: { g: "LottieFilesAE", a: "", k: "", d: "", tc: "" },
  fr: 29.97,
  ip: 0,
  op: 60,
  w: 100,
  h: 100,
  nm: "Minimal",
  ddd: 0,
  assets: [],
  layers: []
};

const queueAnimation = minimalLottie;
const verifyingAnimation = minimalLottie;
const processingAnimation = minimalLottie;
const successAnimation = minimalLottie;
const rejectedAnimation = minimalLottie;

const STATUS_CONFIG: Record<string, any> = {
  queued: {
    animation: queueAnimation,
    title: 'Payment Queued',
    subtitle: (pos: number) =>
      pos > 20
        ? `You are #${pos} in the queue. Your payment will be reviewed soon.`
        : `You are #${pos} in the queue — moving to verification soon.`,
    badgeClass: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    color: '#94a3b8',
    step: 1,
  },
  verifying: {
    animation: verifyingAnimation,
    title: 'Admin Verifying Details',
    subtitle: (pos: number) =>
      `Position #${pos} — Our team is reviewing your payout details.`,
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    color: '#f59e0b',
    step: 2,
  },
  processing: {
    animation: processingAnimation,
    title: 'Processing Payment',
    subtitle: () => 'Your payment is being sent. This usually takes a few minutes.',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    color: '#6366f1',
    step: 3,
  },
  completed: {
    animation: successAnimation,
    title: 'Payment Sent! 🎉',
    subtitle: () => 'Your earnings have been transferred to your payout account.',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: '#10b981',
    step: 4,
  },
  rejected: {
    animation: rejectedAnimation,
    title: 'Payout Rejected',
    subtitle: () => 'See reason below. Please fix the issue and re-apply.',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    color: '#f43f5e',
    step: 0,
  },
};

// Optimization (⚡ Bolt): Extract helper formatters out of render scope to preserve reference equality.
const formatPayoutDestination = (reqObj: any) => {
  if (!reqObj) return 'Configured Method';
  if (reqObj.payoutMethod === 'bank') {
    const details = reqObj.payoutDetails || {};
    const lastFour = details.accountNumber ? `(****${details.accountNumber.slice(-4)})` : '';
    return `${details.bankName || 'Bank Transfer'} ${lastFour}`.trim();
  }
  if (reqObj.payoutMethod === 'paypal') {
    return `PayPal: ${reqObj.payoutDetails?.paypalEmail || ''}`;
  }
  if (reqObj.payoutMethod === 'crypto') {
    const details = reqObj.payoutDetails || {};
    const addr = details.cryptoAddress
      ? `${details.cryptoAddress.slice(0, 6)}...${details.cryptoAddress.slice(-4)}`
      : '';
    return `${details.cryptoCurrency || 'Crypto'}${addr ? ` (${addr})` : ''}`;
  }
  return reqObj.payoutMethod || 'Configured Method';
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-NG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Optimization (⚡ Bolt): Extract React.memo wrapped list components for desktop table rows & mobile cards.
const PayoutHistoryRow: React.FC<{ item: any }> = React.memo(({ item }) => (
  <tr className="hover:bg-slate-900/40 transition-colors">
    <td className="py-4 px-4 text-slate-300 font-medium whitespace-nowrap">{formatDate(item.requestedAt)}</td>
    <td className="py-4 px-4 font-mono font-semibold text-amber-400 whitespace-nowrap">💎 {formatAmount(item.amount)}</td>
    <td className="py-4 px-4 font-mono text-slate-300 whitespace-nowrap">₦{item.amountNaira?.toLocaleString('en-NG')}</td>
    <td className="py-4 px-4 text-slate-400 max-w-xs truncate">{formatPayoutDestination(item)}</td>
    <td className="py-4 px-4 text-center whitespace-nowrap">
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : item.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
        {item.status?.toUpperCase()}
      </span>
    </td>
  </tr>
));
PayoutHistoryRow.displayName = 'PayoutHistoryRow';

const PayoutHistoryCard: React.FC<{ item: any }> = React.memo(({ item }) => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs space-y-2.5">
    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
      <span className="text-slate-400 font-medium">{formatDate(item.requestedAt)}</span>
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : item.status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
        {item.status?.toUpperCase()}
      </span>
    </div>
    <div className="flex justify-between items-baseline">
      <span className="text-slate-400">Amount:</span>
      <div className="text-right">
        <span className="font-mono font-bold text-amber-400 text-sm block">💎 {formatAmount(item.amount)}</span>
        <span className="font-mono text-slate-300 block text-[11px]">₦{item.amountNaira?.toLocaleString('en-NG')}</span>
      </div>
    </div>
    <div className="flex justify-between items-baseline pt-1 border-t border-slate-800/60">
      <span className="text-slate-400">Destination:</span>
      <span className="text-slate-300 font-medium max-w-[200px] break-all text-right">{formatPayoutDestination(item)}</span>
    </div>
    {item.adminReference && (
      <div className="text-[11px] text-slate-500 font-mono text-right">Ref: {item.adminReference}</div>
    )}
    {item.status === 'rejected' && item.rejectedReason && (
      <div className="text-[11px] text-rose-400 bg-rose-950/20 border border-rose-500/20 p-2 rounded-lg">
        Reason: {item.rejectedReason}
      </div>
    )}
  </div>
));
PayoutHistoryCard.displayName = 'PayoutHistoryCard';

const ProviderPayout: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adultAccessToken');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSending] = useState(false);

  const [eligibleAmount, setEligibleAmount] = useState(0);
  const [eligibleNaira, setEligibleNaira] = useState(0);
  const [breakdown, setBreakdown] = useState<any>({ tips: 0, calls: 0, service_charges: 0, gifts: 0, paid_media: 0, spin_wheel: 0 });

  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  const fetchEligible = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/payout/eligible`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const json = await res.json();
      if (json.success) {
        setEligibleAmount(json.eligibleAmount || 0);
        setEligibleNaira(json.eligibleNaira || 0);
        setBreakdown(json.breakdown || { tips: 0, calls: 0, service_charges: 0, gifts: 0, paid_media: 0, spin_wheel: 0 });
      }
    } catch (err) {
      console.error('Error fetching eligible payout info', err);
    }
  };

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/payout/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const json = await res.json();
      if (json.success) {
        setActiveRequest(json.data);
      }
    } catch (err) {
      console.error('Error fetching status info', err);
    }
  };

  const fetchHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/payout/history`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const json = await res.json();
      if (json.success) {
        setHistory(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching history', err);
    }
  };

  const loadAllData = async () => {
    setIsLoading(true);
    await Promise.all([fetchEligible(), fetchStatus(), fetchHistory()]);
    setIsLoading(false);
  };

  useEffect(() => {
    if (!token) {
      toast.error('Auth required');
      navigate('/adult');
      return;
    }
    loadAllData();
  }, [token]);

  const handleRequestPayout = async () => {
    if (isSubmitting) return;
    setIsSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/payout/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const json = await res.json();
      if (res.status === 400 && json.error === 'PAYOUT_METHOD_NOT_SET') {
        toast.error(json.message);
        return;
      }
      if (json.success) {
        toast.success('Payout request successfully queued!');
        await loadAllData();
      } else {
        toast.error(json.message || 'Failed to request payout');
      }
    } catch (err) {
      console.error('ERROR REQUESTING PAYOUT FRONTEND:', err);
      toast.error('Network error requesting payout');
    } finally {
      setIsSending(false);
    }
  };

  const steps = [
    { key: 'queued', label: 'Queued', icon: '📋' },
    { key: 'verifying', label: 'Verifying', icon: '🔍' },
    { key: 'processing', label: 'Processing', icon: '⚙️' },
    { key: 'completed', label: 'Sent', icon: '✅' },
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090a0f]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const activeConfig = activeRequest ? STATUS_CONFIG[activeRequest.status] : null;
  const currentStep = activeConfig ? activeConfig.step : 0;
  const latestTerminalRequest = history[0];
  const latestCompletedItem = latestTerminalRequest?.status === 'completed' ? latestTerminalRequest : null;
  const latestRejectedItem = latestTerminalRequest?.status === 'rejected' ? latestTerminalRequest : null;

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 p-4 sm:p-6 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">

        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/60 pb-5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-500/90">
              Provider Finance
            </span>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-slate-100 tracking-tight">
              Payout Headquarters
            </h1>
          </div>
          <button
            onClick={() => navigate('/adult/provider/profile?tab=payment')}
            className="self-start sm:self-auto px-4 py-2.5 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 rounded-xl text-xs font-medium text-amber-400 transition-all flex items-center gap-2 shadow-sm"
          >
            <span>⚙️ Manage Payout Account</span>
          </button>
        </div>

        {/* RECENT CONFIRMATION BANNER (FOR COMPLETED OR REJECTED HISTORY WHEN NO ACTIVE REQUEST) */}
        {!activeRequest && latestCompletedItem && (
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-emerald-400 text-xl flex-shrink-0">✅</span>
              <div>
                <h4 className="text-sm font-semibold text-emerald-400">Previous Payout Successfully Transferred</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  💎 {formatAmount(latestCompletedItem.amount)} (₦{latestCompletedItem.amountNaira?.toLocaleString('en-NG')}) sent to {formatPayoutDestination(latestCompletedItem)} on {formatDate(latestCompletedItem.requestedAt)}.
                </p>
              </div>
            </div>
            {latestCompletedItem.adminReference && (
              <span className="text-[11px] font-mono bg-emerald-900/30 text-emerald-300 px-3 py-1 rounded-full border border-emerald-500/20 flex-shrink-0">
                Ref: {latestCompletedItem.adminReference}
              </span>
            )}
          </div>
        )}

        {!activeRequest && latestRejectedItem && !latestCompletedItem && (
          <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-rose-400 text-xl flex-shrink-0">⚠️</span>
              <div>
                <h4 className="text-sm font-semibold text-rose-400">Previous Request Required Revision</h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Reason: {latestRejectedItem.rejectedReason || 'Details mismatch'}. Please verify payout method setup if retrying.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/adult/provider/profile?tab=payment')}
              className="text-xs font-medium text-rose-400 hover:text-rose-300 underline flex-shrink-0"
            >
              Update Payout Settings →
            </button>
          </div>
        )}

        {/* 1. ACTIVE PAYOUT STATUS BANNER */}
        {activeRequest && (
          <div className="bg-[#12141d] border border-amber-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-slate-800/80 pb-6">
              <div className="flex items-center gap-4 text-center sm:text-left">
                <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-center p-2">
                  {activeConfig && activeConfig.animation && (
                    <Lottie
                      animationData={activeConfig.animation}
                      loop={activeRequest.status !== 'completed' && activeRequest.status !== 'rejected'}
                      style={{ width: 64, height: 64 }}
                    />
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                    <span className="text-xs font-semibold text-amber-500 uppercase tracking-widest">Active Payout</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${activeConfig?.badgeClass}`}>
                      {activeRequest.status.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold font-serif" style={{ color: activeConfig?.color || '#fff' }}>
                    {activeConfig?.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md">
                    {activeConfig?.subtitle(activeRequest.queuePosition)}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-center md:text-right min-w-[180px] w-full md:w-auto">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider block font-semibold">Payout Amount</span>
                <span className="text-xl font-bold font-mono text-amber-400 block mt-0.5">
                  💎 {formatAmount(activeRequest.amount)}
                </span>
                <span className="text-xs text-slate-300 block font-mono">
                  ₦{activeRequest.amountNaira?.toLocaleString('en-NG')}
                </span>
              </div>
            </div>

            {/* RESPONSIVE STEPPER PROGRESS INDICATOR */}
            {activeRequest.status !== 'rejected' && (
              <div className="mt-6 pt-2">
                {/* Desktop horizontal view */}
                <div className="hidden sm:flex items-center justify-between max-w-xl mx-auto">
                  {steps.map((step, i) => {
                    const isDone = currentStep > i + 1;
                    const isActive = currentStep === i + 1;
                    const isPending = currentStep < i + 1;
                    return (
                      <React.Fragment key={step.key}>
                        <div className="flex flex-col items-center flex-1 relative">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all text-xs font-bold ${isDone ? 'bg-emerald-500 text-slate-950' : isActive ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/20' : 'bg-slate-800 border border-slate-700 text-slate-400'}`}>
                            {isDone ? '✓' : i + 1}
                          </div>
                          <span className={`text-[11px] font-medium mt-1.5 ${isActive ? 'text-amber-400 font-bold' : isPending ? 'text-slate-500' : 'text-emerald-400'}`}>
                            {step.label}
                          </span>
                        </div>
                        {i < steps.length - 1 && (
                          <div className={`h-0.5 flex-1 -mt-4 transition-colors ${isDone ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Mobile compact progress bar view */}
                <div className="sm:hidden space-y-2">
                  <div className="flex justify-between text-xs font-medium text-slate-300">
                    <span>Progress Stage</span>
                    <span className="text-amber-400 font-semibold">{steps[Math.max(0, currentStep - 1)]?.label || 'Queued'}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                    {steps.map((step, i) => (
                      <div
                        key={step.key}
                        className={`h-full flex-1 border-r border-slate-900 last:border-0 transition-all ${currentStep > i ? 'bg-emerald-500' : currentStep === i + 1 ? 'bg-amber-500 animate-pulse' : 'bg-slate-800'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
              <div className="flex justify-between sm:justify-start sm:gap-2">
                <span className="text-slate-500">Destination:</span>
                <span className="font-medium text-slate-200 break-all">{formatPayoutDestination(activeRequest)}</span>
              </div>
              <div className="flex justify-between sm:justify-end sm:gap-2">
                <span className="text-slate-500">Requested:</span>
                <span className="font-medium text-slate-200">{formatDate(activeRequest.requestedAt)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. AVAILABLE FOR PAYOUT & REQUEST INTERFACE */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">

            {/* ELIGIBLE BALANCE CARD */}
            <div className="bg-[#12141d] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-lg relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-6">
                <div>
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
                    Available for Payout
                  </span>
                  <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-amber-400 font-mono mt-1 tracking-tight">
                    💎 {formatAmount(eligibleAmount)}
                  </div>
                  <div className="text-lg sm:text-xl font-semibold text-slate-300 mt-0.5">
                    ₦{eligibleNaira.toLocaleString('en-NG')}
                  </div>
                </div>

                <div className="text-left sm:text-right text-xs text-slate-400">
                  <span className="block font-medium">Minimum payout: 💎 500</span>
                  <span className="block text-slate-500 mt-0.5">(≈ ₦50,000)</span>
                </div>
              </div>

              {/* ACTION BUTTON */}
              {activeRequest ? (
                <button
                  disabled
                  className="w-full py-4 bg-slate-800 text-slate-400 cursor-not-allowed font-semibold rounded-xl text-sm transition-all border border-slate-700/50"
                >
                  Payout in Progress ({activeRequest.status.toUpperCase()})
                </button>
              ) : eligibleAmount < 500 ? (
                <button
                  disabled
                  className="w-full py-4 bg-slate-800/80 text-slate-400 cursor-not-allowed font-semibold rounded-xl text-sm transition-all border border-slate-700/50"
                >
                  Not enough balance — Minimum 💎 500 required
                </button>
              ) : (
                <button
                  onClick={handleRequestPayout}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-base tracking-wide transition-all shadow-lg shadow-amber-500/10 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Requesting...' : `Request Payout — 💎 ${formatAmount(eligibleAmount)}`}
                </button>
              )}

              <p className="text-[11px] text-slate-400 text-center mt-4 leading-relaxed">
                Eligible earnings are calculated from confirmed transactions. Payouts are reviewed and released by admin.
              </p>
            </div>

            {/* EARNINGS BREAKDOWN */}
            <div className="bg-[#12141d] border border-slate-800 rounded-2xl p-6 shadow-lg">
              <h3 className="text-base font-serif font-bold text-slate-200 mb-4 flex items-center gap-2">
                <span>📊</span> Earnings Breakdown
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Tips & Cams</span>
                  <span className="font-mono text-sm font-semibold text-slate-200 mt-1 block">💎 {formatAmount(breakdown.tips)}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Calls</span>
                  <span className="font-mono text-sm font-semibold text-slate-200 mt-1 block">💎 {formatAmount(breakdown.calls)}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Arrangements</span>
                  <span className="font-mono text-sm font-semibold text-slate-200 mt-1 block">💎 {formatAmount(breakdown.service_charges)}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Gifts</span>
                  <span className="font-mono text-sm font-semibold text-slate-200 mt-1 block">💎 {formatAmount(breakdown.gifts)}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Premium Media</span>
                  <span className="font-mono text-sm font-semibold text-slate-200 mt-1 block">💎 {formatAmount(breakdown.paid_media)}</span>
                </div>
                <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block">Spin Earnings</span>
                  <span className="font-mono text-sm font-semibold text-slate-200 mt-1 block">💎 {formatAmount(breakdown.spin_wheel)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SIDEBAR / RULES COLUMN */}
          <div className="bg-[#12141d] border border-slate-800 rounded-2xl p-6 h-fit shadow-lg space-y-4">
            <h3 className="text-base font-serif font-bold text-slate-200 flex items-center gap-2">
              <span>🛡️</span> Payout Rules
            </h3>
            <div className="space-y-3 text-xs text-slate-400 leading-relaxed">
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 flex-shrink-0">✓</span>
                <span>Services auto-confirm 72 hours post-arrangement if not disputed.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 flex-shrink-0">✓</span>
                <span>Completed video/audio calls are immediately eligible.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 flex-shrink-0">✓</span>
                <span>Payouts transfer directly to your configured destination account.</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={() => navigate('/adult/provider/profile?tab=payment')}
                className="w-full py-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-amber-400 font-medium rounded-xl text-xs transition-all"
              >
                Manage Payout Destination →
              </button>
            </div>
          </div>
        </div>

        {/* 3. PAYOUT HISTORY TABLE / CARD LIST */}
        <div className="bg-[#12141d] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-lg">
          <h3 className="text-lg font-serif font-bold text-slate-100 mb-6 flex items-center gap-2">
            <span>📜</span> Payout History
          </h3>
          {history.length > 0 ? (
            <div>
              {/* DESKTOP TABLE VIEW (>= 768px) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400 uppercase font-semibold">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Naira Value</th>
                      <th className="py-3 px-4">Destination</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-800/60">
                    {history.map((h) => (
                      <PayoutHistoryRow key={h._id} item={h} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARD VIEW (< 768px) */}
              <div className="md:hidden space-y-3">
                {history.map((h) => (
                  <PayoutHistoryCard key={h._id} item={h} />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 text-xs">
              No historical payout requests found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProviderPayout;
