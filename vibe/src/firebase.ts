import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";
import { API_BASE_URL } from "./config";

let messagingPromise: Promise<Messaging | null> | null = null;
let firebaseConfigCache: any = null;

const fetchFirebaseConfig = async () => {
  if (firebaseConfigCache) return firebaseConfigCache;
  try {
    const url = `${API_BASE_URL}/config/firebase`;
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch firebase config from ${url}: ${response.status} ${response.statusText} - ${errorText}`);
    }
    firebaseConfigCache = await response.json();
    return firebaseConfigCache;
  } catch (error) {
    console.error('Error fetching firebase config:', error);
    return null;
  }
};

const initFirebase = async (): Promise<Messaging | null> => {
  if (messagingPromise) return messagingPromise;

  messagingPromise = (async () => {
    const firebaseConfig = await fetchFirebaseConfig();
    if (!firebaseConfig) return null;

    const app = initializeApp(firebaseConfig);
    return getMessaging(app);
  })();

  return messagingPromise;
};

export const requestForToken = async (serviceWorkerRegistration?: ServiceWorkerRegistration) => {
  try {
    // Only attempt to get token if permission is already granted
    if (Notification.permission !== 'granted') {
      console.log('Notification permission not granted. Skipping token retrieval.');
      return null;
    }

    const messaging = await initFirebase();
    if (!messaging) {
      console.warn('Firebase Messaging not initialized. Cannot request token.');
      return null;
    }

    const config = await fetchFirebaseConfig();
    const vapidKey = config?.vapidKey || import.meta.env.VITE_FIREBASE_VAPID_KEY;

    if (!vapidKey) {
      console.warn('VAPID key is missing. Push notifications will not work.');
    }

    const currentToken = await getToken(messaging, {
      vapidKey: vapidKey,
      serviceWorkerRegistration: serviceWorkerRegistration,
    });

    if (currentToken) {
      return currentToken;
    } else {
      console.log('No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (err) {
    console.error('An error occurred while retrieving FCM token:', err);
    return null;
  }
};

export const onMessageListener = (callback: (payload: any) => void) => {
  let unsubscribe: (() => void) | null = null;
  let isCancelled = false;

  initFirebase().then(messaging => {
    if (messaging && !isCancelled) {
      unsubscribe = onMessage(messaging, (payload) => {
        callback(payload);
      });
    }
  });

  return () => {
    isCancelled = true;
    if (unsubscribe) {
      unsubscribe();
    }
  };
};
