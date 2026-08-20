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
    color: '#a78bfa',  // purple
    step: 1,
  },
  verifying: {
    animation: verifyingAnimation,
    title: 'Admin Verifying Details',
    subtitle: (pos: number) =>
      `Position #${pos} — Our team is reviewing your payout details.`,
    color: '#c9a84c',  // gold
    step: 2,
  },
  processing: {
    animation: processingAnimation,
    title: 'Processing Payment',
    subtitle: () => 'Your payment is being sent. This usually takes a few minutes.',
    color: '#e8496a',  // rose
    step: 3,
  },
  completed: {
    animation: successAnimation,
    title: 'Payment Sent! 🎉',
    subtitle: () => 'Your earnings have been transferred to your payout account.',
    color: '#22c55e',  // green
    step: 4,
  },
  rejected: {
    animation: rejectedAnimation,
    title: 'Payout Rejected',
    subtitle: () => 'See reason below. Please fix the issue and re-apply.',
    color: '#ef4444',  // red
    step: 0,
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

  const formatPayoutDestination = (reqObj: any) => {
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
      <div className="flex h-screen items-center justify-center bg-[#0d040e]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  const activeConfig = activeRequest ? STATUS_CONFIG[activeRequest.status] : null;
  const currentStep = activeConfig ? activeConfig.step : 0;

  return (
    <div className="min-h-screen bg-[#0d040e] text-gray-100 p-6 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl italic font-serif font-bold text-amber-500 mb-8 tracking-wider">
          Payout Headquarters
        </h1>

        {/* 1. STATUS TRACKER / ACTIVE VIEW */}
        {activeRequest ? (
          <div className="bg-[#170a16] border border-amber-500/20 rounded-3xl p-8 mb-10 max-w-xl mx-auto shadow-2xl relative overflow-hidden">
            <div className="flex justify-center mb-6">
              <div className="w-48 h-48 flex items-center justify-center">
                {activeConfig && activeConfig.animation && (
                  <Lottie
                    animationData={activeConfig.animation}
                    loop={activeRequest.status !== 'completed' && activeRequest.status !== 'rejected'}
                    style={{ width: 180, height: 180 }}
                  />
                )}
              </div>
            </div>

            <h2 className="text-2xl font-bold font-serif text-center mb-2" style={{ color: activeConfig?.color || '#fff' }}>
              {activeConfig?.title}
            </h2>

            <p className="text-sm text-gray-400 text-center mb-8 max-w-sm mx-auto">
              {activeConfig?.subtitle(activeRequest.queuePosition)}
            </p>

            <div className="bg-[#0d040e]/60 border border-gray-800 rounded-2xl p-5 mb-8 text-left text-sm space-y-3">
              <div className="flex justify-between border-b border-gray-800/80 pb-2">
                <span className="text-gray-500">Amount</span>
                <span className="font-semibold text-amber-400 font-mono">💎 {formatAmount(activeRequest.amount)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800/80 pb-2">
                <span className="text-gray-500">Naira Value</span>
                <span className="font-semibold text-amber-400 font-mono">₦{activeRequest.amountNaira?.toLocaleString('en-NG')}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800/80 pb-2">
                <span className="text-gray-500">Payout Destination</span>
                <span className="font-semibold">{formatPayoutDestination(activeRequest)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Requested Date</span>
                <span className="font-semibold">{formatDate(activeRequest.requestedAt)}</span>
              </div>
            </div>

            {/* Stepper progress indicator */}
            {activeRequest.status !== 'rejected' && (
              <div className="flex items-center justify-between max-w-sm mx-auto mt-6">
                {steps.map((step, i) => {
                  const isDone = currentStep > i + 1;
                  const isActive = currentStep === i + 1;
                  const isPending = currentStep < i + 1;
                  return (
                    <React.Fragment key={step.key}>
                      <div className="flex flex-col items-center flex-1 relative">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isDone ? 'bg-green-500 text-white' : isActive ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(200,16,46,0.6)] animate-pulse' : 'bg-[#1b0a14] border border-gray-800 text-gray-500'}`}>
                          {isDone ? '✓' : step.icon}
                        </div>
                        <span className={`text-[10px] font-medium mt-1 ${isActive ? 'text-red-500 font-bold' : isPending ? 'text-gray-600' : 'text-green-500'}`}>
                          {step.label}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`h-0.5 flex-1 -mt-4 transition-colors ${isDone ? 'bg-green-500' : 'bg-gray-800'}`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            {/* Rejection Handling */}
            {activeRequest.status === 'rejected' && (
              <div className="mt-8 bg-red-950/20 border border-red-500/30 rounded-2xl p-5 text-center">
                <h4 className="text-red-500 font-bold text-lg mb-2">Rejection Reason:</h4>
                <p className="text-sm text-gray-300 mb-6">{activeRequest.rejectedReason || 'No reason provided.'}</p>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      navigate('/adult/provider/profile?tab=payment');
                    }}
                    className="block w-full py-3 bg-[#1b0a14] hover:bg-[#2b1020] border border-gray-800 text-amber-500 font-semibold rounded-xl text-sm transition-all"
                  >
                    Update Payout Settings →
                  </button>
                  <button
                    onClick={handleRequestPayout}
                    disabled={isSubmitting}
                    className="block w-full py-3 bg-amber-500 hover:bg-amber-600 text-[#0d040e] font-bold rounded-xl text-sm transition-all disabled:opacity-50"
                  >
                    Submit New Request
                  </button>
                </div>
              </div>
            )}

            {/* Completed */}
            {activeRequest.status === 'completed' && (
              <div className="mt-6 p-4 bg-green-950/20 border border-green-500/30 rounded-xl text-center">
                <p className="text-green-400 font-semibold text-sm">✅ Transfer complete. Check your payout account.</p>
                {activeRequest.adminReference && (
                  <p className="text-xs text-gray-500 mt-2 font-mono">Reference: {activeRequest.adminReference}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          /* 2. NO REQUEST ACTIVE - ELIGIBLE VIEW */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-[#170a16] border border-amber-500/20 rounded-3xl p-8 shadow-xl">
                <div className="text-center md:text-left mb-6">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Available for Payout</span>
                  <div className="text-4xl md:text-5xl font-extrabold text-amber-400 font-mono mt-1 mb-2">
                    💎 {formatAmount(eligibleAmount)}
                  </div>
                  <div className="text-xl md:text-2xl font-semibold text-gray-300">
                    ₦{eligibleNaira.toLocaleString('en-NG')}
                  </div>
                </div>

                <div className="bg-[#0d040e]/80 border border-gray-800/80 rounded-2xl p-5 mb-8 space-y-3 text-sm">
                  <p className="font-semibold text-amber-500 mb-2">Earnings available for payout after:</p>
                  <ul className="space-y-2 text-gray-400 text-xs">
                    <li className="flex items-center">
                      <span className="text-green-500 mr-2">✓</span> Service confirmed by the member
                    </li>
                    <li className="flex items-center">
                      <span className="text-green-500 mr-2">✓</span> Or 72 hours after arrangement payment (auto-confirmed)
                    </li>
                    <li className="flex items-center">
                      <span className="text-green-500 mr-2">✓</span> Calls successfully completed and not disputed
                    </li>
                  </ul>
                </div>

                <button
                  onClick={handleRequestPayout}
                  disabled={eligibleAmount < 500 || isSubmitting}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-800 disabled:text-gray-500 text-[#0d040e] font-bold rounded-2xl text-base tracking-wide transition-all shadow-lg"
                >
                  {isSubmitting
                    ? 'Queueing Payout...'
                    : eligibleAmount < 500
                    ? 'Minimum Payout Threshold: 💎 500 (₦50,000)'
                    : `Request Payout — 💎 ${formatAmount(eligibleAmount)}`}
                </button>

                <p className="text-[11px] text-gray-500 text-center mt-4">
                  Payouts are processed manually by our team every Friday. Processing typically takes 1–3 business days.
                </p>
              </div>

              {/* Breakdown */}
              <div className="bg-[#170a16] border border-amber-500/20 rounded-3xl p-8 shadow-xl">
                <h3 className="text-lg font-serif font-bold text-amber-500 mb-6">Earnings Breakdown</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#0d040e]/50 p-4 rounded-xl border border-gray-800">
                    <span className="text-xs text-gray-500 block">Tips & Cams</span>
                    <span className="font-mono text-sm text-gray-300">💎 {formatAmount(breakdown.tips)}</span>
                  </div>
                  <div className="bg-[#0d040e]/50 p-4 rounded-xl border border-gray-800">
                    <span className="text-xs text-gray-500 block">Calls</span>
                    <span className="font-mono text-sm text-gray-300">💎 {formatAmount(breakdown.calls)}</span>
                  </div>
                  <div className="bg-[#0d040e]/50 p-4 rounded-xl border border-gray-800">
                    <span className="text-xs text-gray-500 block">Arrangements</span>
                    <span className="font-mono text-sm text-gray-300">💎 {formatAmount(breakdown.service_charges)}</span>
                  </div>
                  <div className="bg-[#0d040e]/50 p-4 rounded-xl border border-gray-800">
                    <span className="text-xs text-gray-500 block">Gifts</span>
                    <span className="font-mono text-sm text-gray-300">💎 {formatAmount(breakdown.gifts)}</span>
                  </div>
                  <div className="bg-[#0d040e]/50 p-4 rounded-xl border border-gray-800">
                    <span className="text-xs text-gray-500 block">Premium Media</span>
                    <span className="font-mono text-sm text-gray-300">💎 {formatAmount(breakdown.paid_media)}</span>
                  </div>
                  <div className="bg-[#0d040e]/50 p-4 rounded-xl border border-gray-800">
                    <span className="text-xs text-gray-500 block">Spin Earnings</span>
                    <span className="font-mono text-sm text-gray-300">💎 {formatAmount(breakdown.spin_wheel)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar / Info column */}
            <div className="bg-[#170a16] border border-amber-500/20 rounded-3xl p-8 h-fit shadow-xl">
              <h3 className="text-lg font-serif font-bold text-amber-500 mb-4">Payout Account</h3>
              <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                Your payments will be sent to the payout coordinates configured during onboarding or settings.
              </p>
              <button
                onClick={() => {
                  navigate('/adult/provider/profile?tab=payment');
                }}
                className="w-full py-3 bg-[#1b0a14] hover:bg-[#2b1020] border border-gray-800 text-amber-500 font-semibold rounded-xl text-xs transition-all"
              >
                Manage Payout Settings →
              </button>
            </div>
          </div>
        )}

        {/* 3. HISTORY TABLE */}
        <div className="mt-12 bg-[#170a16] border border-amber-500/20 rounded-3xl p-8 shadow-xl">
          <h3 className="text-xl font-serif font-bold text-amber-500 mb-6">Payout History</h3>
          {history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase font-semibold">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Naira Value</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-800/50">
                  {history.map((h) => (
                    <tr key={h._id} className="hover:bg-[#1b0a14]/40 transition-colors">
                      <td className="py-4 px-4 text-gray-300 font-medium">{formatDate(h.requestedAt)}</td>
                      <td className="py-4 px-4 font-mono font-semibold text-amber-400">💎 {formatAmount(h.amount)}</td>
                      <td className="py-4 px-4 font-mono text-gray-300">₦{h.amountNaira?.toLocaleString('en-NG')}</td>
                      <td className="py-4 px-4 text-gray-400">{formatPayoutDestination(h)}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${h.status === 'completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : h.status === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                          {h.status?.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500 text-sm">
              No past payout requests found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProviderPayout;
