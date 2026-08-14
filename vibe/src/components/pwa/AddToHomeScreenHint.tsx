import { useEffect, useState } from 'react';

const AddToHomeScreenHint = ({ onDismiss }: { onDismiss: () => void }) => {
  const [visible, setVisible] = useState(true);

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
    <div className="notif-prompt" data-testid="aths-hint" role="status" aria-live="polite">
      <div className="notif-prompt__icon" aria-hidden="true">🔔</div>
      <div className="notif-prompt__text">
        <strong>Add Zippo to your Home Screen</strong>
        <p>
          On iPhone, tap <strong>Share</strong>, then choose <strong>➕ Add to Home Screen</strong> to enable push notifications.
        </p>
      </div>
      <div className="notif-prompt__actions">
        <button className="notif-prompt__enable" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          Show me how
        </button>
        <button className="notif-prompt__dismiss" onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
};

export default AddToHomeScreenHint;
