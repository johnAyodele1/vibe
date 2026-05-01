import { Request, Response } from 'express';

export const getFirebaseConfig = (req: Request, res: Response) => {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCzkC4-w2E3Slp7w8UlOBPXDB2RTxFWxs4",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "zippodate.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "zippodate",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "zippodate.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "455173170033",
    appId: process.env.FIREBASE_APP_ID || "1:455173170033:web:228c739aa38754ccdd8cd0",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-RW7J2GVWB4",
    vapidKey: process.env.FIREBASE_VAPID_KEY || "BIyU6V-38fJ9YJp8e6yXj-H3G-U-Q-O-I-U-E-R-O-S-I-G-H-T-S" // This is just a placeholder, the user didn't provide a real one but I should probably include it if they use it.
  };

  res.json(firebaseConfig);
};
