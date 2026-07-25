import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { API_BASE_URL } from '../../config';

const ProviderEarnings: React.FC = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('adultAccessToken');

  const [dateRange, setDateRange] = useState('This Month');
  const [totalEarned, setTotalEarned] = useState(0);
  const [paidOut, setPaidOut] = useState(0);
  const [pending, setPending] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchEarnings = async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/earnings?dateRange=${dateRange}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const json = await res.json();
      if (json.success) {
        setTotalEarned(json.data.totalEarned);
        setPaidOut(json.data.paidOut);
        setPending(json.data.pending);
        setTransactions(json.data.transactions);
        setTimeline(json.data.timeline || []);
        setCurrentPage(1); // reset to first page on fetch / dateRange change
      } else {
        toast.error(json.error?.message || 'Failed to fetch earnings');
      }
    } catch (err: any) {
      toast.error('Error connecting to the server');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    fetchEarnings();
  }, [token, navigate, dateRange]);

  const requestEarlyPayout = async () => {
    if (pending < 50.00) {
      toast.error('Minimum payout threshold is $50.00 USD');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/providers/me/payout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const json = await res.json();
      if (json.success) {
        toast.success('Your early payout request has been processed successfully!');
        fetchEarnings(); // refresh the numbers and transactions
      } else {
        toast.error(json.error?.message || 'Failed to process payout');
      }
    } catch (err: any) {
      toast.error('Error initiating payout request');
    }
  };

  if (isLoading && transactions.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--az-bg-primary)] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-[var(--az-accent-gold)] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-bold uppercase tracking-widest text-[var(--az-text-secondary)]">Loading Earnings Audit...</p>
        </div>
      </div>
    );
  }

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
            className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white outline-none cursor-pointer"
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
            {/* Visual simulation of area graph using real timeline data */}
            <div className="flex items-end justify-between h-40 border-b border-[var(--az-border)]/50 pb-2 px-2">
              {timeline.map((t, idx) => {
                const maxVal = Math.max(...timeline.map(item => item.credits), 0);
                const pct = maxVal > 0 ? (t.credits / maxVal) * 100 : 0;
                const heightPct = Math.max(pct, 5); // visually nice baseline of 5% minimum
                return (
                  <div
                    key={idx}
                    className="w-[12%] flex flex-col items-center group relative cursor-pointer"
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute -top-10 scale-0 group-hover:scale-100 transition-all bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded px-2 py-1 text-[9px] font-mono whitespace-nowrap z-10 shadow-lg">
                      💎 {t.credits} (${(t.credits * 0.0075).toFixed(2)} est.)
                    </div>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full bg-gradient-to-t from-[var(--az-accent-primary)]/40 to-[var(--az-accent-primary)] rounded-t transition-all duration-500"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between text-[10px] text-[var(--az-text-secondary)] font-mono uppercase tracking-wider px-2">
              {timeline.map((t, idx) => (
                <span key={idx} className="w-[12%] text-center">{t.dayName}</span>
              ))}
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
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-[var(--az-text-muted)] italic">
                        No transactions found for this period.
                      </td>
                    </tr>
                  ) : (
                    transactions
                      .slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
                      .map(tx => (
                        <tr key={tx.id} className="hover:bg-[var(--az-bg-tertiary)]/20 transition-colors">
                          <td className="p-4 text-xs font-mono text-white">{tx.date}</td>
                          <td className="p-4 font-semibold text-white capitalize">{tx.type}</td>
                          <td className="p-4 text-[var(--az-text-secondary)]">{tx.from}</td>
                          <td className={`p-4 font-mono font-bold ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                          </td>
                          <td className="p-4 font-mono text-white">
                            {tx.usd < 0 ? `-$${Math.abs(tx.usd).toFixed(2)}` : `$${tx.usd.toFixed(2)}`}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest ${
                              tx.status === 'Completed' || tx.status === 'Paid'
                                ? 'bg-green-950/40 text-green-400 border border-green-500/30'
                                : tx.status === 'Failed'
                                ? 'bg-red-950/40 text-red-400 border border-red-500/30'
                                : 'bg-yellow-950/40 text-yellow-400 border border-yellow-500/30'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls inside the same UI layer container */}
            {transactions.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[var(--az-bg-tertiary)]/50 border-t border-[var(--az-border)] text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-[var(--az-text-secondary)] font-medium">Rows per page:</span>
                  <select
                    data-testid="rows-per-page-select"
                    className="bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-lg px-2.5 py-1.5 font-bold text-white outline-none cursor-pointer"
                    value={rowsPerPage}
                    onChange={e => {
                      setRowsPerPage(parseInt(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={20}>20</option>
                    <option value={25}>25</option>
                  </select>
                  <span className="text-[var(--az-text-muted)] font-mono">
                    Showing {Math.min(transactions.length, (currentPage - 1) * rowsPerPage + 1)} to {Math.min(transactions.length, currentPage * rowsPerPage)} of {transactions.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 bg-[var(--az-bg-secondary)] hover:bg-[var(--az-bg-tertiary)] disabled:opacity-40 disabled:hover:bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl font-bold uppercase tracking-widest text-[10px] text-white transition-all"
                  >
                    Prev
                  </button>
                  <span className="text-[var(--az-text-secondary)] font-mono font-bold px-2">
                    Page {currentPage} of {Math.ceil(transactions.length / rowsPerPage)}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(transactions.length / rowsPerPage), prev + 1))}
                    disabled={currentPage >= Math.ceil(transactions.length / rowsPerPage)}
                    className="px-3 py-1.5 bg-[var(--az-bg-secondary)] hover:bg-[var(--az-bg-tertiary)] disabled:opacity-40 disabled:hover:bg-[var(--az-bg-secondary)] border border-[var(--az-border)] rounded-xl font-bold uppercase tracking-widest text-[10px] text-white transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProviderEarnings;
