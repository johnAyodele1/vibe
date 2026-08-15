import { useEffect, useState } from 'react';
import { PWAInstallInstructions } from './InstallPrompt/PWAInstallInstructions';

const AddToHomeScreenHint = ({ onDismiss }: { onDismiss: () => void }) => {
  const [visible, setVisible] = useState(true);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const onPageShow = () => setVisible(true);
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    onDismiss();
  };

  return (
    <>
      <div className="ios-install-card" data-testid="aths-hint" role="status" aria-live="polite">
        <div className="ios-install-card__main">
          <span className="ios-install-card__icon" aria-hidden="true">📲</span>

          <div className="ios-install-card__text">
            <p className="ios-install-card__title">
              Get the full Zippo experience
            </p>
            <p className="ios-install-card__subtitle">
              Add to your Home Screen to unlock push notifications.
            </p>
            <div className="ios-install-card__steps">
              <div className="ios-install-card__step">
                <span className="ios-install-card__step-badge">+</span>
                <span>Tap <strong>"+"</strong> in your Safari address bar</span>
              </div>
              <div className="ios-install-card__divider">— or —</div>
              <div className="ios-install-card__step">
                <span className="ios-install-card__step-badge">⬆</span>
                <span>Tap <strong>Share</strong> → <strong>"Add to Home Screen"</strong></span>
              </div>
            </div>
          </div>

          <div className="ios-install-card__actions">
            <button
              className="ios-install-card__show-btn"
              type="button"
              onClick={() => setShowSteps(true)}
            >
              Show me how
            </button>
            <button
              className="ios-install-card__not-now"
              type="button"
              onClick={dismiss}
              aria-label="Close add to home screen hint"
            >
              Not now
            </button>
          </div>
        </div>
      </div>

      {showSteps && (
        <PWAInstallInstructions
          isOpen={showSteps}
          onClose={() => setShowSteps(false)}
          onDismissPermanent={dismiss}
          platform="ios"
        />
      )}
    </>
  );
};

export default AddToHomeScreenHint;
