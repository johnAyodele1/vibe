import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const ProviderEarnings: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adultAccessToken');

  const [dateRange, setDateRange] = useState('This Month');
  const [totalEarned] = useState(74200);
  const [paidOut, setPaidOut] = useState(450.00);
  const [pending, setPending] = useState(106.50);

  const [transactions] = useState<any[]>([
    { id: '1', date: 'Jul 15', type: 'Tip', from: 'Member_3821', amount: 500, usd: 3.75, status: 'Completed' },
    { id: '2', date: 'Jul 15', type: 'Private Call', from: 'Member_2214', amount: 1200, usd: 9.00, status: 'Completed' },
    { id: '3', date: 'Jul 14', type: 'Tip', from: 'Anonymous', amount: 100, usd: 0.75, status: 'Completed' },
    { id: '4', date: 'Jul 14', type: 'Payout', from: 'Bank Transfer', amount: -60000, usd: -450.00, status: 'Paid' }
  ]);

  useEffect(() => {
    if (!token) {
      navigate('/');
    }
  }, [token, navigate]);

  const requestEarlyPayout = () => {
    if (pending < 50.00) {
      toast.error('Minimum payout threshold is $50.00 USD');
      return;
    }
    toast.success('Your early payout request has been queued!');
    setPaidOut(prev => prev + pending);
    setPending(0);
  };

  return (
    <div className="min-h-screen bg-[var(--az-bg-primary)] text-white font-sans az-grain py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[var(--az-border)]/50 pb-6">
          <div>
            <h1 className="text-4xl font-serif italic text-white tracking-wide">Your Earnings</h1>
            <p className="text-xs text-[var(--az-text-secondary)]">Detailed audit reports and cash-out operations</p>
          </div>

          <select
            className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white outline-none"
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
          >
            <option value="Today">Today</option>
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
          </select>
        </div>

        {/* Financial metrics bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-1">Total Accumulated Balance</p>
            <p className="text-3xl font-mono font-bold text-[var(--az-accent-gold)]">💎 {totalEarned}</p>
            <p className="text-xs text-[var(--az-text-muted)]">${(totalEarned * 0.0075).toFixed(2)} est. valuation</p>
          </div>

          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-1">Paid Out to Date</p>
            <p className="text-3xl font-mono font-bold text-green-400">${paidOut.toFixed(2)}</p>
            <p className="text-xs text-[var(--az-text-muted)]">Cleared to configured payout coordinates</p>
          </div>

          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-secondary)] mb-1">Pending Clearance</p>
              <p className="text-3xl font-mono font-bold text-[var(--az-accent-rose)]">${pending.toFixed(2)}</p>
            </div>
            <button
              onClick={requestEarlyPayout}
              className="mt-4 w-full py-2 bg-[var(--az-accent-primary)] hover:bg-red-700 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md"
            >
              Request Early Payout
            </button>
          </div>
        </div>

        {/* Charts Mock with Recharts Styling simulation */}
        <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl p-6">
          <h3 className="text-lg font-serif italic text-white mb-6">Earnings Timeline Performance</h3>

          <div className="h-64 w-full bg-[var(--az-bg-tertiary)] rounded-2xl border border-[var(--az-border)]/50 flex flex-col justify-between p-6">
            {/* Visual simulation of area graph */}
            <div className="flex items-end justify-between h-40 border-b border-[var(--az-border)]/50 pb-2">
              <div className="w-[10%] bg-gradient-to-t from-[var(--az-accent-primary)]/40 to-[var(--az-accent-primary)] h-[20%] rounded-t" />
              <div className="w-[10%] bg-gradient-to-t from-[var(--az-accent-primary)]/40 to-[var(--az-accent-primary)] h-[45%] rounded-t" />
              <div className="w-[10%] bg-gradient-to-t from-[var(--az-accent-primary)]/40 to-[var(--az-accent-primary)] h-[30%] rounded-t" />
              <div className="w-[10%] bg-gradient-to-t from-[var(--az-accent-primary)]/40 to-[var(--az-accent-primary)] h-[80%] rounded-t" />
              <div className="w-[10%] bg-gradient-to-t from-[var(--az-accent-primary)]/40 to-[var(--az-accent-primary)] h-[65%] rounded-t" />
              <div className="w-[10%] bg-gradient-to-t from-[var(--az-accent-primary)]/40 to-[var(--az-accent-primary)] h-[95%] rounded-t" />
            </div>

            <div className="flex justify-between text-[10px] text-[var(--az-text-secondary)] font-mono uppercase tracking-wider">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>
          </div>
        </div>

        {/* Transactions list */}
        <div className="space-y-4">
          <h3 className="text-xl font-serif italic text-white">Credit Transaction Breakdown</h3>
          <div className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-3xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--az-border)] bg-[var(--az-bg-tertiary)]/50">
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Date</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Type</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">From / Method</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Credits</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Estimated USD</th>
                    <th className="p-4 text-xs font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--az-border)]/50">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-[var(--az-bg-tertiary)]/20 transition-colors">
                      <td className="p-4 text-xs font-mono text-white">{tx.date}</td>
                      <td className="p-4 font-semibold text-white capitalize">{tx.type}</td>
                      <td className="p-4 text-[var(--az-text-secondary)]">{tx.from}</td>
                      <td className={`p-4 font-mono font-bold ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                      </td>
                      <td className="p-4 font-mono text-white">${tx.usd.toFixed(2)}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${tx.status === 'Completed' || tx.status === 'Paid' ? 'bg-green-950/40 text-green-400 border border-green-500/30' : 'bg-yellow-950/40 text-yellow-400 border border-yellow-500/30'}`}>
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProviderEarnings;
