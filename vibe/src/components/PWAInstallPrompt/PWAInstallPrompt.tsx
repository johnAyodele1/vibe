import React, { useState, useEffect } from 'react';
import { usePWA } from '../../contexts/PWAContext';
import styles from './PWAInstallPrompt.module.css';

const Icon = ({ name, className = "" }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined ${className}`}>{name}</span>
);

const PWAInstallPrompt: React.FC = () => {
  const { isStandalone, isIOS, installApp, isInstallable } = usePWA();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show prompt if not in standalone mode
    if (!isStandalone) {
      // Small delay to ensure smooth entry
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isStandalone]);

  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <button className={styles.closeBtn} onClick={() => setIsVisible(false)}>
          <Icon name="close" />
        </button>

        <div className={styles.header}>
          <div className={styles.logoContainer}>
            <img src="/favicon.svg" alt="Vibe" className={styles.logo} />
          </div>
          <div className={styles.titleInfo}>
            <h3 className={styles.title}>Install Vibe</h3>
            <p className={styles.subtitle}>Install the app to enable push notifications and a better experience.</p>
          </div>
        </div>

        <div className={styles.content}>
          {isIOS ? (
            <div className={styles.iosInstructions}>
              <p className={styles.instructionText}>
                To install Vibe on your iPhone:
              </p>
              <ol className={styles.steps}>
                <li className={styles.step}>
                  Tap the <Icon name="ios_share" className={styles.inlineIcon} /> <strong>Share</strong> button in Safari.
                </li>
                <li className={styles.step}>
                  Scroll down and tap <strong>Add to Home Screen</strong> <Icon name="add_box" className={styles.inlineIcon} />.
                </li>
                <li className={styles.step}>
                  Tap <strong>Add</strong> in the top right corner.
                </li>
              </ol>
            </div>
          ) : (
            <div className={styles.androidActions}>
              {isInstallable ? (
                <button className={styles.installBtn} onClick={installApp}>
                  Install App
                </button>
              ) : (
                <p className={styles.fallbackText}>
                  Open your browser menu and select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong> to get started.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
