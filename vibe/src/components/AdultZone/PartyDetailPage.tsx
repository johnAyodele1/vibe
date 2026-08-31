import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

interface TicketTier {
  tierId: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  sold: number;
  remaining: number;
  perPersonLimit: number;
  isSoldOut: boolean;
  isActive: boolean;
}

interface PartyDetail {
  _id: string;
  title: string;
  description: string;
  tagline?: string;
  coverImage: string;
  gallery?: Array<{ type: 'image' | 'video'; url: string; thumbnail?: string }>;
  organizerName?: string;
  organizerPhone?: string;
  venueName: string;
  venueAddress: string;
  location?: { city?: string; address?: string };
  startDate: string;
  endDate: string;
  ticketTiers: TicketTier[];
  genres?: string[];
  vibes?: string[];
}

export const PartyDetailPage: React.FC = () => {
  const { partyId } = useParams<{ partyId: string }>();
  const navigate = useNavigate();

  const [party, setParty] = useState<PartyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Purchase Bottom Sheet state
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [paymentProvider, setPaymentProvider] = useState<'wallet' | 'paystack'>('wallet');
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const fetchParty = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/parties/${partyId}`);
        const data = await res.json();
        if (data.success && data.party) {
          setParty(data.party);
        }
      } catch (err) {
        console.error('Error fetching party detail:', err);
      } finally {
        setLoading(false);
      }
    };
    if (partyId) fetchParty();
  }, [partyId]);

  const handleOpenPurchase = (tier: TicketTier) => {
    const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('token');
    if (!token) {
      toast.error('Please log in to purchase tickets');
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
    setSelectedTier(tier);
    setQuantity(1);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedTier || !party) return;
    setPurchasing(true);

    try {
      const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/parties/${party._id}/tickets/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tierId: selectedTier.tierId,
          quantity,
          paymentProvider,
          paymentReference: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          paymentIntentId: `intent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Purchased ${quantity} ticket(s) successfully!`);
        setSelectedTier(null);
        navigate('/me/tickets');
      } else {
        toast.error(data.error || 'Ticket purchase failed');
      }
    } catch {
      toast.error('Ticket purchase failed');
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-16 text-center text-white font-serif">Loading party detail...</div>;
  }

  if (!party) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-2xl text-white font-serif">Party Not Found</h2>
        <button onClick={() => navigate('/parties')} className="px-6 py-2 bg-[var(--az-accent-rose)] text-white font-bold text-xs rounded-full">
          Back to Parties
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Cover Banner */}
      <div className="relative aspect-[16/9] md:aspect-[16/7] rounded-3xl overflow-hidden bg-[#150a0f] border border-[var(--az-border)]">
        <img src={party.coverImage} alt={party.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col justify-end p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {party.genres?.map((g) => (
              <span key={g} className="px-3 py-1 rounded-full bg-black/60 border border-white/20 text-white text-xs font-bold uppercase">
                {g}
              </span>
            ))}
          </div>
          <h1 className="text-3xl md:text-5xl font-serif italic text-white">{party.title}</h1>
          {party.tagline && <p className="text-sm md:text-base text-neutral-300 font-serif italic mt-1">{party.tagline}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] p-6 rounded-2xl space-y-4">
            <h2 className="text-xl font-serif italic text-white">Event Details</h2>
            <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-line">{party.description}</p>
          </div>

          {/* Ticket Tiers */}
          <div className="space-y-4">
            <h2 className="text-xl font-serif italic text-white">Select Tickets</h2>
            <div className="space-y-4">
              {party.ticketTiers.map((tier) => (
                <div
                  key={tier.tierId}
                  className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg text-white">{tier.name}</h3>
                      {tier.isSoldOut ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase">
                          Sold Out
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">
                          {tier.remaining} remaining
                        </span>
                      )}
                    </div>
                    {tier.description && <p className="text-xs text-neutral-400 mt-1">{tier.description}</p>}
                    <p className="text-[10px] text-neutral-500 mt-1">Limit {tier.perPersonLimit} per buyer</p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <span className="text-xl font-mono font-bold text-[var(--az-accent-gold)]">
                      ₦{tier.price.toLocaleString()}
                    </span>
                    <button
                      disabled={tier.isSoldOut}
                      onClick={() => handleOpenPurchase(tier)}
                      className="px-6 py-2.5 bg-[var(--az-accent-rose)] hover:bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-wider rounded-full disabled:opacity-40 transition-colors"
                    >
                      {tier.isSoldOut ? 'Sold Out' : 'Buy Ticket'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Event Info */}
        <div className="space-y-6">
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] p-6 rounded-2xl space-y-4">
            <h3 className="text-base font-bold text-white uppercase tracking-wider">Date & Location</h3>

            <div className="space-y-3 text-xs text-neutral-300">
              <div className="flex items-start gap-2">
                <span>🗓</span>
                <div>
                  <p className="font-bold text-white">Start Time</p>
                  <p>{new Date(party.startDate).toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <span>🏁</span>
                <div>
                  <p className="font-bold text-white">Expected End</p>
                  <p>{new Date(party.endDate).toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 pt-2 border-t border-white/5">
                <span>📍</span>
                <div>
                  <p className="font-bold text-white">{party.venueName}</p>
                  <p>{party.venueAddress}</p>
                </div>
              </div>

              {party.organizerName && (
                <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                  <span>👤</span>
                  <span>Hosted by <strong>{party.organizerName}</strong></span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Purchase Bottom Sheet Modal */}
      {selectedTier && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#1a0f14] border border-[var(--az-border)] rounded-t-3xl sm:rounded-3xl p-6 space-y-6 animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-serif italic text-white">Confirm Ticket Purchase</h3>
                <p className="text-xs text-neutral-400">{selectedTier.name} Tier</p>
              </div>
              <button onClick={() => setSelectedTier(null)} className="text-neutral-400 hover:text-white text-lg">
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Ticket Price:</span>
                <span className="font-mono text-white">₦{selectedTier.price.toLocaleString()}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Quantity (Max {Math.min(selectedTier.perPersonLimit, selectedTier.remaining)}):</span>
                <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="text-lg font-bold text-neutral-400 hover:text-white"
                  >
                    -
                  </button>
                  <span className="font-bold text-white text-sm">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(selectedTier.perPersonLimit, selectedTier.remaining, quantity + 1))}
                    className="text-lg font-bold text-neutral-400 hover:text-white"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center text-sm font-bold pt-3 border-t border-white/10">
                <span className="text-white">Total Amount:</span>
                <span className="font-mono text-[var(--az-accent-gold)] text-lg">
                  ₦{(selectedTier.price * quantity).toLocaleString()}
                </span>
              </div>

              {/* Payment Method Selector */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <span className="text-neutral-400 block font-bold">Select Payment Method:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentProvider('wallet')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-colors ${
                      paymentProvider === 'wallet'
                        ? 'bg-[var(--az-accent-rose)] border-[var(--az-accent-rose)] text-white'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    💎 Wallet Credits
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentProvider('paystack')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-colors ${
                      paymentProvider === 'paystack'
                        ? 'bg-[var(--az-accent-rose)] border-[var(--az-accent-rose)] text-white'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                    }`}
                  >
                    💳 Paystack
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                disabled={purchasing}
                onClick={handleConfirmPurchase}
                className="w-full py-3.5 bg-[var(--az-accent-rose)] hover:bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-widest rounded-full transition-all disabled:opacity-50"
              >
                {purchasing ? 'Processing Payment...' : `Pay ₦${(selectedTier.price * quantity).toLocaleString()}`}
              </button>
              <p className="text-[10px] text-center text-neutral-500">
                Secure checkout • Instant QR ticket delivery
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PartyDetailPage;
