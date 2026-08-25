import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { API_BASE_URL } from '../../config';
import { usePricingStore, formatNaira, formatAmount } from '../../lib/pricing';

const Wallet: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateCredits } = useAdultAuth();
  const [wallet, setWallet] = useState<{ creditBalance?: number } | null>(null);
  const [bundles, setBundles] = useState<{ id: string; credits: number; priceNaira: number; label?: string; badge?: string }[]>([]);
  const [transactions, setTransactions] = useState<{ _id: string; type: string; amount: number; status: string; createdAt: string }[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [customNairaInput, setCustomNairaInput] = useState<string>('');
  const [customError, setCustomError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTx, setTotalTx] = useState(0);

  const token = localStorage.getItem('adultAccessToken');

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchWallet = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setWallet(data);
      if (data && typeof data.creditBalance === 'number' && updateCredits) {
        updateCredits(data.creditBalance);
      }
    } catch (err) {
      console.error('Failed to fetch wallet:', err);
    } finally {
      setLoadingWallet(false);
    }
  };

  const fetchBundles = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet/bundles`);
      const data = await res.json();
      if (Array.isArray(data)) setBundles(data);
      else if (data && Array.isArray(data.data)) setBundles(data.data);
      else setBundles([]);
    } catch (err) {
      console.error('Failed to fetch bundles:', err);
      setBundles([]);
    } finally {
      setLoadingBundles(false);
    }
  };

  const fetchTransactions = async (pageNumber = 1) => {
    if (!token) return;
    setLoadingTx(true);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet/transactions?page=${pageNumber}&limit=${limit}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data && Array.isArray(data.transactions)) {
        setTransactions(data.transactions);
        setTotalPages(data.totalPages || 1);
        setTotalTx(data.total || data.transactions.length);
      } else if (Array.isArray(data)) {
        setTransactions(data);
        setTotalPages(1);
        setTotalTx(data.length);
      } else {
        setTransactions([]);
        setTotalPages(1);
        setTotalTx(0);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    if (user && user.role === 'provider') {
      navigate('/adult/provider/dashboard');
      return;
    }
    Promise.resolve().then(() => {
      void fetchWallet();
      void fetchBundles();
    });
  }, [token, user?.role, navigate]);

  useEffect(() => {
    if (user && user.role !== 'provider') {
      Promise.resolve().then(() => {
        void fetchTransactions(page);
      });
    }
  }, [token, page, user?.role]);

  const handlePurchasePackage = async (packageId: string) => {
    if (!token) {
      showToast('Please sign in to buy credits', 'error');
      return;
    }
    setPurchaseLoading(packageId);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet/paystack/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ package: packageId })
      });
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) throw new Error(data.error || 'Unable to start payment. Please try again.');

      window.location.assign(data.authorizationUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to start payment. Please try again.';
      showToast(msg, 'error');
      setPurchaseLoading(null);
    }
  };

  const handleCustomPurchase = async () => {
    if (!token) {
      showToast('Please sign in to buy credits', 'error');
      return;
    }
    setCustomError(null);
    const amount = Number(customNairaInput);
    if (!customNairaInput || isNaN(amount) || !Number.isInteger(amount) || amount < 1000) {
      setCustomError('Minimum purchase amount is ₦1,000');
      return;
    }

    setPurchaseLoading('custom');
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet/paystack/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ amountNaira: amount })
      });
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) throw new Error(data.error || 'Unable to start payment. Please try again.');

      window.location.assign(data.authorizationUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to start payment. Please try again.';
      showToast(msg, 'error');
      setPurchaseLoading(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-20">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-[9999] px-6 py-4 rounded-xl shadow-2xl border text-sm font-bold transition-all transform animate-bounce flex items-center gap-2 ${toastMessage.type === 'success' ? 'bg-green-950/90 text-green-400 border-green-500/30 shadow-green-900/20' : 'bg-red-950/90 text-red-400 border-red-500/30 shadow-red-900/20'}`}>
          <span>{toastMessage.type === 'success' ? '✅' : '❌'}</span><span>{toastMessage.text}</span>
        </div>
      )}

      <div className="bg-[var(--az-bg-secondary)] rounded-3xl border border-[var(--az-border)] p-6 sm:p-10 mb-12 text-center relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-[var(--az-accent-gold)] rounded-full blur-[100px] opacity-10" />
        <h1 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--az-text-muted)] mb-4">Current Balance</h1>
        <div className="flex items-center justify-center gap-2 sm:gap-3 text-3xl sm:text-5xl md:text-6xl font-mono text-[var(--az-accent-gold)] font-bold mb-2 flex-wrap max-w-full px-2 overflow-hidden break-all">
          <span className="shrink-0">💎</span>
          <span className="max-w-full">{loadingWallet ? '...' : formatAmount(wallet?.creditBalance ?? user?.credits)}</span>
        </div>
        <p className="text-xs sm:text-sm text-[var(--az-text-secondary)] font-serif italic">{loadingWallet ? 'Loading wallet...' : `Credits available for tipping & private shows (~${formatNaira(((wallet?.creditBalance ?? user?.credits) ?? 0) * usePricingStore.getState().diamondNairaRate)})`}</p>
      </div>

      <div className="mb-12 rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)] p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] flex items-center justify-center text-xl shrink-0" aria-hidden="true">🔔</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-serif italic text-white">Stay in the loop</h2>
            <p className="text-xs text-[var(--az-text-secondary)] mt-1 leading-relaxed">Make sure this device can receive messages, matches, and activity alerts.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={() => navigate('/adult/settings#push-test-section')} className="px-5 py-2.5 rounded-full bg-[var(--az-accent-primary)] hover:bg-[var(--az-accent-rose)] text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95">Test Push Notifications</button>
              <button onClick={() => navigate('/adult/settings')} className="px-5 py-2.5 rounded-full bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95">Account Settings</button>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-serif italic text-[var(--az-text-primary)] mb-8">Purchase Credits</h2>
      {loadingBundles ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">{[1, 2, 3, 4].map(i => <div key={i} className="bg-[var(--az-bg-secondary)] rounded-2xl p-8 border border-[var(--az-border)] animate-pulse h-40" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {Array.isArray(bundles) && bundles.map(bundle => {
            const isBestValue = bundle.badge === 'Best Value' || bundle.badge === 'Most Popular';
            return (
              <div key={bundle.id} onClick={() => purchaseLoading === null && handlePurchasePackage(bundle.id)} className={`group relative bg-[var(--az-bg-secondary)] rounded-2xl p-8 border-2 transition-all cursor-pointer az-card-hover ${isBestValue ? 'border-[var(--az-accent-gold)]' : 'border-[var(--az-border)]'} ${purchaseLoading === bundle.id ? 'opacity-50 pointer-events-none' : ''}`}>
                {bundle.badge && <div className={`absolute top-4 right-4 text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded ${isBestValue ? 'bg-[var(--az-accent-gold)] text-black' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)]'}`}>{bundle.badge}</div>}
                <div className="flex items-center gap-4 mb-6"><span className="text-4xl">💎</span><div><h3 className="text-2xl font-mono font-bold text-white">{formatAmount(bundle.credits)}</h3><p className="text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest">{bundle.label || 'Credits'}</p></div></div>
                <div className="flex items-center justify-between"><span className="text-xl font-bold text-[var(--az-text-primary)]">{formatNaira(bundle.priceNaira)}</span><button disabled={purchaseLoading !== null} className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${isBestValue ? 'bg-[var(--az-accent-gold)] text-black shadow-lg shadow-yellow-900/20' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] group-hover:bg-[var(--az-accent-primary)] group-hover:text-white'}`}>{purchaseLoading === bundle.id ? 'Processing...' : 'Buy Now'}</button></div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom Purchase UI */}
      <div className="mb-20 bg-[var(--az-bg-secondary)] rounded-3xl border border-[var(--az-border)] p-4 sm:p-6 md:p-8 w-full min-w-0">
        <h3 className="text-lg sm:text-xl font-serif italic text-[var(--az-text-primary)] mb-1 sm:mb-2">Custom Purchase</h3>
        <p className="text-xs text-[var(--az-text-secondary)] mb-6 leading-relaxed">Enter a custom amount in Naira (minimum ₦1,000).</p>

        <div className="space-y-4 w-full min-w-0">
          <div className="bg-[#1b1216] border border-[var(--az-border)] rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 w-full min-w-0">
            <div className="flex items-center gap-3 w-full md:w-auto flex-1 min-w-0 bg-[#120a0e] px-3 py-2 rounded-xl border border-[var(--az-border)]/50">
              <span className="text-xl font-bold text-[var(--az-text-muted)] font-mono shrink-0 select-none">₦</span>
              <input
                type="number"
                placeholder="1,000"
                min={1000}
                step={100}
                value={customNairaInput}
                onChange={(e) => {
                  setCustomNairaInput(e.target.value);
                  setCustomError(null);
                }}
                className="bg-transparent border-none outline-none font-mono text-xl sm:text-2xl font-semibold text-white w-full min-w-0"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4 w-full md:w-auto shrink-0 border-t md:border-t-0 border-[var(--az-border)]/50 pt-3 md:pt-0 min-w-0">
              <div className="text-left sm:text-right shrink-0 min-w-0">
                <span className="text-[10px] font-bold tracking-widest text-[var(--az-text-muted)] uppercase block">You will receive</span>
                <span className="text-base sm:text-lg font-mono font-bold text-yellow-500 break-all">
                  💎 {formatAmount(customNairaInput && Number(customNairaInput) >= 1000 ? Math.floor(Number(customNairaInput) / 100) : 0)}
                </span>
              </div>
              <button
                onClick={handleCustomPurchase}
                disabled={purchaseLoading !== null || !customNairaInput || Number(customNairaInput) < 1000}
                className="w-full sm:w-auto px-5 sm:px-6 py-3 rounded-full bg-[var(--az-accent-crimson)] text-white text-xs font-bold uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_4_24_rgba(200,16,46,0.35)] shrink-0 text-center"
              >
                {purchaseLoading === 'custom' ? 'Processing...' : 'Continue to Payment'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--az-text-muted)] font-mono px-1">
            <span className="shrink-0">Minimum ₦1,000</span>
            <span className="shrink-0">1 Diamond = ₦100</span>
          </div>

          {customError && (
            <p className="text-xs text-[var(--az-accent-rose)] font-serif italic">{customError}</p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-serif italic text-[var(--az-text-primary)]">Transaction History</h3>
          {totalTx > 0 && (
            <span className="text-xs text-[var(--az-text-muted)] font-mono">
              Total {totalTx} transactions
            </span>
          )}
        </div>
        {loadingTx ? (
          <div className="bg-[var(--az-bg-secondary)] rounded-2xl p-6 border border-[var(--az-border)] animate-pulse space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-8 bg-[var(--az-bg-tertiary)] rounded" />)}</div>
        ) : (
          <div className="bg-[var(--az-bg-secondary)] rounded-2xl border border-[var(--az-border)] overflow-hidden">
            {!Array.isArray(transactions) || transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--az-text-secondary)] font-serif italic">No transactions yet. Purchases and tips will appear here.</div>
            ) : (
              <>
                {transactions.map(tx => {
                  const isPositive = tx.type === 'purchase' || tx.type === 'credit_purchase' || tx.type === 'deposit';
                  const getStatusBadgeStyle = (status: string) => {
                    const s = (status || '').toLowerCase();
                    if (['completed', 'success'].includes(s)) {
                      return 'bg-green-950/40 text-green-400 border-green-500/30';
                    }
                    if (['pending', 'queued', 'verifying', 'processing'].includes(s)) {
                      return 'bg-amber-950/40 text-amber-400 border-amber-500/30';
                    }
                    if (['failed', 'rejected', 'refunded', 'reverted'].includes(s)) {
                      return 'bg-red-950/40 text-red-400 border-red-500/30';
                    }
                    return 'bg-neutral-800 text-neutral-300 border-neutral-700';
                  };

                  return (
                    <div key={tx._id} className="p-4 border-b border-[var(--az-border)]/50 flex items-center justify-between last:border-0 hover:bg-[var(--az-bg-tertiary)]/30 transition-colors">
                      <div>
                        <h4 className="text-xs font-bold text-[var(--az-text-primary)] capitalize">{tx.type.replace('_', ' ')}</h4>
                        <p className="text-[10px] text-[var(--az-text-muted)]">{new Date(tx.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <p className={`text-xs font-mono font-bold ${isPositive ? 'text-green-400' : 'text-[var(--az-accent-rose)]'}`}>
                          {isPositive ? '+' : '-'}{formatAmount(tx.amount)} 💎
                        </p>
                        <p className="text-[10px] text-[var(--az-text-muted)] font-mono">≈ {formatNaira(Math.abs(tx.amount) * usePricingStore.getState().diamondNairaRate)}</p>
                        <span className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold border mt-0.5 ${getStatusBadgeStyle(tx.status)}`} data-testid={`tx-status-${tx._id}`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {totalPages > 1 && (
                  <div className="p-4 border-t border-[var(--az-border)] flex items-center justify-between bg-[var(--az-bg-tertiary)]/20" data-testid="wallet-pagination-controls">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      data-testid="prev-page-btn"
                      className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      ← Previous
                    </button>
                    <span className="text-xs text-[var(--az-text-secondary)] font-mono font-medium" data-testid="page-indicator">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      data-testid="next-page-btn"
                      className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wallet;
