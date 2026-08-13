import webpush from 'web-push';

export const initVAPID = (): boolean => {
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    console.error('[VAPID] ❌ MISSING VAPID KEYS — push will not work:', {
      hasPublic:  !!publicKey,
      hasPrivate: !!privateKey,
      hasSubject: !!subject,
    });
    return false;
  }

  // Validate the public key is valid base64url
  try {
    const decoded = Buffer.from(publicKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (decoded.length !== 65) {
      console.error('[VAPID] ❌ Public key length wrong:', decoded.length, '(expected 65)');
      return false;
    }
  } catch {
    console.error('[VAPID] ❌ Public key is not valid base64url');
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  console.log('[VAPID] ✅ Initialized:', {
    subject,
    publicKeyPrefix: publicKey.slice(0, 20) + '...',
    publicKeyLength: publicKey.length,
  });

  return true;
};
