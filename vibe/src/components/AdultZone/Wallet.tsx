import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { API_BASE_URL } from '../../config';
import { usePricingStore, formatNaira } from '../../lib/pricing';

const Wallet: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAdultAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [bundles, setBundles] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [loadingBundles, setLoadingBundles] = useState(true);
  const [loadingTx, setLoadingTx] = useState(true);
  const [purchaseLoading, setPurchaseLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

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

  const fetchTransactions = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet/transactions`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data && Array.isArray(data.transactions)) setTransactions(data.transactions);
      else if (Array.isArray(data)) setTransactions(data);
      else setTransactions([]);
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
    fetchWallet();
    fetchBundles();
    fetchTransactions();
  }, [token, user, navigate]);

  const handlePurchase = async (bundleId: string) => {
    if (!token) {
      showToast('Please sign in to buy credits', 'error');
      return;
    }
    setPurchaseLoading(bundleId);
    try {
      const res = await fetch(`${API_BASE_URL}/v1/adult/wallet/purchase/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ bundleId })
      });
      const data = await res.json();
      if (!res.ok || !data.paymentIntentId) throw new Error(data.error || 'Failed to create purchase intent');

      const webhookRes = await fetch(`${API_BASE_URL}/v1/adult/wallet/purchase/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: data.paymentIntentId })
      });
      const webhookData = await webhookRes.json();
      if (webhookRes.ok && webhookData.success) {
        showToast('Successfully purchased credits!', 'success');
        fetchWallet();
        fetchTransactions();
      } else {
        throw new Error(webhookData.error || 'Failed to complete payment simulation');
      }
    } catch (err: any) {
      showToast(err.message || 'Payment simulation failed', 'error');
    } finally {
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

      <div className="bg-[var(--az-bg-secondary)] rounded-3xl border border-[var(--az-border)] p-10 mb-12 text-center relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-[var(--az-accent-gold)] rounded-full blur-[100px] opacity-10" />
        <h1 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--az-text-muted)] mb-4">Current Balance</h1>
        <div className="flex items-center justify-center gap-3 text-6xl font-mono text-[var(--az-accent-gold)] font-bold mb-2"><span>💎</span><span>{loadingWallet ? '...' : (wallet?.creditBalance ?? 0)}</span></div>
        <p className="text-sm text-[var(--az-text-secondary)] font-serif italic">{loadingWallet ? 'Loading wallet...' : `Credits available for tipping & private shows (~${formatNaira((wallet?.creditBalance ?? 0) * usePricingStore.getState().diamondNairaRate)})`}</p>
      </div>

      <div className="mb-12 rounded-3xl border border-[var(--az-border)] bg-[var(--az-bg-secondary)] p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] flex items-center justify-center text-xl shrink-0" aria-hidden="true">🔔</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-serif italic text-white">Stay in the loop</h2>
            <p className="text-xs text-[var(--az-text-secondary)] mt-1 leading-relaxed">Make sure this device can receive messages, matches, and activity alerts.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={() => navigate('/settings#push-notifications')} className="px-5 py-2.5 rounded-full bg-[var(--az-accent-primary)] hover:bg-[var(--az-accent-rose)] text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95">Test Push Notifications</button>
              <button onClick={() => navigate('/settings')} className="px-5 py-2.5 rounded-full bg-[var(--az-bg-tertiary)] hover:bg-[var(--az-bg-primary)] border border-[var(--az-border)] text-white text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95">Account Settings</button>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-serif italic text-[var(--az-text-primary)] mb-8">Purchase Credits</h2>
      {loadingBundles ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-20">{[1, 2, 3, 4].map(i => <div key={i} className="bg-[var(--az-bg-secondary)] rounded-2xl p-8 border border-[var(--az-border)] animate-pulse h-40" />)}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-20">
          {Array.isArray(bundles) && bundles.map(bundle => {
            const isBestValue = bundle.badge === 'Best Value';
            return (
              <div key={bundle.id} onClick={() => purchaseLoading === null && handlePurchase(bundle.id)} className={`group relative bg-[var(--az-bg-secondary)] rounded-2xl p-8 border-2 transition-all cursor-pointer az-card-hover ${isBestValue ? 'border-[var(--az-accent-gold)]' : 'border-[var(--az-border)]'} ${purchaseLoading === bundle.id ? 'opacity-50 pointer-events-none' : ''}`}>
                {bundle.badge && <div className={`absolute top-4 right-4 text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded ${isBestValue ? 'bg-[var(--az-accent-gold)] text-black' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)]`}>{bundle.badge}</div>}
                <div className="flex items-center gap-4 mb-6"><span className="text-4xl">💎</span><div><h3 className="text-2xl font-mono font-bold text-white">{bundle.credits}</h3><p className="text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest">{bundle.label || 'Credits'}</p></div></div>
                <div className="flex items-center justify-between"><span className="text-xl font-bold text-[var(--az-text-primary)]">{formatNaira(bundle.priceNaira || (bundle.credits * usePricingStore.getState().diamondNairaRate))}</span><button disabled={purchaseLoading !== null} className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${isBestValue ? 'bg-[var(--az-accent-gold)] text-black shadow-lg shadow-yellow-900/20' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] group-hover:bg-[var(--az-accent-primary)] group-hover:text-white'}`}>{purchaseLoading === bundle.id ? 'Processing...' : 'Buy Now'}</button></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-6">
        <h3 className="text-xl font-serif italic text-[var(--az-text-primary)]">Transaction History</h3>
        {loadingTx ? (
          <div className="bg-[var(--az-bg-secondary)] rounded-2xl p-6 border border-[var(--az-border)] animate-pulse space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-8 bg-[var(--az-bg-tertiary)] rounded" />)}</div>
        ) : (
          <div className="bg-[var(--az-bg-secondary)] rounded-2xl border border-[var(--az-border)] overflow-hidden">
            {!Array.isArray(transactions) || transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--az-text-secondary)] font-serif italic">No transactions yet. Purchases and tips will appear here.</div>
            ) : (
              transactions.map(tx => {
                const isPositive = tx.type === 'purchase' || tx.type === 'deposit';
                return <div key={tx._id} className="p-4 border-b border-[var(--az-border)]/50 flex items-center justify-between last:border-0 hover:bg-[var(--az-bg-tertiary)]/30 transition-colors"><div><h4 className="text-xs font-bold text-[var(--az-text-primary)] capitalize">{tx.type}</h4><p className="text-[10px] text-[var(--az-text-muted)]">{new Date(tx.createdAt).toLocaleDateString()}</p></div><div className="text-right flex flex-col items-end"><p className={`text-xs font-mono font-bold ${isPositive ? 'text-green-400' : 'text-[var(--az-accent-rose)]'}`}>{isPositive ? '+' : '-'}{tx.amount} 💎</p><p className="text-[10px] text-[var(--az-text-muted)] font-mono">≈ {formatNaira(Math.abs(tx.amount) * usePricingStore.getState().diamondNairaRate)}</p><p className="text-[8px] uppercase tracking-tighter text-[var(--az-text-muted)] font-bold">{tx.status}</p></div></div>;
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Wallet;
