import React, { useState, useEffect } from 'react';
import RewardsSheet from './RewardsSheet';

const REWARDS_DISMISSED_KEY = 'az_rewards_dismissed_date';

export const RewardsButton: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    // Only hide if dismissed TODAY (resets daily)
    const dismissedDate = localStorage.getItem(REWARDS_DISMISSED_KEY);
    const today = new Date().toDateString();
    if (dismissedDate !== today) {
      const t = setTimeout(() => {
        setVisible(true);
        const animT = setTimeout(() => setAnimateIn(true), 50);
        return () => clearTimeout(animT);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnimateIn(false);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem(REWARDS_DISMISSED_KEY, new Date().toDateString());
    }, 300);
  };

  if (!visible) return null;

  return (
    <>
      {/* The circular button */}
      <div className={`rewards-btn ${animateIn ? 'rewards-btn--visible' : ''}`}>
        <button className="rewards-btn__dismiss" onClick={handleDismiss} aria-label="Dismiss rewards">
          ×
        </button>

        <button
          className="rewards-btn__circle"
          onClick={() => setSheetOpen(true)}
        >
          <svg className="rewards-btn__text-ring" viewBox="0 0 140 140" width="140" height="140">
            <defs>
              <path id="rewards-circle" d="M 70,70 m -50,0 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0"/>
            </defs>
            <text className="rewards-btn__circular-text">
              <textPath href="#rewards-circle" startOffset="0%">
                Free Rewards • Daily Tasks • Free Credits •&nbsp;
              </textPath>
            </text>
          </svg>
          <div className="rewards-btn__center">
            <span>🎁</span>
          </div>
        </button>
      </div>

      {/* Rewards sheet */}
      {sheetOpen && <RewardsSheet onClose={() => setSheetOpen(false)} />}
    </>
  );
};

export default RewardsButton;
