import React from 'react';

interface ContentFilterWarningProps {
  category: 'phone' | 'platform' | 'email' | 'offplatform' | string | null;
  onDismiss: () => void;
}

export const ContentFilterWarning: React.FC<ContentFilterWarningProps> = ({ category, onDismiss }) => {
  const messages: Record<string, string> = {
    phone: "It looks like you're sharing a phone number.",
    platform: "It looks like you're referencing an outside platform.",
    email: "It looks like you're sharing an email address.",
    offplatform: "It looks like you're trying to move this conversation elsewhere.",
  };

  return (
    <div className="content-filter-warning" data-testid="content-filter-warning-member">
      <div className="cfm__icon">⚠️</div>
      <div className="cfm__content">
        <p className="cfm__title">Heads up — stay safe</p>
        <p className="cfm__body">
          {messages[category || ''] || 'This message may contain contact information.'}{' '}
          <strong>Beware of scammers.</strong> Moving conversations off this platform
          puts you at risk. We cannot protect you outside of this app.
        </p>
      </div>
      <button className="cfm__dismiss" onClick={onDismiss}>
        Got it
      </button>
    </div>
  );
};

interface ProviderContentWarningProps {
  onDismiss: () => void;
  onSendAnyway: () => void;
}

export const ProviderContentWarning: React.FC<ProviderContentWarningProps> = ({ onDismiss, onSendAnyway }) => {
  return (
    <div className="content-filter-warning content-filter-warning--provider" data-testid="content-filter-warning-provider">
      <div className="cfm__icon">🚫</div>
      <div className="cfm__content">
        <p className="cfm__title">Policy Violation Warning</p>
        <p className="cfm__body">
          Your message appears to contain contact information or an attempt
          to move this conversation off-platform. <strong>This violates our
          Provider Terms of Service.</strong>
        </p>
        <p className="cfm__body" style={{ marginTop: 6 }}>
          Repeated violations may result in suspension of your account
          and withholding of pending payouts.
        </p>
        <div className="cfm__actions">
          <button className="cfm__edit-btn" onClick={onDismiss}>
            Edit my message
          </button>
          <button className="cfm__send-anyway-btn" onClick={onSendAnyway}>
            Send anyway (I accept responsibility)
          </button>
        </div>
      </div>
    </div>
  );
};
