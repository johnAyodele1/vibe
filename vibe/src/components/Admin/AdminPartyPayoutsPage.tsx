import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import styles from './Admin.module.css';
import { API_BASE_URL } from '../../config';

type PartyPayoutStatus = 'requested' | 'verifying' | 'processing' | 'paid' | 'rejected' | 'failed';

type PartyPayout = {
  _id: string;
  organizerId:
    | string
    | {
        displayName?: string;
        username?: string;
        email?: string;
      };
  partyIds?: Array<{ _id: string; title?: string }>;
  ticketOrderIds?: string[];
  amountNaira: number;
  payoutDetails: {
    bankName: string;
    accountHolder: string;
    accountNumber: string;
  };
  status: PartyPayoutStatus;
  adminNotes?: string;
  adminReference?: string;
  requestedAt: string;
  verifiedAt?: string;
  processingAt?: string;
  processedAt?: string;
  rejectedAt?: string;
};

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value);

const TABS: Array<{ value: PartyPayoutStatus; label: string }> = [
  { value: 'requested', label: 'Requested' },
  { value: 'verifying', label: 'Verifying' },
  { value: 'processing', label: 'Processing' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'failed', label: 'Failed' },
];

const getOrganizerName = (organizer: PartyPayout['organizerId']) => {
  if (typeof organizer === 'string') return organizer.slice(-8);
  return organizer.displayName || organizer.username || organizer.email || 'Unknown host';
};

export const AdminPartyPayoutsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PartyPayoutStatus>('requested');
  const [requests, setRequests] = useState<PartyPayout[]>([]);
  const [counts, setCounts] = useState<Record<PartyPayoutStatus, number>>({
    requested: 0,
    verifying: 0,
    processing: 0,
    paid: 0,
    rejected: 0,
    failed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState<PartyPayout | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [completing, setCompleting] = useState<PartyPayout | null>(null);
  const [completeReference, setCompleteReference] = useState('');
  const [completeNotes, setCompleteNotes] = useState('');
  const [failing, setFailing] = useState<PartyPayout | null>(null);
  const [failReason, setFailReason] = useState('');
  const [revealedAccountIds, setRevealedAccountIds] = useState<Record<string, boolean>>({});

  const fetchRequests = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(
        `${API_BASE_URL}/admin/party-payouts?status=${activeTab}&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load party payouts');
      }

      setRequests(data.requests || []);
      setCounts({
        requested: data.counts?.requested || 0,
        verifying: data.counts?.verifying || 0,
        processing: data.counts?.processing || 0,
        paid: data.counts?.paid || 0,
        rejected: data.counts?.rejected || 0,
        failed: data.counts?.failed || 0,
      });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load party payouts');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (localStorage.getItem('isAdminAuthenticated') !== 'true') {
      navigate('/admin/login');
      return;
    }

    void fetchRequests();
  }, [fetchRequests, navigate]);

  const runAction = async (
    request: PartyPayout,
    action: 'verify' | 'process',
  ) => {
    const key = `${action}_${request._id}`;
    if (processingIds[key]) return;

    setProcessingIds((current) => ({ ...current, [key]: true }));

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(
        `${API_BASE_URL}/admin/party-payouts/${request._id}/${action}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || `Failed to ${action} payout`);
      }

      toast.success(action === 'verify' ? 'Party payout verified.' : 'Party payout is now processing.');
      await fetchRequests();
      setActiveTab(action === 'verify' ? 'verifying' : 'processing');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to update payout');
    } finally {
      setProcessingIds((current) => ({ ...current, [key]: false }));
    }
  };

  const submitReject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rejecting || !rejectReason.trim()) return;

    const key = `reject_${rejecting._id}`;
    setProcessingIds((current) => ({ ...current, [key]: true }));

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(
        `${API_BASE_URL}/admin/party-payouts/${rejecting._id}/reject`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        }
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reject payout');
      }

      toast.success('Party payout rejected and earnings released.');
      setRejecting(null);
      setRejectReason('');
      await fetchRequests();
    } catch (error: any) {
      toast.error(error?.message || 'Unable to reject payout');
    } finally {
      setProcessingIds((current) => ({ ...current, [key]: false }));
    }
  };

  const submitComplete = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!completing) return;

    const key = `complete_${completing._id}`;
    setProcessingIds((current) => ({ ...current, [key]: true }));

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(
        `${API_BASE_URL}/admin/party-payouts/${completing._id}/complete`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reference: completeReference.trim(),
            notes: completeNotes.trim(),
          }),
        }
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete payout');
      }

      toast.success('Party payout marked as paid.');
      setCompleting(null);
      setCompleteReference('');
      setCompleteNotes('');
      await fetchRequests();
      setActiveTab('paid');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to complete payout');
    } finally {
      setProcessingIds((current) => ({ ...current, [key]: false }));
    }
  };

  const submitFail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!failing || !failReason.trim()) return;

    const key = `fail_${failing._id}`;
    setProcessingIds((current) => ({ ...current, [key]: true }));

    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(
        `${API_BASE_URL}/admin/party-payouts/${failing._id}/fail`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: failReason.trim() }),
        }
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to release payout');
      }

      toast.success('Payout failed and earnings released.');
      setFailing(null);
      setFailReason('');
      await fetchRequests();
      setActiveTab('failed');
    } catch (error: any) {
      toast.error(error?.message || 'Unable to release payout');
    } finally {
      setProcessingIds((current) => ({ ...current, [key]: false }));
    }
  };

  const toggleAccountVisibility = (requestId: string) => {
    setRevealedAccountIds((current) => ({
      ...current,
      [requestId]: !current[requestId],
    }));
  };

  return (
    <div className={styles.dashboardContainer}>
      <div className="mb-6 flex flex-col gap-4 border-b border-neutral-800 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Host earnings</p>
          <h1 className="mt-1 font-serif text-3xl italic text-white">Party Payouts</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Review host bank details, release approved payout requests, and keep a clear payout trail.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs font-bold text-zinc-300 transition hover:border-neutral-700 hover:text-white"
        >
          ← Admin dashboard
        </button>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition ${
              activeTab === tab.value
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                : 'border-neutral-800 bg-neutral-900 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            <span className="ml-2 rounded-full bg-neutral-950 px-1.5 py-0.5 font-mono text-[9px]">
              {counts[tab.value]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-64 animate-pulse rounded-2xl border border-neutral-900 bg-neutral-950" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-6 py-16 text-center">
          <p className="text-sm italic text-zinc-500">No party payout requests in this status.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {requests.map((request) => {
            const organizerName = getOrganizerName(request.organizerId);
            const partyTitles = (request.partyIds || [])
              .map((party) => party.title)
              .filter(Boolean);

            return (
              <article
                key={request._id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{organizerName}</p>
                    <p className="mt-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      {request._id.slice(-10)}
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-400">
                    {request.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500">Amount</p>
                    <p className="mt-1 font-mono text-xl font-bold text-emerald-400">{money(request.amountNaira)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500">Requested</p>
                    <p className="mt-1 text-xs text-zinc-300">{new Date(request.requestedAt).toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-neutral-800 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Bank details</p>
                    <p className="mt-2 text-xs font-bold text-white">{request.payoutDetails.bankName}</p>
                    <p className="mt-1 text-xs text-zinc-300">{request.payoutDetails.accountHolder}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="font-mono text-sm tracking-wider text-amber-300">
                        {revealedAccountIds[request._id]
                          ? request.payoutDetails.accountNumber
                          : `••••••${request.payoutDetails.accountNumber.slice(-4)}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleAccountVisibility(request._id)}
                        className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                      >
                        {revealedAccountIds[request._id] ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-800 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Included parties</p>
                    {partyTitles.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {partyTitles.slice(0, 4).map((title) => (
                          <p key={title} className="truncate text-xs text-zinc-300">{title}</p>
                        ))}
                        {partyTitles.length > 4 && (
                          <p className="text-[10px] text-zinc-500">+{partyTitles.length - 4} more</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-500">Legacy or unavailable party metadata</p>
                    )}
                  </div>
                </div>

                {request.adminNotes && (
                  <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Admin notes</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-300">{request.adminNotes}</p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-800 pt-4">
                  {request.status === 'requested' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void runAction(request, 'verify')}
                        disabled={!!processingIds[`verify_${request._id}`]}
                        className="flex-1 rounded-xl bg-amber-500 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-black disabled:opacity-50"
                      >
                        {processingIds[`verify_${request._id}`] ? 'Verifying...' : 'Verify'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejecting(request)}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-red-400"
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {request.status === 'verifying' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void runAction(request, 'process')}
                        disabled={!!processingIds[`process_${request._id}`]}
                        className="flex-1 rounded-xl bg-indigo-500 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
                      >
                        {processingIds[`process_${request._id}`] ? 'Starting...' : 'Start processing'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejecting(request)}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-red-400"
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {request.status === 'processing' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCompleting(request)}
                        className="flex-1 rounded-xl bg-emerald-500 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-black"
                      >
                        Mark paid
                      </button>
                      <button
                        type="button"
                        onClick={() => setFailing(request)}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-red-400"
                      >
                        Fail & release
                      </button>
                    </>
                  )}

                  {request.status === 'paid' && request.adminReference && (
                    <p className="w-full text-xs text-zinc-500">
                      Reference: <span className="font-mono text-zinc-300">{request.adminReference}</span>
                    </p>
                  )}

                  {request.status === 'rejected' && (
                    <p className="w-full text-xs text-red-300">
                      Rejected: {request.adminNotes || 'No reason recorded'}
                    </p>
                  )}

                  {request.status === 'failed' && (
                    <p className="w-full text-xs text-red-300">
                      Failed: {request.adminNotes || 'No reason recorded'}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/80 p-4">
          <form
            onSubmit={submitReject}
            className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-white shadow-2xl"
          >
            <h2 className="text-lg font-bold text-red-400">Reject party payout</h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Rejecting releases the ticket earnings back to the host's available balance.
            </p>

            <label className="mt-5 block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Reason
              </span>
              <textarea
                required
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                className="h-24 w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm outline-none focus:border-red-500"
                placeholder="e.g. Account holder name does not match"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded-xl bg-neutral-800 px-4 py-2 text-xs font-bold text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!!processingIds[`reject_${rejecting._id}`]}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {processingIds[`reject_${rejecting._id}`] ? 'Rejecting...' : 'Reject payout'}
              </button>
            </div>
          </form>
        </div>
      )}

      {completing && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/80 p-4">
          <form
            onSubmit={submitComplete}
            className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-white shadow-2xl"
          >
            <h2 className="text-lg font-bold text-emerald-400">Mark payout as paid</h2>
            <p className="mt-2 text-xs text-zinc-500">
              Confirm the transfer was actually sent before closing this request.
            </p>

            <label className="mt-5 block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Transfer reference
              </span>
              <input
                value={completeReference}
                onChange={(event) => setCompleteReference(event.target.value)}
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm outline-none focus:border-emerald-500"
                placeholder="e.g. bank transfer reference"
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Notes
              </span>
              <textarea
                value={completeNotes}
                onChange={(event) => setCompleteNotes(event.target.value)}
                className="h-20 w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm outline-none focus:border-emerald-500"
                placeholder="Optional audit note"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompleting(null)}
                className="rounded-xl bg-neutral-800 px-4 py-2 text-xs font-bold text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!!processingIds[`complete_${completing._id}`]}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-black disabled:opacity-50"
              >
                {processingIds[`complete_${completing._id}`] ? 'Saving...' : 'Confirm paid'}
              </button>
            </div>
          </form>
        </div>
      )}

      {failing && (
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/80 p-4">
          <form
            onSubmit={submitFail}
            className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-white shadow-2xl"
          >
            <h2 className="text-lg font-bold text-red-400">Fail party payout</h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              This marks the bank transfer as failed and releases the claimed ticket earnings so the host can request again.
            </p>

            <label className="mt-5 block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Failure reason
              </span>
              <textarea
                required
                value={failReason}
                onChange={(event) => setFailReason(event.target.value)}
                className="h-24 w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm outline-none focus:border-red-500"
                placeholder="e.g. Bank transfer failed"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFailing(null)}
                className="rounded-xl bg-neutral-800 px-4 py-2 text-xs font-bold text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!!processingIds[`fail_${failing._id}`]}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {processingIds[`fail_${failing._id}`] ? 'Releasing...' : 'Fail & release earnings'}
              </button>
            </div>
          </form>
        </div>
      )}

      )}
    </div>
  );
};

export default AdminPartyPayoutsPage;
