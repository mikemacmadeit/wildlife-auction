import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAnalytics, Analytics, isSupported } from 'firebase/analytics';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Firebase configuration - MUST use environment variables (no hardcoded secrets!)
// All values must be set via environment variables for security
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate required config values
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  if (typeof window !== 'undefined') {
    console.error('❌ Firebase configuration is incomplete!');
    console.error('Please set the following environment variables:');
    console.error('  - NEXT_PUBLIC_FIREBASE_API_KEY');
    console.error('  - NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    console.error('  - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
    console.error('\nCreate a .env.local file in the project root with these values.');
  } else {
    console.warn('Firebase configuration is incomplete. Please check your environment variables.');
  }
}

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let analytics: Analytics | null = null;

if (typeof window !== 'undefined') {
  // Client-side initialization
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  
  // Initialize Analytics (only on client-side, async)
  isSupported().then((supported) => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch (error) {
        console.warn('Analytics initialization failed:', error);
      }
    }
  }).catch((error) => {
    console.warn('Analytics not supported:', error);
  });
} else {
  // Server-side - initialize only if not already initialized
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  // Note: Auth and Storage need to be initialized on client-side only
  // For server-side operations, use Firebase Admin SDK
}

export { app, auth, db, storage, analytics };
