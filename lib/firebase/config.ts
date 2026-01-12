import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAnalytics, Analytics, isSupported } from 'firebase/analytics';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBXBK_jtB_grkJ_GwCXeHoM9ce0dEx2lrc",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "wildlife-exchange.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "wildlife-exchange",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "wildlife-exchange.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "997321283928",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:997321283928:web:75a1cb8fe4cfc0e5c76d2d",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-MEELFLSGMC",
};

// Validate required config values
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.warn('Firebase configuration is incomplete. Please check your environment variables.');
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
