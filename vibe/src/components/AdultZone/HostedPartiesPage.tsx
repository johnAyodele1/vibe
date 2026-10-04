import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { V1_API_BASE_URL } from '../../config';
import { toast } from 'sonner';

type Party = {
  _id: string;
  title: string;
  coverImage: string;
  startDate: string;
  endDate: string;
  venueName: string;
  venueAddress: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'cancelled' | 'completed';
  stats: {
    ticketsSold: number;
    grossSalesNaira: number;
    organizerPayoutNaira: number;
  };
  availablePayoutNaira: number;
  payout: {
    status: 'requested' | 'verifying' | 'processing' | 'paid' | 'rejected' | 'failed';
    amountNaira: number;
    requestedAt: string;
    processedAt?: string;
  } | null;
};

type PayoutSummary = {
  availableNaira: number;
  minimumNaira: number;
  canRequest: boolean;
  activePayout: {
    _id: string;
    amountNaira: number;
    status: 'requested' | 'verifying' | 'processing';
    requestedAt: string;
  } | null;
};

type PayoutForm = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
};

type PayoutHistoryItem = {
  _id: string;
  amountNaira: number;
  status: 'requested' | 'verifying' | 'processing' | 'paid' | 'rejected' | 'failed';
  requestedAt: string;
  processedAt?: string;
  reference: string | null;
  partyTitle: string;
};

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value);

const statusLabel: Record<Party['status'], string> = {
  draft: 'Draft',
  pending_review: 'Under review',
  approved: 'Live',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

export const HostedPartiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[]>([]);
  const [payoutSummary, setPayoutSummary] = useState<PayoutSummary>({
    availableNaira: 0,
    minimumNaira: 10_000,
    canRequest: false,
    activePayout: null,
  });
  const [loading, setLoading] = useState(true);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutForm, setPayoutForm] = useState<PayoutForm>({
    bankName: '',
    accountHolder: '',
    accountNumber: '',
  });
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [payoutHistory, setPayoutHistory] = useState<PayoutHistoryItem[]>([]);
  const [totalWithdrawnNaira, setTotalWithdrawnNaira] = useState(0);

  const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('token');

  const loadParties = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${V1_API_BASE_URL}/parties/hosted/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to load hosted parties');
      }

      setParties(Array.isArray(data.parties) ? data.parties : []);
      setPayoutSummary(
        data.payoutSummary || {
          availableNaira: 0,
          minimumNaira: 10_000,
          canRequest: false,
          activePayout: null,
        }
      );

      // History is informational. A temporary history failure should not hide
      // current ticket earnings or prevent a payout request.
      try {
        const historyRes = await fetch(`${V1_API_BASE_URL}/parties/hosted/payout/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const historyData = await historyRes.json();

        if (historyRes.ok && historyData.success) {
          setPayoutHistory(Array.isArray(historyData.history) ? historyData.history : []);
          setTotalWithdrawnNaira(Number(historyData.totalWithdrawnNaira) || 0);
        } else {
          console.error('Unable to load party payout history:', historyData.error);
        }
      } catch (historyError) {
        console.error('Unable to load party payout history:', historyError);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Unable to load hosted parties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadParties();
  }, []);

  const activeParties = useMemo(
    () => parties.filter((party) => new Date(party.endDate) >= new Date()),
    [parties]
  );

  const pastParties = useMemo(
    () => parties.filter((party) => new Date(party.endDate) < new Date()),
    [parties]
  );

  const submitPayout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) return;

    setSubmittingPayout(true);

    try {
      const res = await fetch(`${V1_API_BASE_URL}/parties/hosted/payout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payoutForm),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to submit payout request');
      }

      toast.success('Payout request submitted. Admin will process it.');
      setShowPayoutForm(false);
      setPayoutForm({ bankName: '', accountHolder: '', accountNumber: '' });
      await loadParties();
    } catch (error: any) {
      toast.error(error?.message || 'Unable to submit payout request');
    } finally {
      setSubmittingPayout(false);
    }
  };

  const PartyCard = ({ party }: { party: Party }) => {
    const ended = new Date(party.endDate) < new Date();

    return (
      <article className="overflow-hidden rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)]">
        <div className="relative aspect-[16/7] overflow-hidden bg-[#14090e]">
          <img src={party.coverImage} alt={party.title} className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-5 pt-14">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--az-accent-gold)]">
              {statusLabel[party.status]}
            </span>
            <h3 className="mt-1 font-serif text-2xl italic text-white">{party.title}</h3>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-3 divide-x divide-[var(--az-border)] rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-primary)]">
            <div className="p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">Tickets</p>
              <p className="mt-1 font-mono text-lg font-bold text-white">{party.stats.ticketsSold}</p>
            </div>
            <div className="p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">Sales</p>
              <p className="mt-1 font-mono text-sm font-bold text-white">{money(party.stats.grossSalesNaira)}</p>
            </div>
            <div className="p-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">Your earnings</p>
              <p className="mt-1 font-mono text-sm font-bold text-[var(--az-accent-gold)]">
                {money(party.stats.organizerPayoutNaira)}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-xs text-[var(--az-text-secondary)]">
            <p>🗓 {new Date(party.startDate).toLocaleString()}</p>
            <p>📍 {party.venueName} · {party.venueAddress}</p>
          </div>

          {party.availablePayoutNaira > 0 && (
            <div className="mt-4 rounded-2xl border border-[var(--az-accent-gold)]/20 bg-[var(--az-accent-gold)]/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">
                  Available from ticket sales
                </span>
                <span className="font-mono text-sm font-bold text-[var(--az-accent-gold)]">
                  {money(party.availablePayoutNaira)}
                </span>
              </div>
            </div>
          )}

          {party.payout && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-primary)] px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">
                Last payout
              </span>
              <span className="text-right text-[10px] font-bold uppercase tracking-widest text-[var(--az-accent-gold)]">
                {party.payout.status} · {money(party.payout.amountNaira)}
              </span>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate(`/guard?party=${party._id}`)}
              disabled={party.status !== 'approved' || ended}
              className="rounded-2xl border border-[var(--az-accent-gold)]/40 bg-[var(--az-bg-tertiary)] px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition hover:border-[var(--az-accent-gold)] hover:text-[var(--az-accent-gold)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              Scan tickets
            </button>
            <button
              onClick={() => navigate(`/parties/${party._id}`)}
              className="rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-tertiary)] px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition hover:border-white/20"
            >
              View party
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <header className="border-b border-[var(--az-border)] pb-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--az-accent-gold)]">
              Host workspace
            </p>
            <h1 className="mt-2 font-serif text-4xl italic text-white">Your parties</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--az-text-secondary)]">
              Manage events, track ticket sales, and cash out fulfilled ticket earnings whenever your available balance reaches ₦10,000. You do not have to wait for the party to end.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-stretch">
            <div className="min-w-0 flex-1 rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)] px-4 py-3 sm:min-w-[210px]">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--az-text-muted)]">
                Available to withdraw
              </p>
              <div className="mt-1 flex items-end justify-between gap-4">
                <p className="font-mono text-xl font-bold text-white">{money(payoutSummary.availableNaira)}</p>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">
                  Min. ₦10k
                </span>
              </div>
              <p className="mt-2 text-[10px] text-[var(--az-text-secondary)]">
                Includes fulfilled ticket sales from active and completed parties.
              </p>
              <p className="mt-1 text-[10px] text-[var(--az-text-secondary)]">
                Already withdrawn: <span className="font-mono font-bold text-white">{money(totalWithdrawnNaira)}</span>
              </p>
              {payoutSummary.activePayout && (
                <p className="mt-1 text-[10px] text-[var(--az-text-secondary)]">
                  Current request: {payoutSummary.activePayout.status}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowPayoutForm(true)}
              disabled={!payoutSummary.canRequest}
              className="rounded-2xl border border-[var(--az-accent-gold)] bg-[var(--az-accent-gold)] px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-[var(--az-border)] disabled:bg-[var(--az-bg-tertiary)] disabled:text-[var(--az-text-muted)]"
            >
              {payoutSummary.activePayout ? 'Payout processing' : 'Request payout'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/parties/create')}
              className="rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-tertiary)] px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition hover:border-white/20"
            >
              + Host a party
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div key={item} className="h-96 animate-pulse rounded-3xl bg-[var(--az-bg-secondary)]" />
          ))}
        </div>
      ) : parties.length === 0 ? (
        <div className="rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)] px-6 py-16 text-center">
          <p className="font-serif text-2xl italic text-white">You have not hosted a party yet.</p>
          <p className="mt-2 text-sm text-[var(--az-text-secondary)]">
            Create your first event and manage everything from this workspace.
          </p>
          <button
            onClick={() => navigate('/parties/create')}
            className="mt-6 rounded-full bg-[var(--az-accent-primary)] px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-white"
          >
            Create your first party
          </button>
        </div>
      ) : (
        <>
          {activeParties.length > 0 && (
            <section className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--az-text-muted)]">Hosting now</p>
                <h2 className="mt-1 font-serif text-2xl italic text-white">Upcoming & active</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {activeParties.map((party) => <PartyCard key={party._id} party={party} />)}
              </div>
            </section>
          )}

          {pastParties.length > 0 && (
            <section className="space-y-4">
              <div className="border-t border-[var(--az-border)] pt-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--az-text-muted)]">Your history</p>
                <h2 className="mt-1 font-serif text-2xl italic text-white">Past parties</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {pastParties.map((party) => <PartyCard key={party._id} party={party} />)}
              </div>
            </section>
          )}
        </>
      )}

      {payoutHistory.length > 0 && (
        <section className="space-y-4">
          <div className="border-t border-[var(--az-border)] pt-8">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--az-text-muted)]">
                  Money out
                </p>
                <h2 className="mt-1 font-serif text-2xl italic text-white">Cashout history</h2>
              </div>
              <p className="text-xs text-[var(--az-text-secondary)]">
                Total paid out: <span className="font-mono font-bold text-white">{money(totalWithdrawnNaira)}</span>
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)]">
              <div className="divide-y divide-[var(--az-border)]">
                {payoutHistory.map((payout) => (
                  <div key={payout._id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{payout.partyTitle}</p>
                      <p className="mt-1 text-[10px] text-[var(--az-text-muted)]">
                        Requested {new Date(payout.requestedAt).toLocaleString()}
                        {payout.reference ? ' · Ref: ' + payout.reference : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="font-mono text-sm font-bold text-[var(--az-accent-gold)]">
                        {money(payout.amountNaira)}
                      </p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">
                        {payout.status}
                        {payout.processedAt ? ' · ' + new Date(payout.processedAt).toLocaleDateString() : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {showPayoutForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-accent-gold)]">Party payout</p>
                <h2 className="mt-1 font-serif text-2xl italic text-white">Withdraw your earnings</h2>
                <p className="mt-2 text-xs leading-relaxed text-[var(--az-text-secondary)]">
                  You are requesting {money(payoutSummary.availableNaira)}. The full available balance will be included in this request.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPayoutForm(false)}
                className="shrink-0 text-2xl leading-none text-[var(--az-text-muted)] hover:text-white"
                aria-label="Close payout form"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitPayout} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">
                  Bank name
                </span>
                <input
                  required
                  value={payoutForm.bankName}
                  onChange={(event) => setPayoutForm((current) => ({ ...current, bankName: event.target.value }))}
                  autoComplete="organization"
                  className="w-full rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-primary)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--az-accent-gold)]"
                  placeholder="e.g. GTBank"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">
                  Account holder
                </span>
                <input
                  required
                  value={payoutForm.accountHolder}
                  onChange={(event) => setPayoutForm((current) => ({ ...current, accountHolder: event.target.value }))}
                  autoComplete="name"
                  className="w-full rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-primary)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--az-accent-gold)]"
                  placeholder="Name on the bank account"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">
                  Account number
                </span>
                <input
                  required
                  value={payoutForm.accountNumber}
                  onChange={(event) =>
                    setPayoutForm((current) => ({
                      ...current,
                      accountNumber: event.target.value.replace(/\D/g, '').slice(0, 10),
                    }))
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={10}
                  pattern="\d{10}"
                  className="w-full rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-primary)] px-4 py-3 text-sm tracking-[0.14em] text-white outline-none focus:border-[var(--az-accent-gold)]"
                  placeholder="0123456789"
                />
                <span className="mt-2 block text-[10px] text-[var(--az-text-muted)]">
                  Enter the 10-digit Nigerian bank account number.
                </span>
              </label>

              <div className="rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-primary)] p-4 text-xs">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[var(--az-text-muted)]">Requested amount</span>
                  <span className="font-mono font-bold text-[var(--az-accent-gold)]">
                    {money(payoutSummary.availableNaira)}
                  </span>
                </div>
                <p className="mt-2 leading-relaxed text-[var(--az-text-muted)]">
                  There is no lifetime or weekly payout limit. After this request is completed, you can request another payout whenever your available balance reaches ₦10,000.
                </p>
              </div>

              <button
                type="submit"
                disabled={submittingPayout}
                className="w-full rounded-2xl bg-[var(--az-accent-gold)] px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingPayout ? 'Submitting...' : 'Submit payout request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostedPartiesPage;
