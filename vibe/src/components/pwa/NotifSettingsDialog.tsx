import React, { useState, useEffect } from 'react';
import { getInstallContext } from '../../lib/pwa/context';
import { runPushSelfTest } from '../../lib/pwa/pushSelfTest';
import { toast } from 'sonner';

export const NotifSettingsDialog: React.FC<{ userId: string }> = ({ userId }) => {
  const [visible, setVisible] = useState(false);
  const [ctx, setCtx] = useState<ReturnType<typeof getInstallContext> | null>(null);

  useEffect(() => {
    setCtx(getInstallContext());
    const handler = () => setVisible(true);
    window.addEventListener('zippo:show_notif_settings', handler);
    return () => window.removeEventListener('zippo:show_notif_settings', handler);
  }, []);

  const handleReject = () => {
    localStorage.setItem('zippo_push_user_rejected', '1');
    setVisible(false);
    toast.info('You can enable notifications later in Settings');
  };

  if (!visible || !ctx) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[12000] flex items-center justify-center p-4">
      <div className="bg-[#120a0e] border border-[var(--az-border)] shadow-[0_0_20px_var(--az-glow)] rounded-2xl p-6 max-w-sm w-full text-white">
        <div className="text-4xl text-center mb-4">🔔</div>
        <h3 className="text-xl font-bold text-center mb-2">Enable Notifications</h3>
        <p className="text-sm text-[var(--az-text-secondary)] text-center mb-4">
          Push notifications aren't reaching your device. Here's how to fix it:
        </p>

        {ctx.isIOS ? (
          <ol className="list-decimal pl-5 text-sm text-[var(--az-text-secondary)] space-y-2 mb-6">
            <li>Open your iPhone <strong>Settings</strong></li>
            <li>Scroll down and tap <strong>Zippo</strong> (or Safari)</li>
            <li>Tap <strong>Notifications</strong></li>
            <li>Enable <strong>Allow Notifications</strong></li>
            <li>Come back and try again</li>
          </ol>
        ) : (
          <ol className="list-decimal pl-5 text-sm text-[var(--az-text-secondary)] space-y-2 mb-6">
            <li>Open <strong>Chrome Settings</strong> (three dots menu)</li>
            <li>Tap <strong>Notifications</strong></li>
            <li>Find <strong>zippo.com.ng</strong> and enable it</li>
            <li>Come back and try again</li>
          </ol>
        )}

        <div className="flex flex-col gap-2">
          <button
            className="w-full bg-[var(--az-accent-primary)] hover:bg-[var(--az-accent-rose)] text-white font-bold py-2.5 rounded-full text-sm transition-colors cursor-pointer"
            onClick={async () => {
              setVisible(false);
              await runPushSelfTest(userId);
            }}
          >
            I Fixed It — Try Again
          </button>
          <button
            className="w-full bg-transparent hover:bg-white/5 text-[var(--az-text-muted)] hover:text-white py-2 rounded-full text-sm transition-colors cursor-pointer"
            onClick={handleReject}
          >
            Don't Enable
          </button>
        </div>
      </div>
    </div>
  );
};
