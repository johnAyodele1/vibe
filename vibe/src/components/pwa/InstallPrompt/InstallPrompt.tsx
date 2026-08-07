import React from 'react';
import { usePWAInstall } from './usePWAInstall';
import { IOSInstallInstructions } from './IOSInstallInstructions';

export const InstallPrompt: React.FC = () => {
  const {
    shouldShowCTA,
    showInstructions,
    setShowInstructions,
    dismissTemporary,
    dismissPermanent,
    handleInstallClick,
  } = usePWAInstall();

  if (!shouldShowCTA) {
    if (showInstructions) {
      return (
        <IOSInstallInstructions
          isOpen={showInstructions}
          onClose={() => setShowInstructions(false)}
          onDismissPermanent={dismissPermanent}
        />
      );
    }
    return null;
  }

  return (
    <>
      {/* Floating CTA Banner */}
      <div
        data-testid="pwa-install-cta"
        className="fixed left-4 right-4 z-[9999] az-glass border border-[var(--az-border)] shadow-[0_0_20px_var(--az-glow)] rounded-2xl p-4 flex flex-col gap-3 max-w-md mx-auto transition-all duration-300 ease-out animate-[pwaSlideIn_0.4s_cubic-bezier(0.34,1.56,0.64,1)]"
        style={{
          bottom: 'calc(64px + env(safe-area-inset-bottom) + 12px)',
        }}
      >
        <div className="flex items-start gap-3">
          {/* Brand Icon */}
          <div className="w-10 h-10 bg-[var(--az-accent-primary)] rounded-xl flex items-center justify-center text-white font-extrabold text-xl shadow-[0_0_12px_var(--az-glow)] flex-shrink-0 select-none">
            Z
          </div>

          {/* Text Content */}
          <div className="flex-grow min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-[var(--az-text-primary)]">
                Install Zippo
              </h4>
              {/* Close Button */}
              <button
                onClick={dismissTemporary}
                aria-label="Close installation prompt"
                className="text-[var(--az-text-muted)] hover:text-white transition-colors p-1"
              >
                <span className="text-sm font-bold">✕</span>
              </button>
            </div>
            <p className="text-xs text-[var(--az-text-secondary)] mt-0.5 leading-relaxed">
              Get faster access to Zippo and an app-like experience directly from your home screen.
            </p>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between mt-1 pl-[52px]">
          <button
            onClick={dismissPermanent}
            className="text-[10px] text-[var(--az-text-muted)] hover:text-[var(--az-text-secondary)] underline transition-colors cursor-pointer"
          >
            Don't show again
          </button>

          <button
            onClick={handleInstallClick}
            className="bg-[var(--az-accent-primary)] hover:bg-[var(--az-accent-rose)] active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-full shadow-[0_0_10px_var(--az-glow)] transition-all cursor-pointer"
          >
            Install
          </button>
        </div>
      </div>

      {/* Slide-in CSS Keyframe block */}
      <style>{`
        @keyframes pwaSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* iOS Safari Instructions modal */}
      {showInstructions && (
        <IOSInstallInstructions
          isOpen={showInstructions}
          onClose={() => setShowInstructions(false)}
          onDismissPermanent={dismissPermanent}
        />
      )}
    </>
  );
};
