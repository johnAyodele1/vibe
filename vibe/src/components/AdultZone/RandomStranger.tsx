import React, { useState } from 'react';

const RandomStranger: React.FC = () => {
  const [isMatching, setIsMatching] = useState(false);

  const startMatching = () => {
    setIsMatching(true);
    // Simulate matching delay
    setTimeout(() => {
      // In a real app, this would redirect or show the chat
    }, 3000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-160px)] px-4 py-20 text-center">
      {!isMatching ? (
        <div className="max-w-md w-full">
          <div className="w-24 h-24 bg-[var(--az-bg-secondary)] border-2 border-[var(--az-accent-primary)] rounded-full flex items-center justify-center text-4xl mb-8 mx-auto shadow-[0_0_30px_var(--az-glow)]">
            🎲
          </div>

          <h1 className="text-4xl font-serif italic text-[var(--az-text-primary)] mb-2">Find Your Match</h1>
          <p className="text-[var(--az-text-secondary)] font-serif italic mb-10">Anonymous. Consensual. Electric.</p>

          <div className="bg-[var(--az-bg-secondary)] p-8 rounded-2xl border border-[var(--az-border)] text-left space-y-6 mb-10 shadow-2xl">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-3 block">Looking for:</label>
              <div className="flex gap-2">
                {['Girls', 'Guys', 'Anyone'].map(opt => (
                  <button key={opt} className={`flex-grow py-2 rounded-lg text-xs font-bold border transition-all ${opt === 'Anyone' ? 'bg-[var(--az-accent-primary)] border-transparent text-white' : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] text-[var(--az-text-secondary)]'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] mb-3 block">Mode:</label>
              <div className="flex gap-2">
                {['Text Only', 'Cam', 'Both'].map(opt => (
                  <button key={opt} className={`flex-grow py-2 rounded-lg text-xs font-bold border transition-all ${opt === 'Both' ? 'bg-[var(--az-accent-primary)] border-transparent text-white' : 'bg-[var(--az-bg-tertiary)] border-[var(--az-border)] text-[var(--az-text-secondary)]'}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)]">Age Range:</label>
                <span className="text-[10px] font-mono text-[var(--az-accent-gold)]">18 — 45+</span>
              </div>
              <input type="range" className="w-full h-1 bg-[var(--az-bg-tertiary)] rounded-lg appearance-none cursor-pointer accent-[var(--az-accent-primary)]" />
            </div>
          </div>

          <button
            onClick={startMatching}
            className="w-full py-5 bg-[var(--az-accent-primary)] text-white font-bold uppercase tracking-[0.2em] rounded-full shadow-[0_0_25px_var(--az-glow)] hover:scale-105 active:scale-95 transition-all"
          >
            START MATCHING
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative w-32 h-32 mb-10">
            <div className="absolute inset-0 border-4 border-[var(--az-accent-primary)] border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-4 border-4 border-[var(--az-accent-rose)] border-b-transparent rounded-full animate-spin-slow" />
            <div className="absolute inset-0 flex items-center justify-center text-3xl">🔍</div>
          </div>
          <h2 className="text-2xl font-serif italic text-[var(--az-text-primary)] mb-2 animate-pulse">Finding your stranger...</h2>
          <p className="text-sm text-[var(--az-text-secondary)] font-serif italic">The best things are worth the wait.</p>

          <button
            onClick={() => setIsMatching(false)}
            className="mt-12 text-[10px] font-bold uppercase tracking-widest text-[var(--az-text-muted)] hover:text-[var(--az-text-secondary)] underline"
          >
            Cancel and Go Back
          </button>
        </div>
      )}

      <div className="mt-20 max-w-sm text-[10px] text-[var(--az-text-muted)] uppercase tracking-widest leading-relaxed">
        <span className="text-[var(--az-accent-rose)]">⚠️ SAFETY FIRST:</span> NEVER SHARE PERSONAL INFORMATION WITH STRANGERS. INSTANT BLOCK AND REPORT TOOLS ARE ALWAYS AVAILABLE.
      </div>
    </div>
  );
};

export default RandomStranger;
