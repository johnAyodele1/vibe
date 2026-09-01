import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

interface TicketItem {
  _id: string;
  ticketCode: string;
  tierName: string;
  buyerName: string;
  priceNaira: number;
  entryStatus: 'not_entered' | 'inside' | 'outside';
  qrCodeUrl: string;
  createdAt: string;
  partyId?: {
    _id: string;
    title: string;
    coverImage: string;
    startDate: string;
    endDate: string;
    venueName: string;
    venueAddress: string;
  };
}

export const MyTicketsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedQrTicket, setSelectedQrTicket] = useState<TicketItem | null>(null);

  useEffect(() => {
    const fetchTickets = async () => {
      const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      // Check if returning from Paystack payment callback
      const payRef = searchParams.get('reference') || searchParams.get('trxref');
      if (payRef) {
        toast.loading('Verifying Paystack ticket payment...', { id: 'verify-tkt' });
        try {
          const verifyRes = await fetch(`${API_BASE_URL}/parties/orders/${payRef}/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ paymentReference: payRef }),
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            toast.success('Ticket payment verified and issued!', { id: 'verify-tkt' });
          } else {
            toast.error(verifyData.error || 'Payment verification pending', { id: 'verify-tkt' });
          }
        } catch {
          toast.dismiss('verify-tkt');
        } finally {
          // Clear query params from URL
          setSearchParams({});
        }
      }

      try {
        const res = await fetch(`${API_BASE_URL}/me/tickets`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.tickets)) {
          setTickets(data.tickets);
        }
      } catch (err) {
        console.error('Error fetching my tickets:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTickets();
  }, [searchParams, setSearchParams]);

  const now = new Date();
  const upcomingTickets = tickets.filter((t) => !t.partyId?.startDate || new Date(t.partyId.startDate) >= now);
  const pastTickets = tickets.filter((t) => t.partyId?.startDate && new Date(t.partyId.startDate) < now);

  const displayedTickets = activeTab === 'upcoming' ? upcomingTickets : pastTickets;

  const getStatusBadge = (status: 'not_entered' | 'inside' | 'outside') => {
    if (status === 'inside') {
      return <span className="px-2.5 py-0.5 rounded-full bg-green-500/20 border border-green-500 text-green-400 text-[10px] font-bold">● Inside</span>;
    }
    if (status === 'outside') {
      return <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500 text-amber-400 text-[10px] font-bold">● Outside</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] font-bold">● Not entered</span>;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-serif italic text-white">My Ticket Wallet</h1>
          <p className="text-sm text-neutral-400">Present your QR code at the door for entry</p>
        </div>
        <button
          onClick={() => navigate('/parties')}
          className="px-5 py-2 bg-[var(--az-accent-rose)] text-white text-xs font-bold uppercase rounded-full"
        >
          Browse Parties
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-6 py-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'upcoming'
              ? 'border-[var(--az-accent-rose)] text-[var(--az-accent-rose)]'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          Upcoming ({upcomingTickets.length})
        </button>
        <button
          onClick={() => setActiveTab('past')}
          className={`px-6 py-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'past'
              ? 'border-[var(--az-accent-rose)] text-[var(--az-accent-rose)]'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          Past Events ({pastTickets.length})
        </button>
      </div>

      {/* Ticket List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-[var(--az-bg-secondary)] rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : displayedTickets.length > 0 ? (
        <div className="space-y-4">
          {displayedTickets.map((ticket) => (
            <div
              key={ticket._id}
              className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#180d12] flex-shrink-0 border border-neutral-800">
                  <img
                    src={ticket.partyId?.coverImage || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop'}
                    alt={ticket.partyId?.title || 'Party'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base">{ticket.partyId?.title || 'Event'}</h3>
                    {getStatusBadge(ticket.entryStatus)}
                  </div>
                  <p className="text-xs text-neutral-400">
                    📍 {ticket.partyId?.venueName || 'Venue'} • {ticket.partyId?.startDate ? new Date(ticket.partyId.startDate).toLocaleString() : ''}
                  </p>
                  <p className="text-xs font-mono font-bold text-[var(--az-accent-gold)]">
                    Tier: {ticket.tierName || 'Regular'} • Code: {ticket.ticketCode}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedQrTicket(ticket)}
                className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white text-xs font-bold rounded-full transition-colors flex items-center justify-center gap-2"
              >
                <span>📱 View QR Code</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-neutral-500 font-serif italic">
          No {activeTab} tickets found in your wallet.
        </div>
      )}

      {/* Fullscreen QR Modal with High Brightness Overlay */}
      {selectedQrTicket && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0a0608] border border-neutral-800 rounded-3xl p-6 text-center space-y-6 flex flex-col items-center">
            <div className="w-full flex justify-between items-center">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Entry Pass</span>
              <button onClick={() => setSelectedQrTicket(null)} className="text-neutral-400 hover:text-white text-xl">
                ✕
              </button>
            </div>

            {/* Large High-Contrast QR Code */}
            <div className="p-4 bg-white rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.2)]" style={{ filter: 'brightness(1.15)' }}>
              <img
                src={selectedQrTicket.qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${selectedQrTicket.ticketCode}`}
                alt={selectedQrTicket.ticketCode}
                className="w-56 h-56 object-contain"
              />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-serif italic text-white">{selectedQrTicket.partyId?.title}</h2>
              <div className="text-2xl font-mono font-bold text-[var(--az-accent-gold)] tracking-widest">
                {selectedQrTicket.ticketCode}
              </div>
              <p className="text-xs text-neutral-400">Tier: {selectedQrTicket.tierName} • {selectedQrTicket.buyerName}</p>
            </div>

            <div className="w-full py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-[10px] text-neutral-400">
              💡 Maximum screen brightness recommended for door scanning
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MyTicketsPage;
