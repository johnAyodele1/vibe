import React from 'react';

const VIPLounge: React.FC = () => {
  const tiers = [
    {
      name: 'Gold',
      price: '$9.99',
      duration: '/mo',
      features: ['Access to all Live Cams', 'Basic Naughty Rooms', '5 Free Credits Monthly', 'Standard Support'],
      color: 'border-yellow-700/30'
    },
    {
      name: 'Platinum',
      price: '$19.99',
      duration: '/mo',
      features: ['Priority Cam Access', 'All Premium Rooms', '20 Free Credits Monthly', 'Private Photo Requests', 'No Ads'],
      color: 'border-[var(--az-accent-rose)]',
      popular: true
    },
    {
      name: 'Diamond',
      price: '$39.99',
      duration: '/mo',
      features: ['Full Elite Access', 'Exclusive Performer Events', '100 Free Credits Monthly', 'Personal Account Manager', 'Crypto Rewards'],
      color: 'border-[var(--az-accent-gold)]'
    }
  ];

  return (
    <div className="relative min-h-[calc(100vh-64px)] py-20 px-4 overflow-hidden">
      {/* Background Silhouettes */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-96 bg-[var(--az-accent-primary)] filter blur-[100px]" />
        <div className="absolute bottom-20 right-10 w-64 h-96 bg-[var(--az-accent-gold)] filter blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        <h1 className="text-5xl md:text-6xl font-serif italic text-[var(--az-text-primary)] mb-6">VIP Lounge</h1>
        <p className="text-lg text-[var(--az-text-secondary)] font-serif italic mb-16 max-w-2xl mx-auto">
          Elevate your experience to the highest level of luxury and exclusivity.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative bg-[var(--az-bg-secondary)] rounded-2xl p-8 border-2 ${tier.color} flex flex-col az-card-hover ${tier.popular ? 'scale-105 shadow-[0_0_40px_rgba(232,73,106,0.2)]' : ''}`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[var(--az-accent-rose)] text-white text-[10px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full shadow-lg">
                  Most Popular
                </div>
              )}

              <h3 className="text-2xl font-serif italic text-white mb-2">{tier.name}</h3>
              <div className="flex items-baseline justify-center gap-1 mb-8">
                <span className="text-4xl font-mono font-bold text-[var(--az-text-primary)]">{tier.price}</span>
                <span className="text-sm text-[var(--az-text-muted)] uppercase tracking-widest">{tier.duration}</span>
              </div>

              <ul className="text-left space-y-4 mb-10 flex-grow">
                {tier.features.map(f => (
                  <li key={f} className="flex items-center gap-3 text-xs text-[var(--az-text-secondary)]">
                    <span className="text-[var(--az-accent-gold)]">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest transition-all ${tier.popular ? 'bg-[var(--az-accent-rose)] text-white shadow-lg hover:shadow-[var(--az-accent-rose)]' : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-primary)] border border-[var(--az-border)] hover:border-[var(--az-accent-gold)]'}`}>
                Upgrade Now
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-6">
          <p className="text-[10px] text-[var(--az-text-muted)] uppercase tracking-[0.2em] font-bold">Secure Payment via</p>
          <div className="flex flex-wrap justify-center gap-8 opacity-40">
            <span className="text-xl font-bold italic">VISA</span>
            <span className="text-xl font-bold italic">MasterCard</span>
            <span className="text-xl font-bold italic">Apple Pay</span>
            <span className="text-xl font-bold italic">Google Pay</span>
            <span className="text-xl font-bold italic">Crypto</span>
          </div>
          <p className="text-xs text-[var(--az-text-muted)] italic mt-8">Cancel your subscription at any time. No hidden fees.</p>
        </div>
      </div>
    </div>
  );
};

export default VIPLounge;
