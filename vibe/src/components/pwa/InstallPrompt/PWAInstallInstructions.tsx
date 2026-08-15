import React, { useEffect, useRef } from 'react';

interface PWAInstallInstructionsProps {
  isOpen: boolean;
  onClose: () => void;
  onDismissPermanent: () => void;
  platform: 'ios' | 'android' | 'desktop' | 'unsupported';
}

export const PWAInstallInstructions: React.FC<PWAInstallInstructionsProps> = ({
  isOpen,
  onClose,
  onDismissPermanent,
  platform,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trap and accessibility helpers
  useEffect(() => {
    if (!isOpen) return;

    // Save active element to return focus on unmount
    const previouslyFocusedElement = document.activeElement as HTMLElement;

    // Focus close button initially
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }

      // Tab trapping
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements) return;

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Return focus
      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity duration-300 animate-[pwaFadeIn_0.3s_ease-out]"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="w-full max-w-sm az-glass border border-[var(--az-border)] rounded-3xl p-6 shadow-[0_0_30px_rgba(200,16,46,0.25)] flex flex-col gap-5 text-center animate-[pwaSlideUp_0.35s_cubic-bezier(0.32,0.72,0,1)] pb-safe mb-safe"
        onClick={(e) => e.stopPropagation()} // Prevent closing on modal body click
      >
        {/* Header Row */}
        <div className="flex justify-between items-center">
          <div className="w-5" /> {/* spacer to center title */}
          <h3
            id="pwa-install-title"
            className="font-serif italic text-lg text-[var(--az-text-primary)] font-bold tracking-wide"
          >
            Install App
          </h3>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close instructions"
            className="w-8 h-8 rounded-full bg-[var(--az-bg-tertiary)] flex items-center justify-center text-[var(--az-text-muted)] hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Visual Mockup Device (Meetcam inspired styling) */}
        <div className="flex flex-col items-center justify-center py-2 select-none">
          <div className="relative w-16 h-32 border-4 border-slate-700 rounded-[2rem] bg-slate-900 shadow-lg flex flex-col items-center justify-center gap-1.5 p-2">
            {/* Notch */}
            <div className="absolute top-1 w-8 h-2.5 bg-black rounded-full" />
            {/* App Icon */}
            <div className="w-8 h-8 bg-gradient-to-br from-[var(--az-accent-rose)] to-[var(--az-accent-primary)] rounded-lg flex items-center justify-center text-white font-extrabold text-xs shadow-md">
              Z
            </div>
            {/* App Name */}
            <span className="text-[9px] text-[var(--az-text-secondary)] font-medium">Zippo</span>
            {/* Home Indicator line */}
            <div className="absolute bottom-1 w-10 h-0.5 bg-white/40 rounded-full" />
          </div>
        </div>

        {/* Text Introduction */}
        <div className="flex flex-col gap-1">
          <h4 className="font-bold text-[15px] text-[var(--az-text-primary)]">
            Add Zippo to your Home Screen
          </h4>
          <p className="text-xs text-[var(--az-text-secondary)] leading-relaxed px-2">
            Get faster access and a fullscreen premium experience directly from your home screen.
          </p>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="text-left flex flex-col gap-3.5 bg-[var(--az-bg-tertiary)] border border-[var(--az-border)] rounded-2xl p-4">
          {platform === 'android' ? (
            <>
              {/* Step 1 */}
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[var(--az-accent-rose)]/20 text-[var(--az-accent-rose)] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </span>
                <p className="text-xs text-[var(--az-text-primary)] leading-relaxed">
                  Tap the menu icon (three dots <span className="font-bold">⋮</span>) in the top-right corner of Chrome.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[var(--az-accent-rose)]/20 text-[var(--az-accent-rose)] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </span>
                <p className="text-xs text-[var(--az-text-primary)] leading-relaxed">
                  Select <span className="font-semibold text-white">"Install app"</span> or <span className="font-semibold text-white">"Add to Home screen"</span>.
                </p>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[var(--az-accent-rose)]/20 text-[var(--az-accent-rose)] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </span>
                <p className="text-xs text-[var(--az-text-primary)] leading-relaxed">
                  Confirm by tapping <span className="font-semibold text-white">"Install"</span> or <span className="font-semibold text-white">"Add"</span>.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Step 1 */}
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[var(--az-accent-rose)]/20 text-[var(--az-accent-rose)] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </span>
                <p className="text-xs text-[var(--az-text-primary)] leading-relaxed">
                  Tap <span className="font-semibold text-white">"+"</span> in your Safari address bar (iOS 17+), or tap the Share icon{' '}
                  <svg
                    aria-hidden="true"
                    className="w-4 h-4 inline-block text-[var(--az-accent-rose)] mx-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                    style={{ verticalAlign: 'text-bottom' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V3m0 0l-3 3m3-3l3 3"
                    />
                  </svg>{' '}
                  at the bottom of your Safari browser.
                </p>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[var(--az-accent-rose)]/20 text-[var(--az-accent-rose)] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </span>
                <p className="text-xs text-[var(--az-text-primary)] leading-relaxed">
                  Scroll down and select <span className="font-semibold text-white">"Add to Home Screen"</span>.
                </p>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-[var(--az-accent-rose)]/20 text-[var(--az-accent-rose)] text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </span>
                <p className="text-xs text-[var(--az-text-primary)] leading-relaxed">
                  Tap <span className="font-semibold text-white">"Add"</span> in the upper-right corner.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Action / Dismiss Buttons */}
        <div className="flex flex-col gap-2 mt-1">
          <button
            onClick={onClose}
            className="w-full bg-[var(--az-accent-primary)] hover:bg-[var(--az-accent-rose)] active:scale-95 text-white text-xs font-bold py-3 rounded-xl shadow-[0_4px_15px_var(--az-glow)] transition-all cursor-pointer"
          >
            Got it
          </button>
          <button
            onClick={() => {
              onDismissPermanent();
              onClose();
            }}
            className="w-full text-[10px] text-[var(--az-text-muted)] hover:text-[var(--az-text-secondary)] hover:underline py-1 transition-all cursor-pointer"
          >
            Don't show this reminder again
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pwaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pwaSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
