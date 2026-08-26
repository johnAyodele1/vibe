import React, { useState } from 'react';

interface AgeGateProps {
  onVerified: () => void;
}

const AgeGate: React.FC<AgeGateProps> = ({ onVerified }) => {
  const [checks, setChecks] = useState({
    age: false,
    content: false,
    location: false,
    consent: false,
  });

  const allChecked = Object.values(checks).every(Boolean);

  const handleEnter = () => {
    if (allChecked) {
      localStorage.setItem('adultZoneVerified', JSON.stringify({
        verified: true,
        timestamp: Date.now()
      }));
      onVerified();
    }
  };

  return (
    <div className="fixed inset-0 h-screen min-h-[100dvh] w-screen z-[9999] flex items-center justify-center bg-[#0a0608] az-grain overflow-y-auto">
      {/* Background Blur Overlay */}
      <div className="absolute inset-0 min-h-[100dvh] bg-gradient-to-br from-[#0a0608] via-[#1a0f12] to-[#0a0608] opacity-90" />

      <div className="relative w-full max-w-md p-8 mx-4 az-glass border border-[var(--az-border)] rounded-2xl shadow-2xl text-center">
        {/* Logo Variant */}
        <div className="flex items-center justify-center mb-6 gap-3">
          <div className="w-10 h-10 bg-[var(--az-accent-primary)] rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-[0_0_15px_var(--az-glow)]">
            💬
          </div>
          <h1 className="text-2xl font-serif italic text-[var(--az-text-primary)] tracking-wide">
            Casual Zone
          </h1>
        </div>

        <h2 className="text-xl font-bold text-[var(--az-text-primary)] mb-4">
          You are about to enter an adults-only area.
        </h2>

        <p className="text-[var(--az-text-secondary)] text-sm mb-8">
          This section contains explicit content intended for mature audiences only.
          By continuing, you confirm that:
        </p>

        <div className="space-y-4 mb-10 text-left">
          {[
            { id: 'age', label: 'I am 18 years of age or older (or the legal age in my country/region)' },
            { id: 'content', label: 'I understand this section contains adult content' },
            { id: 'location', label: 'I am not accessing this from a restricted location' },
            { id: 'consent', label: 'I consent to viewing adult content' }
          ].map((item) => (
            <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checks[item.id as keyof typeof checks]}
                  onChange={() => setChecks(prev => ({ ...prev, [item.id]: !prev[item.id as keyof typeof checks] }))}
                />
                <div className="w-5 h-5 border border-[var(--az-border)] rounded bg-[var(--az-bg-tertiary)] peer-checked:bg-[var(--az-accent-primary)] peer-checked:border-transparent transition-all" />
                <svg className="absolute w-3 h-3 text-white hidden peer-checked:block left-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-xs text-[var(--az-text-secondary)] group-hover:text-[var(--az-text-primary)] transition-colors leading-tight">
                {item.label}
              </span>
            </label>
          ))}
        </div>

        <div className="space-y-4">
          <button
            onClick={handleEnter}
            disabled={!allChecked}
            className={`w-full py-4 rounded-full font-bold uppercase tracking-widest transition-all duration-300 ${
              allChecked
                ? 'bg-[var(--az-accent-primary)] text-white shadow-[0_0_20px_var(--az-glow)] hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-[var(--az-bg-tertiary)] text-[var(--az-text-muted)] cursor-not-allowed'
            }`}
          >
            ENTER — I AM 18 OR OLDER
          </button>

          <button
            onClick={() => window.location.href = '/'}
            className="text-[var(--az-text-muted)] text-sm underline hover:text-[var(--az-text-secondary)] transition-colors"
          >
            EXIT — Take me back
          </button>
        </div>

        <p className="mt-8 text-[10px] text-[var(--az-text-muted)] uppercase tracking-tighter">
          By entering, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default AgeGate;
