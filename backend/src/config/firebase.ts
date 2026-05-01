import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

export const initFirebase = () => {
  if (!FIREBASE_SERVICE_ACCOUNT) {
    console.warn('FIREBASE_SERVICE_ACCOUNT not found in environment variables. Push notifications will be disabled.');
    return;
  }

  try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
  }
};

export default admin;
