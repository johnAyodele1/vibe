import { Request, Response } from 'express';

export const getFirebaseConfig = (req: Request, res: Response) => {
  if (!process.env.FIREBASE_VAPID_KEY) {
    console.warn('FIREBASE_VAPID_KEY is not set in environment variables. Web push notifications will fail.');
  }

  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCzkC4-w2E3Slp7w8UlOBPXDB2RTxFWxs4",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "zippodate.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "zippodate",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "zippodate.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "455173170033",
    appId: process.env.FIREBASE_APP_ID || "1:455173170033:web:228c739aa38754ccdd8cd0",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-RW7J2GVWB4",
    vapidKey: process.env.FIREBASE_VAPID_KEY
  };

  res.json(firebaseConfig);
};
