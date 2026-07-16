import React from 'react';

const Wallet: React.FC = () => {
  const bundles = [
    { diamonds: '100', price: '$4.99', badge: null },
    { diamonds: '500', price: '$19.99', badge: 'Best Value', popular: true },
    { diamonds: '1,500', price: '$49.99', badge: 'Premium' },
    { diamonds: '5,000', price: '$129.99', badge: 'Whale' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-20">
      <div className="bg-[var(--az-bg-secondary)] rounded-3xl border border-[var(--az-border)] p-10 mb-12 text-center relative overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-[var(--az-accent-gold)] rounded-full blur-[100px] opacity-10" />

        <h1 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--az-text-muted)] mb-4">Current Balance</h1>
        <div className="flex items-center justify-center gap-3 text-6xl font-mono text-[var(--az-accent-gold)] font-bold mb-2">
          <span>💎</span>
          <span>240</span>
        </div>
        <p className="text-sm text-[var(--az-text-secondary)] font-serif italic">Credits available for tipping and private unlocks</p>
      </div>

      <h2 className="text-2xl font-serif italic text-[var(--az-text-primary)] mb-8">Purchase Credits</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-20">
        {bundles.map((bundle) => (
          <div
            key={bundle.diamonds}
            className={`group relative bg-[var(--az-bg-secondary)] rounded-2xl p-8 border-2 transition-all cursor-pointer az-card-hover ${bundle.popular ? 'border-[var(--az-accent-gold)]' : 'border-[var(--az-border)]'}`}
          >
            {bundle.badge && (
              <div className={`absolute top-4 right-4 text-[8px] font-bold uppercase tracking-widest px-2 py-1 rounded ${bundle.popular ? 'bg-[var(--az-accent-gold)] text-black' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-secondary)]'}`}>
                {bundle.badge}
              </div>
            )}

            <div className="flex items-center gap-4 mb-6">
              <span className="text-4xl">💎</span>
              <div>
                <h3 className="text-2xl font-mono font-bold text-white">{bundle.diamonds}</h3>
                <p className="text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest">Diamonds</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xl font-bold text-[var(--az-text-primary)]">{bundle.price}</span>
              <button className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${bundle.popular ? 'bg-[var(--az-accent-gold)] text-black shadow-lg shadow-yellow-900/20' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] group-hover:bg-[var(--az-accent-primary)] group-hover:text-white'}`}>
                Buy Now
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-6">
        <h3 className="text-xl font-serif italic text-[var(--az-text-primary)]">Transaction History</h3>
        <div className="bg-[var(--az-bg-secondary)] rounded-2xl border border-[var(--az-border)] overflow-hidden">
          {[
            { id: 1, type: 'Purchase', amount: '+500 💎', date: 'Oct 24, 2023', status: 'Completed' },
            { id: 2, type: 'Tip: Elena Rose', amount: '-25 💎', date: 'Oct 25, 2023', status: 'Sent' },
            { id: 3, type: 'Unlock: Private Photo', amount: '-15 💎', date: 'Oct 25, 2023', status: 'Unlocking' },
          ].map((tx) => (
            <div key={tx.id} className="p-4 border-b border-[var(--az-border)]/50 flex items-center justify-between last:border-0 hover:bg-[var(--az-bg-tertiary)]/30 transition-colors">
              <div>
                <h4 className="text-xs font-bold text-[var(--az-text-primary)]">{tx.type}</h4>
                <p className="text-[10px] text-[var(--az-text-muted)]">{tx.date}</p>
              </div>
              <div className="text-right">
                <p className={`text-xs font-mono font-bold ${tx.amount.startsWith('+') ? 'text-green-500' : 'text-[var(--az-accent-rose)]'}`}>
                  {tx.amount}
                </p>
                <p className="text-[8px] uppercase tracking-tighter text-[var(--az-text-muted)] font-bold">{tx.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Wallet;
