import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../config';
import { formatAmount } from '../../lib/pricing';

const STATUS_CONFIG: Record<string, any> = {
  queued: {
    title: 'Payout Queued',
    subtitle: (pos: number) =>
      pos > 20
        ? `You are #${pos} in the queue. Your request will be reviewed shortly.`
        : `You are #${pos} in the queue — moving to admin verification soon.`,
    badgeBg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
    step: 1,
  },
  verifying: {
    title: 'Admin Verification',
    subtitle: (pos: number) =>
      `Position #${pos} — Our compliance team is verifying your payout details.`,
    badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    step: 2,
  },
  processing: {
    title: 'Processing Payment',
    subtitle: () => 'Your funds are actively being transferred to your payout destination.',
    badgeBg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
    step: 3,
  },
};

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
        toast.success('Payout request submitted successfully!');
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

  const formatPayoutDestination = (reqObj: any) => {
    if (!reqObj) return 'Configured Method';
    if (reqObj.payoutMethod === 'bank') {
      const details = reqObj.payoutDetails || {};
      const lastFour = details.accountNumber ? `(****${details.accountNumber.slice(-4)})` : '';
      return `${details.bankName || 'Bank Transfer'} ${lastFour}`;
    }
    if (reqObj.payoutMethod === 'paypal') {
      return `PayPal: ${reqObj.payoutDetails?.paypalEmail || ''}`;
    }
    if (reqObj.payoutMethod === 'crypto') {
      const details = reqObj.payoutDetails || {};
      const addr = details.cryptoAddress ? `${details.cryptoAddress.slice(0, 8)}...` : '';
      return `${details.cryptoCurrency || 'Crypto'} to ${addr}`;
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

  const steps = [
    { key: 'queued', label: 'Queued', icon: '📋' },
    { key: 'verifying', label: 'Verifying', icon: '🔍' },
    { key: 'processing', label: 'Processing', icon: '⚙️' },
    { key: 'completed', label: 'Sent', icon: '✅' },
  ];

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090a0f]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-amber-400"></div>
      </div>
    );
  }

  const latestHistory = history.length > 0 ? history[0] : null;
  const isLatestCompleted = latestHistory?.status === 'completed';
  const isLatestRejected = latestHistory?.status === 'rejected';

  const activeConfig = activeRequest ? STATUS_CONFIG[activeRequest.status] : null;
  const currentStep = activeConfig ? activeConfig.step : 0;

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 p-4 sm:p-6 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Payout Headquarters</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Provider Earnings
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Manage your withdrawable balances, monitor payout status, and track historical transfers.
            </p>
          </div>
          <button
            onClick={() => navigate('/adult/provider/profile?tab=payment')}
            className="self-start sm:self-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-amber-400 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <span>Payout Settings</span>
            <span>→</span>
          </button>
        </div>

        {/* RECENTLY COMPLETED NOTIFICATION BANNER */}
        {!activeRequest && isLatestCompleted && (
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-lg">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg flex-shrink-0">
              ✅
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                <span>Payment Sent</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono">
                  {formatDate(latestHistory.completedAt || latestHistory.requestedAt)}
                </span>
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Your previous payout of <strong className="font-mono text-emerald-300">💎 {formatAmount(latestHistory.amount)} (₦{latestHistory.amountNaira?.toLocaleString('en-NG')})</strong> was successfully transferred to your configured payout account.
              </p>
              {latestHistory.adminReference && (
                <p className="text-[11px] font-mono text-slate-400 mt-1.5">
                  Ref: <span className="text-slate-200">{latestHistory.adminReference}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* RECENTLY REJECTED NOTIFICATION BANNER */}
        {!activeRequest && isLatestRejected && (
          <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-lg">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg flex-shrink-0">
              ⚠️
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                <span>Previous Payout Rejected</span>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-mono">
                  {formatDate(latestHistory.rejectedAt || latestHistory.requestedAt)}
                </span>
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Reason: <strong className="text-rose-200">{latestHistory.rejectedReason || 'No specific reason provided.'}</strong>
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <button
                  onClick={() => navigate('/adult/provider/profile?tab=payment')}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-semibold transition-all"
                >
                  Update Payout Details →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. ACTIVE PAYOUT CARD (IF QUEUED / VERIFYING / PROCESSING) */}
        {activeRequest && (
          <div className="bg-gradient-to-b from-[#131722] to-[#0f111a] border border-amber-500/30 rounded-3xl p-5 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl">
                  ⌛
                </div>
                <div>
                  <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Active Payout Progress</span>
                  <h2 className="text-lg sm:text-xl font-bold text-white">{activeConfig?.title}</h2>
                </div>
              </div>
              <span className={`self-start sm:self-auto text-xs px-3 py-1 rounded-full border font-semibold ${activeConfig?.badgeBg}`}>
                {activeRequest.status.toUpperCase()}
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 mt-4 leading-relaxed">
              {activeConfig?.subtitle(activeRequest.queuePosition)}
            </p>

            {/* Request Summary details */}
            <div className="mt-6 bg-[#090a0f]/80 border border-slate-800 rounded-2xl p-4 sm:p-5 text-xs sm:text-sm space-y-2.5">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Amount Requested</span>
                <span className="font-bold text-amber-400 font-mono">💎 {formatAmount(activeRequest.amount)}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                <span className="text-slate-400">Naira Value</span>
                <span className="font-semibold text-slate-200 font-mono">₦{activeRequest.amountNaira?.toLocaleString('en-NG')}</span>
              </div>
              <div className="flex justify-between items-start gap-4 border-b border-slate-800/80 pb-2">
                <span className="text-slate-400 flex-shrink-0">Payout Destination</span>
                <span className="font-semibold text-slate-200 text-right break-all">{formatPayoutDestination(activeRequest)}</span>
              </div>
              <div className="flex justify-between items-center pt-0.5">
                <span className="text-slate-400">Requested Date</span>
                <span className="font-medium text-slate-300">{formatDate(activeRequest.requestedAt)}</span>
              </div>
            </div>

            {/* Stepper progress indicator */}
            <div className="mt-8 pt-4">
              <div className="hidden sm:flex items-center justify-between relative max-w-md mx-auto">
                {steps.map((step, i) => {
                  const isDone = currentStep > i + 1;
                  const isActive = currentStep === i + 1;
                  const isPending = currentStep < i + 1;
                  return (
                    <React.Fragment key={step.key}>
                      <div className="flex flex-col items-center relative z-10">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          isDone
                            ? 'bg-emerald-500 text-slate-950 shadow-md'
                            : isActive
                            ? 'bg-amber-400 text-slate-950 ring-4 ring-amber-400/20 shadow-lg'
                            : 'bg-slate-800 border border-slate-700 text-slate-500'
                        }`}>
                          {isDone ? '✓' : step.icon}
                        </div>
                        <span className={`text-[11px] font-medium mt-1.5 ${
                          isActive ? 'text-amber-400 font-bold' : isPending ? 'text-slate-500' : 'text-emerald-400'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`h-0.5 flex-1 -mt-4 transition-colors ${
                          isDone ? 'bg-emerald-500' : 'bg-slate-800'
                        }`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Compact Vertical Stepper for Mobile */}
              <div className="sm:hidden space-y-2.5">
                {steps.map((step, i) => {
                  const isDone = currentStep > i + 1;
                  const isActive = currentStep === i + 1;
                  return (
                    <div key={step.key} className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : isDone
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                        : 'bg-slate-900/40 border-slate-800/60 text-slate-500'
                    }`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isDone ? 'bg-emerald-500 text-slate-950' : isActive ? 'bg-amber-400 text-slate-950' : 'bg-slate-800'
                      }`}>
                        {isDone ? '✓' : step.icon}
                      </div>
                      <span className="text-xs font-semibold">{step.label}</span>
                      {isActive && <span className="ml-auto text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-300">In Progress</span>}
                      {isDone && <span className="ml-auto text-[10px] font-bold text-emerald-400">Completed</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 2. MAIN AVAILABLE FOR PAYOUT & ELIGIBILITY INTERFACE */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#12151e] border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-xl relative">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-6">
                <div>
                  <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Available for Payout</span>
                  <div className="text-3xl sm:text-5xl font-extrabold text-amber-400 font-mono mt-1 tracking-tight">
                    💎 {formatAmount(eligibleAmount)}
                  </div>
                </div>
                <div className="sm:text-right">
                  <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider block">Estimated Naira Value</span>
                  <div className="text-lg sm:text-2xl font-bold text-slate-200 font-mono mt-0.5">
                    ₦{eligibleNaira.toLocaleString('en-NG')}
                  </div>
                </div>
              </div>

              {/* Requirement Checkpoints */}
              <div className="bg-[#090a0f] border border-slate-800/80 rounded-2xl p-4 sm:p-5 mb-6 space-y-2.5">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Payout Availability Rules</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>Arrangements auto-confirm after 72h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>Completed call & tip earnings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>No active dispute lock</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>Minimum threshold 💎 500 (₦50,000)</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              {activeRequest ? (
                <button
                  disabled
                  className="w-full py-3.5 sm:py-4 bg-slate-800 text-slate-400 font-bold rounded-2xl text-sm sm:text-base cursor-not-allowed border border-slate-700/50 opacity-90"
                >
                  Payout in Progress
                </button>
              ) : (
                <button
                  onClick={handleRequestPayout}
                  disabled={eligibleAmount < 500 || isSubmitting}
                  className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:border disabled:border-slate-800 text-slate-950 font-bold rounded-2xl text-sm sm:text-base tracking-wide transition-all shadow-lg shadow-amber-500/10 active:scale-[0.99] disabled:shadow-none"
                >
                  {isSubmitting
                    ? 'Requesting...'
                    : eligibleAmount < 500
                    ? 'Not Enough Balance (Min 💎 500)'
                    : `Request Payout — 💎 ${formatAmount(eligibleAmount)}`}
                </button>
              )}

              <p className="text-[11px] text-slate-500 text-center mt-3.5">
                Payout requests are reviewed by our financial team and processed securely.
              </p>
            </div>

            {/* Earnings Breakdown */}
            <div className="bg-[#12151e] border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-xl">
              <h3 className="text-base font-bold text-white mb-5 flex items-center justify-between">
                <span>Eligible Earnings Breakdown</span>
                <span className="text-xs font-normal text-slate-400">By Source</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#090a0f] p-3.5 rounded-2xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block mb-1">Tips & Cams</span>
                  <span className="font-mono text-sm font-semibold text-slate-200">💎 {formatAmount(breakdown.tips)}</span>
                </div>
                <div className="bg-[#090a0f] p-3.5 rounded-2xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block mb-1">Calls</span>
                  <span className="font-mono text-sm font-semibold text-slate-200">💎 {formatAmount(breakdown.calls)}</span>
                </div>
                <div className="bg-[#090a0f] p-3.5 rounded-2xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block mb-1">Arrangements</span>
                  <span className="font-mono text-sm font-semibold text-slate-200">💎 {formatAmount(breakdown.service_charges)}</span>
                </div>
                <div className="bg-[#090a0f] p-3.5 rounded-2xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block mb-1">Gifts</span>
                  <span className="font-mono text-sm font-semibold text-slate-200">💎 {formatAmount(breakdown.gifts)}</span>
                </div>
                <div className="bg-[#090a0f] p-3.5 rounded-2xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block mb-1">Premium Media</span>
                  <span className="font-mono text-sm font-semibold text-slate-200">💎 {formatAmount(breakdown.paid_media)}</span>
                </div>
                <div className="bg-[#090a0f] p-3.5 rounded-2xl border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block mb-1">Spin Earnings</span>
                  <span className="font-mono text-sm font-semibold text-slate-200">💎 {formatAmount(breakdown.spin_wheel)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Info Column */}
          <div className="bg-[#12151e] border border-slate-800/90 rounded-3xl p-6 sm:p-8 h-fit shadow-xl flex flex-col justify-between gap-6">
            <div>
              <h3 className="text-base font-bold text-white mb-2">Payout Destination</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Payouts are automatically wired to your registered payment channel.
              </p>
              <div className="bg-[#090a0f] p-4 rounded-2xl border border-slate-800/80 text-xs">
                <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold block mb-1">Current Method</span>
                <span className="font-semibold text-slate-200 break-all">
                  {activeRequest ? formatPayoutDestination(activeRequest) : formatPayoutDestination(latestHistory)}
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate('/adult/provider/profile?tab=payment')}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-amber-400 font-semibold rounded-2xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5"
            >
              <span>Manage Payout Settings</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* 3. PAYOUT HISTORY */}
        <div className="bg-[#12151e] border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base sm:text-lg font-bold text-white">Payout History</h3>
            <span className="text-xs text-slate-400">{history.length} record{history.length !== 1 ? 's' : ''}</span>
          </div>

          {history.length > 0 ? (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Naira Value</th>
                      <th className="py-3 px-4">Destination</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-800/50">
                    {history.map((h) => (
                      <tr key={h._id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-3.5 px-4 text-slate-300 font-medium">{formatDate(h.requestedAt)}</td>
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-400">💎 {formatAmount(h.amount)}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-300">₦{h.amountNaira?.toLocaleString('en-NG')}</td>
                        <td className="py-3.5 px-4 text-slate-300 break-all">{formatPayoutDestination(h)}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            h.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : h.status === 'rejected'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {h.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Transaction Cards */}
              <div className="md:hidden space-y-3">
                {history.map((h) => (
                  <div key={h._id} className="bg-[#090a0f] border border-slate-800/80 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{formatDate(h.requestedAt)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        h.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : h.status === 'rejected'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {h.status}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-lg font-bold text-amber-400 font-mono">💎 {formatAmount(h.amount)}</span>
                      <span className="text-sm font-semibold text-slate-200 font-mono">₦{h.amountNaira?.toLocaleString('en-NG')}</span>
                    </div>
                    <div className="text-xs text-slate-400 pt-1 border-t border-slate-800/60 break-all">
                      <span className="text-slate-500">Destination: </span>
                      {formatPayoutDestination(h)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-slate-500 text-xs">
              No previous payout history found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProviderPayout;
