export const getInstallContext = () => {
  const nav = navigator as Navigator & { standalone?: boolean; userAgentData?: { platform?: string } };
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true;

  // iPadOS can identify itself as desktop Safari, so the touch-point check is
  // required in addition to the traditional iPhone/iPad user-agent match.
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isAndroid = /Android/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|Android/.test(navigator.userAgent);

  let iOSVersion: number | null = null;
  const iosMatch = navigator.userAgent.match(/OS (\d+)[_.]/);
  if (iosMatch) {
    iOSVersion = parseInt(iosMatch[1], 10);
  }

  const supportsPush = 'PushManager' in window && 'serviceWorker' in navigator;
  const pushSupportedOnThisDevice =
    isAndroid ||
    (isIOS && iOSVersion !== null && iOSVersion >= 16.4 && isStandalone);

  const notificationPermission = 'Notification' in window
    ? Notification.permission
    : null;

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
    alreadyGranted: notificationPermission === 'granted',
    denied: notificationPermission === 'denied',
  };
};
