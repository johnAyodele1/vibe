import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

export const CreatePartyPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [createdGuardPin, setCreatedGuardPin] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [genres, setGenres] = useState('afrobeats, hip-hop');
  const [vibes, setVibes] = useState('nightlife, lounge');

  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [city, setCity] = useState('Lagos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [coverImage, setCoverImage] = useState('');
  const [organizerPhone, setOrganizerPhone] = useState('');

  const [guardAccessCode, setGuardAccessCode] = useState('123456');

  const [ticketTiers, setTicketTiers] = useState([
    { name: 'Regular', description: 'General admission ticket', price: 5000, quantity: 100, perPersonLimit: 4 },
    { name: 'VIP', description: 'VIP lounge access & line skip', price: 15000, quantity: 30, perPersonLimit: 2 },
  ]);

  const handleAddTier = () => {
    if (ticketTiers.length >= 5) {
      toast.error('Maximum 5 ticket tiers allowed');
      return;
    }
    setTicketTiers([
      ...ticketTiers,
      { name: 'Table / VIP', description: 'Premium table access', price: 50000, quantity: 10, perPersonLimit: 2 },
    ]);
  };

  const handleRemoveTier = (index: number) => {
    if (ticketTiers.length <= 1) {
      toast.error('At least 1 ticket tier is required');
      return;
    }
    setTicketTiers(ticketTiers.filter((_, i) => i !== index));
  };

  const handleUpdateTier = (index: number, field: string, value: any) => {
    const updated = [...ticketTiers];
    (updated[index] as any)[field] = value;
    setTicketTiers(updated);
  };

  const handleSubmit = async () => {
    const token = localStorage.getItem('adultAccessToken') || localStorage.getItem('token');
    if (!token) {
      toast.error('Please log in to submit a party');
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }

    if (!title || !description || !venueName || !venueAddress || !startDate || !endDate) {
      toast.error('Please fill in all required fields');
      return;
    }

    const defaultCover = coverImage.trim() || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1000&auto=format&fit=crop';

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/parties`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          tagline,
          description,
          genres: genres.split(',').map((g) => g.trim()),
          vibes: vibes.split(',').map((v) => v.trim()),
          venueName,
          venueAddress,
          location: { city, country: { name: 'Nigeria', code: 'NG' } },
          startDate,
          endDate,
          coverImage: defaultCover,
          organizerPhone,
          guardAccessCode,
          ticketTiers,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCreatedGuardPin(data.guardPin || guardAccessCode);
        toast.success('Party submitted for review!');
      } else {
        toast.error(data.error || 'Failed to submit party');
      }
    } catch {
      toast.error('Submission error');
    } finally {
      setSubmitting(false);
    }
  };

  if (createdGuardPin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 text-green-400 text-3xl flex items-center justify-center mx-auto">
          ✓
        </div>
        <h2 className="text-3xl font-serif italic text-white">Party Submitted for Review</h2>
        <p className="text-sm text-neutral-300">
          Our team reviews submissions typically within 24 hours. Once approved, your event will go live automatically.
        </p>

        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl space-y-2">
          <span className="text-xs uppercase font-bold text-neutral-500">Security Guard Access PIN:</span>
          <div className="text-3xl font-mono font-bold text-[var(--az-accent-gold)] tracking-widest">{createdGuardPin}</div>
          <p className="text-[10px] text-neutral-400">
            Share this 6-digit PIN with your venue security guards for QR code check-in scanning at the door.
          </p>
        </div>

        <button
          onClick={() => navigate('/parties')}
          className="px-8 py-3 bg-[var(--az-accent-rose)] text-white text-xs font-bold uppercase rounded-full"
        >
          View All Parties
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-serif italic text-white">Host a Party / Event</h1>
        <p className="text-sm text-neutral-400">Create event listing, sell tickets, and manage QR check-in</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        {['1. Basic Info', '2. Venue & Date', '3. Media', '4. Tickets & Security'].map((label, idx) => (
          <span
            key={label}
            className={`text-xs font-bold ${step === idx + 1 ? 'text-[var(--az-accent-rose)] border-b-2 border-[var(--az-accent-rose)] pb-1' : 'text-neutral-500'}`}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-4 bg-[var(--az-bg-secondary)] p-6 rounded-2xl border border-[var(--az-border)]">
          <h2 className="text-lg font-bold text-white">Step 1: Event Info</h2>
          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">Party Title *</label>
            <input
              type="text"
              placeholder="e.g. Lagos Carnival Night"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">Tagline</label>
            <input
              type="text"
              placeholder="e.g. The biggest night of the weekend"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">Description *</label>
            <textarea
              rows={4}
              placeholder="Describe the vibe, lineup, dress code, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs p-4 rounded-xl outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-neutral-400 block mb-1 font-bold">Genres (comma separated)</label>
              <input
                type="text"
                value={genres}
                onChange={(e) => setGenres(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2 rounded-xl outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1 font-bold">Vibes (comma separated)</label>
              <input
                type="text"
                value={vibes}
                onChange={(e) => setVibes(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2 rounded-xl outline-none"
              />
            </div>
          </div>
          <button
            onClick={() => setStep(2)}
            className="w-full py-3 bg-[var(--az-accent-rose)] text-white text-xs font-bold uppercase rounded-xl mt-4"
          >
            Next: Venue & Date →
          </button>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4 bg-[var(--az-bg-secondary)] p-6 rounded-2xl border border-[var(--az-border)]">
          <h2 className="text-lg font-bold text-white">Step 2: Venue & Date</h2>
          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">Venue Name *</label>
            <input
              type="text"
              placeholder="e.g. Club Quilox"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">Address *</label>
            <input
              type="text"
              placeholder="e.g. 873 Ozumba Mbadiwe Ave, Victoria Island"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">City</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-neutral-400 block mb-1 font-bold">Start Date & Time *</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2 rounded-xl outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400 block mb-1 font-bold">Expected End Time *</label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2 rounded-xl outline-none"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={() => setStep(1)} className="w-1/3 py-3 bg-neutral-800 text-white text-xs font-bold uppercase rounded-xl">
              ← Back
            </button>
            <button onClick={() => setStep(3)} className="w-2/3 py-3 bg-[var(--az-accent-rose)] text-white text-xs font-bold uppercase rounded-xl">
              Next: Media →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-4 bg-[var(--az-bg-secondary)] p-6 rounded-2xl border border-[var(--az-border)]">
          <h2 className="text-lg font-bold text-white">Step 3: Media Upload</h2>
          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">Cover Banner Image URL</label>
            <input
              type="text"
              placeholder="https://..."
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2.5 rounded-xl outline-none"
            />
            <p className="text-[10px] text-neutral-500 mt-1">Leave empty to use recommended default banner.</p>
          </div>
          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">Organizer Phone (For Admin Verification)</label>
            <input
              type="text"
              placeholder="+234..."
              value={organizerPhone}
              onChange={(e) => setOrganizerPhone(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2.5 rounded-xl outline-none"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={() => setStep(2)} className="w-1/3 py-3 bg-neutral-800 text-white text-xs font-bold uppercase rounded-xl">
              ← Back
            </button>
            <button onClick={() => setStep(4)} className="w-2/3 py-3 bg-[var(--az-accent-rose)] text-white text-xs font-bold uppercase rounded-xl">
              Next: Tickets & Security →
            </button>
          </div>
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && (
        <div className="space-y-6 bg-[var(--az-bg-secondary)] p-6 rounded-2xl border border-[var(--az-border)]">
          <h2 className="text-lg font-bold text-white">Step 4: Ticket Tiers & Guard Security PIN</h2>

          <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl text-xs text-amber-400 space-y-1">
            <p className="font-bold">⚡ Platform Revenue Split (5%):</p>
            <p>Platform fee is fixed at 5% of ticket sales. You receive 95% of gross revenue for every ticket sold.</p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">Ticket Tiers</h3>
              <button onClick={handleAddTier} className="text-xs text-[var(--az-accent-rose)] font-bold">
                + Add Tier
              </button>
            </div>

            {ticketTiers.map((tier, idx) => (
              <div key={idx} className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white">Tier #{idx + 1}</span>
                  {ticketTiers.length > 1 && (
                    <button onClick={() => handleRemoveTier(idx)} className="text-xs text-red-400">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Tier Name (e.g. Regular)"
                    value={tier.name}
                    onChange={(e) => handleUpdateTier(idx, 'name', e.target.value)}
                    className="bg-black border border-neutral-800 text-white text-xs px-3 py-2 rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Price in Naira (₦)"
                    value={tier.price}
                    onChange={(e) => handleUpdateTier(idx, 'price', parseFloat(e.target.value))}
                    className="bg-black border border-neutral-800 text-white text-xs px-3 py-2 rounded-lg font-mono"
                  />
                  <input
                    type="number"
                    placeholder="Total Quantity"
                    value={tier.quantity}
                    onChange={(e) => handleUpdateTier(idx, 'quantity', parseInt(e.target.value, 10))}
                    className="bg-black border border-neutral-800 text-white text-xs px-3 py-2 rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Per-person Limit"
                    value={tier.perPersonLimit}
                    onChange={(e) => handleUpdateTier(idx, 'perPersonLimit', parseInt(e.target.value, 10))}
                    className="bg-black border border-neutral-800 text-white text-xs px-3 py-2 rounded-lg"
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-neutral-400 block mb-1 font-bold">6-Digit Security Guard Access PIN</label>
            <input
              type="text"
              maxLength={6}
              value={guardAccessCode}
              onChange={(e) => setGuardAccessCode(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs px-4 py-2.5 rounded-xl font-mono tracking-widest text-lg font-bold"
            />
            <p className="text-[10px] text-neutral-500 mt-1">Guards will enter this PIN at door check-in scan screen.</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={() => setStep(3)} className="w-1/3 py-3 bg-neutral-800 text-white text-xs font-bold uppercase rounded-xl">
              ← Back
            </button>
            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="w-2/3 py-3 bg-[var(--az-accent-rose)] hover:bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase rounded-xl disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Party for Review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default CreatePartyPage;
