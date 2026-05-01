import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

export const initFirebase = () => {
  if (!FIREBASE_SERVICE_ACCOUNT || FIREBASE_SERVICE_ACCOUNT === 'undefined' || FIREBASE_SERVICE_ACCOUNT === 'null') {
    console.warn('FIREBASE_SERVICE_ACCOUNT not found or invalid in environment variables. Push notifications will be disabled.');
    return;
  }

  try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);

    // Fix for private key newlines if they are escaped as literal \n
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin: Failed to parse FIREBASE_SERVICE_ACCOUNT JSON.');
    console.error('Value of FIREBASE_SERVICE_ACCOUNT:', FIREBASE_SERVICE_ACCOUNT.substring(0, 100) + (FIREBASE_SERVICE_ACCOUNT.length > 100 ? '...' : ''));
    if (error instanceof Error) {
      console.error('Parsing error message:', error.message);
    }
  }
};

export default admin;
