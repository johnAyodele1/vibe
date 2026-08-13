import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { usePWAPromptStore } from '../../store/pwaPromptStore';

export const TestNotificationPrompt: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAdultAuth();
  const { showTestNotifPrompt, setShowTestNotifPrompt } = usePWAPromptStore();

  if (!showTestNotifPrompt) return null;

  const handleTestClick = () => {
    const isProvider = user?.role === 'provider';
    const settingsUrl = isProvider
      ? '/adult/provider/settings?section=notifications'
      : '/adult/settings?section=notifications';

    navigate(settingsUrl);
    setShowTestNotifPrompt(false);

    // Smooth scroll and brief highlight animation after navigation
    setTimeout(() => {
      const el = document.getElementById('push-test-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('settings-section--highlight');
        setTimeout(() => el.classList.remove('settings-section--highlight'), 2000);
      }
    }, 500);
  };

  const handleDismiss = () => {
    setShowTestNotifPrompt(false);
  };

  return (
    <div className="notif-prompt" data-testid="test-notification-prompt">
      <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
      <div className="notif-prompt__text">
        <strong>Test your notifications</strong>
        <p>Notifications are enabled! Tap below to verify they are connected and working correctly.</p>
      </div>
      <div className="notif-prompt__actions">
        <button
          className="notif-prompt__enable"
          onClick={handleTestClick}
          style={{ cursor: 'pointer' }}
        >
          Test Now →
        </button>
        <button
          className="notif-prompt__dismiss"
          onClick={handleDismiss}
          style={{ cursor: 'pointer' }}
        >
          Not now
        </button>
      </div>
    </div>
  );
};

export default TestNotificationPrompt;
