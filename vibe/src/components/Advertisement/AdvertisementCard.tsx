import React, { useState, useEffect, useRef } from 'react';
import styles from './Advertisement.module.css';
import { EligibleAdvertisement } from './types';

export interface AdvertisementCardProps {
  ad: EligibleAdvertisement;
  onClose: () => void;
  onClickCTA?: (adId: string, clickUrl: string) => void;
  onAutoDismiss?: () => void;
}

export const AdvertisementCard: React.FC<AdvertisementCardProps> = ({
  ad,
  onClose,
  onClickCTA,
  onAutoDismiss,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(ad.closeAfterSeconds);
  const [displayRemaining, setDisplayRemaining] = useState<number>(ad.displayDurationSeconds);
  const [isCloseEnabled, setIsCloseEnabled] = useState<boolean>(ad.closeAfterSeconds <= 0);

  const expiresAtRef = useRef<number>(Date.now() + ad.displayDurationSeconds * 1000);
  const closeAfterRef = useRef<number>(Date.now() + ad.closeAfterSeconds * 1000);

  useEffect(() => {
    expiresAtRef.current = Date.now() + ad.displayDurationSeconds * 1000;
    closeAfterRef.current = Date.now() + ad.closeAfterSeconds * 1000;

    const interval = setInterval(() => {
      const now = Date.now();
      const closeDiff = Math.max(0, Math.ceil((closeAfterRef.current - now) / 1000));
      const displayDiff = Math.max(0, Math.ceil((expiresAtRef.current - now) / 1000));

      setSecondsRemaining(closeDiff);
      setDisplayRemaining(displayDiff);

      if (closeDiff <= 0) {
        setIsCloseEnabled(true);
      }

      if (displayDiff <= 0) {
        clearInterval(interval);
        if (onAutoDismiss) {
          onAutoDismiss();
        } else {
          onClose();
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [ad.id, ad.closeAfterSeconds, ad.displayDurationSeconds, onClose, onAutoDismiss]);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCloseEnabled) {
      onClose();
    }
  };

  const handleCTAClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ad.clickUrl) {
      if (onClickCTA) {
        onClickCTA(ad.id, ad.clickUrl);
      } else {
        window.open(ad.clickUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div
      className={styles.card}
      role="region"
      aria-label={`Sponsored Advertisement: ${ad.title}`}
      data-testid="advertisement-card"
    >
      <div className={styles.header}>
        <span className={styles.adBadge}>
          📢 Sponsored
        </span>
        <button
          type="button"
          onClick={handleClose}
          disabled={!isCloseEnabled}
          aria-label={isCloseEnabled ? "Close advertisement" : `Close disabled, available in ${secondsRemaining} seconds`}
          className={`${styles.closeButton} ${
            isCloseEnabled ? styles.closeButtonEnabled : styles.closeButtonDisabled
          }`}
          data-testid="ad-close-button"
        >
          {isCloseEnabled ? (
            <>✕ Close</>
          ) : (
            <>⏱ Close in {secondsRemaining}s</>
          )}
        </button>
      </div>

      <div className={styles.mediaContainer}>
        {ad.mediaType === 'video' ? (
          <video
            src={ad.mediaUrl}
            poster={ad.thumbnailUrl || undefined}
            autoPlay
            muted
            loop
            playsInline
            className={styles.mediaVideo}
            aria-label={ad.title}
            data-testid="ad-video"
          />
        ) : (
          <img
            src={ad.mediaUrl}
            alt={ad.title || 'Sponsored Advertisement'}
            className={styles.mediaImage}
            data-testid="ad-image"
          />
        )}
      </div>

      <div className={styles.content}>
        <h3 className={styles.title}>{ad.title}</h3>
        {ad.description && <p className={styles.description}>{ad.description}</p>}

        <div className={styles.footer}>
          {ad.clickUrl ? (
            <button
              type="button"
              onClick={handleCTAClick}
              className={styles.ctaButton}
              data-testid="ad-cta-button"
            >
              Learn More ↗
            </button>
          ) : (
            <div />
          )}

          <span className={styles.timerProgress} title="Auto-dismiss timer">
            Auto-close: {displayRemaining}s
          </span>
        </div>
      </div>
    </div>
  );
};
