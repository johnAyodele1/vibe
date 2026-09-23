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
  payout: {
    status: 'requested' | 'processing' | 'paid' | 'rejected';
    amountNaira: number;
    requestedAt: string;
    processedAt?: string;
  } | null;
  canRequestPayout: boolean;
};

type PayoutForm = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
};

const money = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);

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
  const [loading, setLoading] = useState(true);
  const [selectedPayout, setSelectedPayout] = useState<Party | null>(null);
  const [payoutForm, setPayoutForm] = useState<PayoutForm>({ bankName: '', accountHolder: '', accountNumber: '' });
  const [submittingPayout, setSubmittingPayout] = useState(false);

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
      if (!res.ok || !data.success) throw new Error(data.error || 'Unable to load hosted parties');
      setParties(Array.isArray(data.parties) ? data.parties : []);
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

  const submitPayout = async () => {
    if (!selectedPayout || !token) return;
    setSubmittingPayout(true);

    try {
      const res = await fetch(`${V1_API_BASE_URL}/parties/${selectedPayout._id}/payout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payoutForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Unable to submit payout request');

      toast.success('Payout details submitted. We will process the party payout.');
      setSelectedPayout(null);
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
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">Your payout</p>
              <p className="mt-1 font-mono text-sm font-bold text-[var(--az-accent-gold)]">{money(party.stats.organizerPayoutNaira)}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-xs text-[var(--az-text-secondary)]">
            <p>🗓 {new Date(party.startDate).toLocaleString()}</p>
            <p>📍 {party.venueName} · {party.venueAddress}</p>
          </div>

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

          {ended && party.canRequestPayout && (
            <button
              onClick={() => setSelectedPayout(party)}
              className="mt-3 w-full rounded-2xl bg-[var(--az-accent-gold)] px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black transition hover:brightness-110"
            >
              Request {money(party.stats.organizerPayoutNaira)} payout
            </button>
          )}

          {ended && party.payout && (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-primary)] px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">Payout</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-accent-gold)]">
                {party.payout.status} · {money(party.payout.amountNaira)}
              </span>
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <header className="flex flex-col gap-5 border-b border-[var(--az-border)] pb-7 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--az-accent-gold)]">Host workspace</p>
          <h1 className="mt-2 font-serif text-4xl italic text-white">Your parties</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--az-text-secondary)]">
            Manage events, scan guests at the door, and request your ticket revenue after each party ends.
          </p>
        </div>
        <button
          onClick={() => navigate('/parties/create')}
          className="rounded-full bg-[var(--az-accent-primary)] px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-white"
        >
          + Host a party
        </button>
      </header>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((item) => <div key={item} className="h-96 animate-pulse rounded-3xl bg-[var(--az-bg-secondary)]" />)}
        </div>
      ) : parties.length === 0 ? (
        <div className="rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)] px-6 py-16 text-center">
          <p className="font-serif text-2xl italic text-white">You have not hosted a party yet.</p>
          <p className="mt-2 text-sm text-[var(--az-text-secondary)]">Create your first event and manage everything from this workspace.</p>
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
              <div className="grid gap-6 md:grid-cols-2">{activeParties.map((party) => <PartyCard key={party._id} party={party} />)}</div>
            </section>
          )}

          {pastParties.length > 0 && (
            <section className="space-y-4">
              <div className="border-t border-[var(--az-border)] pt-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--az-text-muted)]">Your history</p>
                <h2 className="mt-1 font-serif text-2xl italic text-white">Past parties</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2">{pastParties.map((party) => <PartyCard key={party._id} party={party} />)}</div>
            </section>
          )}
        </>
      )}

      {selectedPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-accent-gold)]">Party payout</p>
                <h2 className="mt-1 font-serif text-2xl italic text-white">{selectedPayout.title}</h2>
                <p className="mt-1 text-xs text-[var(--az-text-secondary)]">
                  {money(selectedPayout.stats.organizerPayoutNaira)} will be paid separately from your Zippo credit wallet.
                </p>
              </div>
              <button onClick={() => setSelectedPayout(null)} className="text-xl text-[var(--az-text-muted)] hover:text-white">×</button>
            </div>

            <div className="mt-6 space-y-4">
              {(['bankName', 'accountHolder', 'accountNumber'] as const).map((field) => (
                <label key={field} className="block">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">
                    {field === 'bankName' ? 'Bank name' : field === 'accountHolder' ? 'Account holder' : 'Account number'}
                  </span>
                  <input
                    value={payoutForm[field]}
                    onChange={(event) => setPayoutForm((current) => ({ ...current, [field]: event.target.value }))}
                    inputMode={field === 'accountNumber' ? 'numeric' : 'text'}
                    maxLength={field === 'accountNumber' ? 10 : 100}
                    className="w-full rounded-2xl border border-[var(--az-border)] bg-[var(--az-bg-primary)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--az-accent-gold)]"
                  />
                </label>
              ))}
            </div>

            <button
              onClick={submitPayout}
              disabled={submittingPayout}
              className="mt-6 w-full rounded-2xl bg-[var(--az-accent-gold)] px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-black disabled:opacity-50"
            >
              {submittingPayout ? 'Submitting...' : 'Submit payout details'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostedPartiesPage;
