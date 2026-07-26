import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'az_dating_promo_dismissed';

export const DatingCrossPromo: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) {
      // Delay appearance — show 2 seconds after page load
      const t = setTimeout(() => {
        setVisible(true);
        const animT = setTimeout(() => setAnimateIn(true), 50);
        return () => clearTimeout(animT);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAnimateIn(false);
    setTimeout(() => {
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, '1');
    }, 300);
  };

  if (!visible) return null;

  return (
    <div className={`dating-promo ${animateIn ? 'dating-promo--visible' : ''}`}>
      {/* Dismiss X button */}
      <button className="dating-promo__dismiss" onClick={handleDismiss} aria-label="Dismiss promo">
        ×
      </button>

      {/* Circular link */}
      <a href="https://zippo.com.ng/dating" className="dating-promo__circle" target="_blank" rel="noopener noreferrer">
        {/* SVG circular text */}
        <svg
          className="dating-promo__text-ring"
          viewBox="0 0 140 140"
          width="140"
          height="140"
        >
          <defs>
            <path
              id="circle-path"
              d="M 70,70 m -50,0 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0"
            />
          </defs>
          <text className="dating-promo__circular-text">
            <textPath href="#circle-path" startOffset="0%">
              Want something deeper? Want something deeper? &nbsp;
            </textPath>
          </text>
        </svg>

        {/* Center emoji — lightweight, no image */}
        <div className="dating-promo__center">
          <span className="dating-promo__emoji">❤️</span>
        </div>
      </a>
    </div>
  );
};

export default DatingCrossPromo;
