export const getInstallContext = () => {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;  // iOS Safari legacy check

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  const isAndroid = /Android/.test(navigator.userAgent);

  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

  // Get iOS version
  let iOSVersion: number | null = null;
  const match = navigator.userAgent.match(/OS (\d+)_/);
  if (match) iOSVersion = parseInt(match[1]);

  const supportsPush = 'PushManager' in window && 'serviceWorker' in navigator;

  const pushSupportedOnThisDevice =
    isAndroid ||                                    // Android always supported (Chrome)
    (isIOS && iOSVersion !== null && iOSVersion >= 16.4 && isStandalone);
    // iOS only when installed AND 16.4+

  const notificationPermission = 'Notification' in window
    ? Notification.permission   // 'default' | 'granted' | 'denied'
    : null;

  console.log('[PWA] Context detected:', {
    isStandalone,
    isIOS,
    isAndroid,
    isSafari,
    iOSVersion,
    supportsPush,
    pushSupportedOnThisDevice,
    notificationPermission,
  });

  return {
    isStandalone,
    isIOS,
    isAndroid,
    isSafari,
    iOSVersion,
    supportsPush,
    pushSupportedOnThisDevice,
    notificationPermission,
    canRequestPermission: pushSupportedOnThisDevice && notificationPermission === 'default',
    alreadyGranted:       notificationPermission === 'granted',
    denied:               notificationPermission === 'denied',
  };
};
