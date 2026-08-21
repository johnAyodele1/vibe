import React from 'react';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen';

interface MessageTickProps {
  status?: MessageStatus;
  message?: {
    deliveredAt?: string | Date | null;
    readAt?: string | Date | null;
    isOptimistic?: boolean;
  };
}

// Optimization (⚡ Bolt): Memoize icons and status tick component to prevent redundant re-renders in chat message streams.
export const CheckIcon: React.FC<{ size?: number; className?: string }> = React.memo(({ size = 12, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    className={className}
  >
    <path
      d="M1.5 6L4.5 9L10.5 3"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
));

export const ClockIcon: React.FC<{ size?: number }> = React.memo(({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <circle cx={6} cy={6} r={4.5} stroke="currentColor" strokeWidth={1.5} />
    <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </svg>
));

// Derive status from message fields:
/* eslint-disable-next-line react-refresh/only-export-components */
export const getMessageStatus = (message: {
  deliveredAt?: string | Date | null;
  readAt?:       string | Date | null;
  isOptimistic?: boolean;
}): MessageStatus => {
  if (message.isOptimistic) return 'sending';
  if (message.readAt)       return 'seen';
  if (message.deliveredAt)  return 'delivered';
  return 'sent';
};

const MessageTick: React.FC<MessageTickProps> = React.memo(({ status, message }) => {
  const effectiveStatus = status || (message ? getMessageStatus(message) : 'sent');

  if (effectiveStatus === 'sending') {
    return (
      <span className="msg-tick msg-tick--sending" aria-label="Sending">
        <ClockIcon size={12} />
      </span>
    );
  }

  if (effectiveStatus === 'sent') {
    return (
      <span className="msg-tick msg-tick--sent" aria-label="Sent">
        <CheckIcon size={12} />
      </span>
    );
  }

  if (effectiveStatus === 'delivered') {
    return (
      <span className="msg-tick msg-tick--delivered" aria-label="Delivered">
        <CheckIcon size={12} />
        <CheckIcon size={12} className="msg-tick__second" />
      </span>
    );
  }

  if (effectiveStatus === 'seen') {
    return (
      <span className="msg-tick msg-tick--seen" aria-label="Seen">
        <CheckIcon size={12} />
        <CheckIcon size={12} className="msg-tick__second" />
      </span>
    );
  }

  return null;
});

export default MessageTick;
