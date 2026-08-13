import React from 'react';

/**
 * Kept as a compatibility boundary for AdultZoneLayout.
 * NotificationPrompt already owns the notification enable/repair/test UX,
 * so this component intentionally renders nothing to avoid duplicate prompts.
 */
export const TestNotificationPrompt: React.FC = () => null;

export default TestNotificationPrompt;
