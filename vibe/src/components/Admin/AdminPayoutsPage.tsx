import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import styles from "./Admin.module.css";
import { API_BASE_URL } from "../../config";
import { formatAmount } from "../../lib/pricing";

interface Payout {
  _id: string;
  providerId: string;
  providerName: string;
  amount: number;
  amountNaira: number;
  nairaRateSnapshot: number;
  status: 'pending' | 'queued' | 'verifying' | 'processing' | 'completed' | 'rejected';
  payoutMethod: string;
  payoutDetails: {
    bankName?: string;
    accountHolder?: string;
    accountNumber?: string;
    sortCode?: string;
    accountType?: string;
    paypalEmail?: string;
    cryptoCurrency?: string;
    cryptoAddress?: string;
  };
  requestedAt: string;
  adminReference?: string;
  rejectedReason?: string;
}

interface Dispute {
  _id: string;
  reporter: string;
  reported: string;
  providerName: string;
  memberName: string;
  reason: string;
  details?: string;
  amountInDispute: number;
  providerAmountHeld: number;
  status: 'pending' | 'resolved' | 'dismissed' | 'open';
  createdAt: string;
}

export const AdminPayoutsPage: React.FC = () => {
  const navigate = useNavigate();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [counts, setCounts] = useState({
    queued: 0,
    verifying: 0,
    processing: 0,
    completed: 0,
    rejected: 0,
    disputes: 0,
  });

  const [activeTab, setActiveTab] = useState<'queued' | 'verifying' | 'processing' | 'completed' | 'rejected' | 'disputes'>('queued');
  const [loading, setLoading] = useState(true);

  // Modals / Action Prompts
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [completeRef, setCompleteRef] = useState("");

  const [showResolveDisputeModal, setShowResolveDisputeModal] = useState(false);
  const [disputeIdToResolve, setDisputeIdToResolve] = useState<string | null>(null);
  const [disputeResolution, setDisputeResolution] = useState<'upheld' | 'dismissed'>('upheld');
  const [disputeNotes, setDisputeNotes] = useState("");

  const fetchPayoutsAndDisputes = async () => {
    try {
      const token = localStorage.getItem("adminToken");

      // Fetch payouts with the activeTab status (unless it's 'disputes')
      let url = `${API_BASE_URL}/admin/payouts?limit=50`;
      if (activeTab !== 'disputes') {
        url += `&status=${activeTab}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setPayouts(data.requests || []);
        if (data.counts) {
          setCounts(prev => ({
            ...prev,
            queued: data.counts.queued || 0,
            verifying: data.counts.verifying || 0,
            processing: data.counts.processing || 0,
            completed: data.counts.completed || 0,
            rejected: data.counts.rejected || 0,
          }));
        }
      }

      // Always fetch disputes to keep tab counts fresh
      const disputesRes = await fetch(`${API_BASE_URL}/admin/disputes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const disputesData = await disputesRes.json();
      if (disputesData.success) {
        setDisputes(disputesData.disputes || []);
        const openDisputes = (disputesData.disputes || []).filter((d: any) => d.status === 'open');
        setCounts(prev => ({
          ...prev,
          disputes: openDisputes.length,
        }));
      }

    } catch (err) {
      console.error(err);
      toast.error("Failed to load payout details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (localStorage.getItem("isAdminAuthenticated") !== "true") {
      navigate("/admin/login");
      return;
    }
    fetchPayoutsAndDisputes();
  }, [activeTab]);

  const handleVerify = async (requestId: string) => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/payouts/${requestId}/verify`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Payout verified!");
        setActiveTab("verifying");
      } else {
        toast.error(data.message || "Failed to verify payout");
      }
    } catch (err) {
      toast.error("Network error occurred");
    }
  };

  const handleProcess = async (requestId: string) => {
    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/payouts/${requestId}/process`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Payout is now processing!");
        setActiveTab("processing");
      } else {
        toast.error(data.message || "Failed to process payout");
      }
    } catch (err) {
      toast.error("Network error occurred");
    }
  };

  const triggerCompletePrompt = (requestId: string) => {
    setCompleteId(requestId);
    setCompleteRef("");
    setShowCompleteModal(true);
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeId) return;

    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/payouts/${completeId}/complete`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reference: completeRef })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Payout completed successfully!");
        setShowCompleteModal(false);
        setActiveTab("completed");
      } else {
        toast.error(data.message || "Failed to complete payout");
      }
    } catch (err) {
      toast.error("Network error occurred");
    }
  };

  const triggerRejectPrompt = (requestId: string) => {
    setRejectId(requestId);
    setRejectReason("");
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectId || !rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }

    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/payouts/${rejectId}/reject`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ reason: rejectReason })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Payout rejected and returned to eligible balance");
        setShowRejectModal(false);
        setActiveTab("rejected");
      } else {
        toast.error(data.message || "Failed to reject payout");
      }
    } catch (err) {
      toast.error("Network error occurred");
    }
  };

  const triggerResolveDisputePrompt = (reportId: string, resolution: 'upheld' | 'dismissed') => {
    setDisputeIdToResolve(reportId);
    setDisputeResolution(resolution);
    setDisputeNotes("");
    setShowResolveDisputeModal(true);
  };

  const handleResolveDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeIdToResolve) return;

    try {
      const token = localStorage.getItem("adminToken");
      const res = await fetch(`${API_BASE_URL}/admin/disputes/${disputeIdToResolve}/resolve`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          resolution: disputeResolution,
          adminNotes: disputeNotes,
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Dispute resolved as ${disputeResolution.toUpperCase()} successfully!`);
        setShowResolveDisputeModal(false);
        fetchPayoutsAndDisputes();
      } else {
        toast.error(data.message || "Failed to resolve dispute");
      }
    } catch (err) {
      toast.error("Network error occurred");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAdminAuthenticated");
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  if (loading) return <div className={styles.dashboardContainer}>Loading payouts and disputes data...</div>;

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <div className="flex items-center gap-4">
          <Link to="/admin" className="text-sm bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg transition-colors">
            ← Main Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-serif">Payout & Dispute Processing 💎</h1>
        </div>
        <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
      </header>

      {/* Tabs list with counts */}
      <div className="flex border-b border-neutral-800 gap-2 overflow-x-auto pb-1 mb-8 no-scrollbar">
        <button
          onClick={() => setActiveTab("queued")}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
            activeTab === 'queued'
              ? 'border-red-500 text-red-500'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Pending ({counts.queued})
        </button>
        <button
          onClick={() => setActiveTab("verifying")}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
            activeTab === 'verifying'
              ? 'border-amber-500 text-amber-500'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Verifying ({counts.verifying})
        </button>
        <button
          onClick={() => setActiveTab("processing")}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
            activeTab === 'processing'
              ? 'border-indigo-500 text-indigo-500'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Processing ({counts.processing})
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
            activeTab === 'completed'
              ? 'border-green-500 text-green-500'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Completed ({counts.completed})
        </button>
        <button
          onClick={() => setActiveTab("rejected")}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
            activeTab === 'rejected'
              ? 'border-purple-500 text-purple-500'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Rejected ({counts.rejected})
        </button>
        <button
          onClick={() => setActiveTab("disputes")}
          className={`px-5 py-3 text-xs uppercase tracking-wider font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
            activeTab === 'disputes'
              ? 'border-pink-500 text-pink-500'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Disputes ({counts.disputes})
        </button>
      </div>

      {activeTab !== 'disputes' ? (
        /* ======================================================== */
        /* PAYOUTS TAB                                               */
        /* ======================================================== */
        <div className={styles.section}>
          <h2 className="text-lg font-bold mb-4 capitalize">{activeTab} Payout Requests</h2>
          <div className={styles.tableContainer}>
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Amount (Diamonds)</th>
                  <th>Naira Amount</th>
                  <th>Payout Method & Details</th>
                  <th>Requested At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p._id}>
                    <td className="font-bold text-white">{p.providerName}</td>
                    <td className="text-yellow-400 font-mono font-bold">💎 {formatAmount(p.amount)}</td>
                    <td className="text-green-400 font-mono font-bold">₦{p.amountNaira.toLocaleString('en-NG')}</td>
                    <td className="text-xs max-w-xs">
                      <span className="bg-neutral-800 text-zinc-300 font-bold px-2 py-0.5 rounded text-[10px] uppercase block w-max mb-1">
                        {p.payoutMethod}
                      </span>
                      {p.payoutMethod === 'bank' && p.payoutDetails && (
                        <div className="text-zinc-400 space-y-0.5 leading-tight">
                          <p><strong>Bank:</strong> {p.payoutDetails.bankName}</p>
                          <p><strong>Holder:</strong> {p.payoutDetails.accountHolder}</p>
                          <p><strong>No:</strong> {p.payoutDetails.accountNumber}</p>
                          <p><strong>Sort:</strong> {p.payoutDetails.sortCode || 'N/A'}</p>
                        </div>
                      )}
                      {p.payoutMethod === 'paypal' && p.payoutDetails && (
                        <p className="text-zinc-400"><strong>Email:</strong> {p.payoutDetails.paypalEmail}</p>
                      )}
                      {p.payoutMethod === 'crypto' && p.payoutDetails && (
                        <div className="text-zinc-400 text-[10px] break-all">
                          <p><strong>Coin:</strong> {p.payoutDetails.cryptoCurrency}</p>
                          <p><strong>Addr:</strong> {p.payoutDetails.cryptoAddress}</p>
                        </div>
                      )}
                    </td>
                    <td className="text-xs text-zinc-500 font-mono">
                      {new Date(p.requestedAt).toLocaleString()}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {p.status === 'queued' && (
                          <button
                            onClick={() => handleVerify(p._id)}
                            className="bg-amber-600 hover:bg-amber-700 text-black text-xs font-bold px-3 py-1.5 rounded uppercase tracking-wider"
                          >
                            Verify
                          </button>
                        )}
                        {p.status === 'verifying' && (
                          <button
                            onClick={() => handleProcess(p._id)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded uppercase tracking-wider"
                          >
                            Process
                          </button>
                        )}
                        {p.status === 'processing' && (
                          <button
                            onClick={() => triggerCompletePrompt(p._id)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded uppercase tracking-wider"
                          >
                            Complete
                          </button>
                        )}
                        {['queued', 'verifying', 'processing'].includes(p.status) && (
                          <button
                            onClick={() => triggerRejectPrompt(p._id)}
                            className="bg-red-900 hover:bg-red-800 text-white text-xs font-bold px-3 py-1.5 rounded uppercase tracking-wider"
                          >
                            Reject
                          </button>
                        )}
                        {p.status === 'completed' && (
                          <span className="text-green-500 text-xs font-bold">
                            Ref: {p.adminReference || 'Completed'}
                          </span>
                        )}
                        {p.status === 'rejected' && (
                          <span className="text-red-500 text-xs block max-w-[120px] truncate" title={p.rejectedReason}>
                            Reason: {p.rejectedReason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-xs text-zinc-500 italic py-8">
                      No payout requests found in this status.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ======================================================== */
        /* DISPUTES TAB                                              */
        /* ======================================================== */
        <div className={styles.section}>
          <h2 className="text-lg font-bold mb-6">Open Service Disputes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {disputes.map((dispute) => (
              <div
                key={dispute._id}
                className={`relative bg-neutral-900 border p-5 rounded-2xl flex flex-col justify-between transition-all ${
                  dispute.status === 'open' ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.05)]' : 'border-neutral-800 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
                      dispute.status === 'open' ? 'bg-red-950/40 text-red-500 border border-red-500/20' : 'bg-green-950/40 text-green-500 border border-green-500/20'
                    }`}>
                      {dispute.status.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(dispute.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4 bg-neutral-950/40 p-3 rounded-xl border border-neutral-800/40">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Provider</p>
                      <p className="font-bold text-white text-xs">{dispute.providerName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Member</p>
                      <p className="font-bold text-white text-xs">{dispute.memberName}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Amount in Dispute</p>
                      <p className="font-mono font-bold text-yellow-400 text-sm">💎 {formatAmount(dispute.amountInDispute)}</p>
                      <p className="text-[10px] text-zinc-500">₦{(dispute.amountInDispute * 100).toLocaleString('en-NG')}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Provider share held</p>
                      <p className="font-mono font-bold text-amber-500 text-sm">💎 {formatAmount(dispute.providerAmountHeld)}</p>
                    </div>
                  </div>

                  <div className="bg-neutral-950/80 p-3 rounded-xl mb-4 text-xs leading-relaxed border border-neutral-800">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 font-bold">Dispute Reason:</p>
                    <p className="text-zinc-300 font-serif italic mb-2">"{dispute.reason}"</p>
                    {dispute.details && (
                      <>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 font-bold">Additional details:</p>
                        <p className="text-zinc-400">{dispute.details}</p>
                      </>
                    )}
                  </div>
                </div>

                {dispute.status === 'open' && (
                  <div className="flex gap-3 mt-4 border-t border-neutral-800/40 pt-4 shrink-0">
                    <button
                      onClick={() => triggerResolveDisputePrompt(dispute._id, 'upheld')}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                    >
                      ✅ Uphold (Refund)
                    </button>
                    <button
                      onClick={() => triggerResolveDisputePrompt(dispute._id, 'dismissed')}
                      className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-neutral-700"
                    >
                      ✕ Dismiss (Release)
                    </button>
                  </div>
                )}
              </div>
            ))}
            {disputes.length === 0 && (
              <div className="col-span-full text-center text-xs text-zinc-500 italic py-8">
                No disputes found.
              </div>
            )}
          </div>
        </div>
      )}

      {/* REJECT PAYOUT MODAL */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[15000] flex items-center justify-center p-4">
          <form
            onSubmit={handleRejectSubmit}
            className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl text-left text-white"
          >
            <h3 className="text-lg font-bold mb-4 font-serif text-red-500">Reject Payout Request</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Reason for Rejection *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full h-24 bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-red-500 focus:outline-none resize-none text-sm"
                  placeholder="e.g. Invalid bank details or incorrect IBAN number"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase"
              >
                Reject Request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COMPLETE PAYOUT MODAL */}
      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[15000] flex items-center justify-center p-4">
          <form
            onSubmit={handleCompleteSubmit}
            className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl text-left text-white"
          >
            <h3 className="text-lg font-bold mb-4 font-serif text-green-500">Complete Payout Request</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Bank Reference / Tx Hash (Optional)</label>
                <input
                  type="text"
                  value={completeRef}
                  onChange={(e) => setCompleteRef(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-green-500 focus:outline-none text-sm"
                  placeholder="e.g. FT-991209381"
                />
                <p className="text-[10px] text-zinc-500 mt-1.5">
                  Confirming this payout will automatically deduct the corresponding credits from the provider's wallet balance.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase"
              >
                Confirm Paid
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RESOLVE DISPUTE MODAL */}
      {showResolveDisputeModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[15000] flex items-center justify-center p-4">
          <form
            onSubmit={handleResolveDisputeSubmit}
            className="w-full max-w-md bg-neutral-900 border border-neutral-800 p-6 rounded-2xl shadow-2xl text-left text-white"
          >
            <h3 className={`text-lg font-bold mb-4 font-serif ${disputeResolution === 'upheld' ? 'text-red-500' : 'text-green-500'}`}>
              Resolve Dispute as {disputeResolution.toUpperCase()}
            </h3>
            <div className="space-y-4">
              <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/60 mb-2">
                <p className="text-[11px] text-zinc-400 font-bold mb-1">Impact of your resolution:</p>
                <p className="text-xs text-zinc-300 leading-normal">
                  {disputeResolution === 'upheld'
                    ? 'The full service charge is refunded back to the member\'s wallet credits. The provider\'s held 85% share is forfeited and deducted.'
                    : 'The provider\'s held 85% share is released as eligible for payout immediately. The member is not refunded.'}
                </p>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Admin Notes / Explanation</label>
                <textarea
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  className="w-full h-24 bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-white focus:border-red-500 focus:outline-none resize-none text-sm"
                  placeholder="Provide notes or findings regarding your investigation"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowResolveDisputeModal(false)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-zinc-300 text-xs font-bold uppercase"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-5 py-2 rounded-lg text-white text-xs font-bold uppercase ${
                  disputeResolution === 'upheld' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                Resolve dispute
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminPayoutsPage;
