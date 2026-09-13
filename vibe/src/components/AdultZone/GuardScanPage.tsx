import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

interface ScanResult {
  success: boolean;
  display: string;
  action?: string;
  ticketCode?: string;
  tierName?: string;
  buyerName?: string;
  entryStatus?: string;
  entryCount?: number;
  reason?: string;
  error?: string;
  code?: string;
}

export const GuardScanPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialPartyId = searchParams.get('party') || '';

  const [partyId, setPartyId] = useState(initialPartyId);
  const [guardPin, setGuardPin] = useState('');
  const [authed, setAuthed] = useState(false);

  const [ticketCodeInput, setTicketCodeInput] = useState('');
  const [action, setAction] = useState<'entered' | 'exited' | 're_entered'>('entered');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (guardPin.length === 6 && partyId.trim().length > 0) {
      setAuthed(true);
    }
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketCodeInput.trim()) return;

    setScanning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/parties/${partyId}/checkin/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Guard-Code': guardPin.trim(),
        },
        body: JSON.stringify({
          ticketCode: ticketCodeInput.trim(),
          action,
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch {
      setResult({
        success: false,
        display: '❌ Connection Error',
        error: 'Network failure',
      });
    } finally {
      setScanning(false);
    }
  };

  // Determine fullscreen background class based on scan result
  const getResultStyleClass = () => {
    if (!result) return '';
    if (!result.success) return 'bg-[#450a0a]'; // red
    if (result.action === 'entered') return 'bg-[#052e16]'; // green
    if (result.action === 'exited') return 'bg-[#1c1917]'; // grey
    if (result.action === 're_entered') return 'bg-[#0c1a2e]'; // blue
    if (result.code === 'INVALID_ACTION') return 'bg-[#431407]'; // amber
    return 'bg-[#052e16]';
  };

  return (
    <div className="min-h-screen bg-[#0a0608] text-white flex flex-col items-center justify-center p-4">
      {!authed ? (
        <form onSubmit={handleAuth} className="w-full max-w-sm bg-neutral-900 border border-neutral-800 p-8 rounded-3xl space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold font-serif italic">Guard Access Check-in</h1>
            <p className="text-xs text-neutral-400">Enter venue PIN provided by event organizer</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-neutral-400 block mb-1 font-bold">Party / Event ID</label>
              <input
                type="text"
                required
                placeholder="Party MongoDB ID"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="w-full bg-black border border-neutral-800 text-xs px-4 py-2.5 rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-neutral-400 block mb-1 font-bold">6-Digit Guard PIN</label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                value={guardPin}
                onChange={(e) => setGuardPin(e.target.value)}
                className="w-full bg-black border border-neutral-800 text-lg font-mono text-center font-bold tracking-widest px-4 py-2.5 rounded-xl outline-none text-[var(--az-accent-gold)]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-xs uppercase rounded-xl transition-colors"
            >
              Start Security Scanner
            </button>
          </div>
        </form>
      ) : !result ? (
        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 p-8 rounded-3xl space-y-6">
          <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
            <span className="text-xs font-bold text-green-400">🟢 Security Guard Active</span>
            <button onClick={() => setAuthed(false)} className="text-xs text-neutral-500 hover:text-white">
              Exit
            </button>
          </div>

          <form onSubmit={handleScanSubmit} className="space-y-6">
            <div>
              <label className="text-xs text-neutral-400 block mb-1 font-bold">Action Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['entered', 'exited', 're_entered'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAction(a)}
                    className={`py-2 text-[10px] font-bold uppercase rounded-xl border transition-colors ${
                      action === a ? 'bg-[var(--az-accent-rose)] border-[var(--az-accent-rose)] text-white' : 'bg-black border-neutral-800 text-neutral-400'
                    }`}
                  >
                    {a === 'entered' ? 'Enter' : a === 'exited' ? 'Exit' : 'Re-enter'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-neutral-400 block mb-1 font-bold">Ticket Code / QR Scan Input</label>
              <input
                type="text"
                autoFocus
                placeholder="ZPP-XXXXXX"
                value={ticketCodeInput}
                onChange={(e) => setTicketCodeInput(e.target.value.toUpperCase())}
                className="w-full bg-black border border-neutral-800 text-lg font-mono text-center font-bold tracking-widest px-4 py-3 rounded-xl outline-none text-white uppercase"
              />
            </div>

            <button
              type="submit"
              disabled={scanning || !ticketCodeInput.trim()}
              className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl disabled:opacity-50"
            >
              {scanning ? 'Verifying...' : 'Submit Scan'}
            </button>
          </form>
        </div>
      ) : (
        /* Fullscreen Result Display Screen */
        <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-8 space-y-6 text-center ${getResultStyleClass()}`}>
          <div className="text-7xl">
            {result.display?.includes('Admitted') ? '✅' : result.display?.includes('Checked Out') ? '👋' : result.display?.includes('Re-admitted') ? '🔄' : '❌'}
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-white">{result.display || (result.success ? 'ACCEPTED' : 'DENIED')}</h1>

          {result.buyerName && <p className="text-2xl font-serif text-white/90">{result.buyerName}</p>}

          {result.tierName && (
            <span className="px-4 py-1 rounded-full bg-white/10 border border-white/20 text-sm font-bold uppercase tracking-wider text-white">
              {result.tierName} Tier
            </span>
          )}

          {result.ticketCode && <p className="text-sm font-mono text-white/70">Code: {result.ticketCode}</p>}

          {result.entryCount !== undefined && (
            <p className="text-xs text-white/50 font-bold uppercase tracking-widest">
              Entry Count: {result.entryCount}
            </p>
          )}

          {result.error && <p className="text-sm text-red-200 font-bold max-w-xs">{result.error}</p>}

          <button
            onClick={() => {
              setResult(null);
              setTicketCodeInput('');
            }}
            className="mt-8 px-10 py-4 rounded-full bg-white/20 hover:bg-white/30 border border-white/40 text-white font-bold text-sm uppercase tracking-widest cursor-pointer transition-all"
          >
            Scan Next Ticket →
          </button>
        </div>
      )}
    </div>
  );
};
export default GuardScanPage;
