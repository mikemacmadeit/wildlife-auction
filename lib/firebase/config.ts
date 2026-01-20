import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAnalytics, Analytics, isSupported } from 'firebase/analytics';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, setLogLevel } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Firebase configuration - MUST use environment variables (no hardcoded secrets!)
// All values must be set via environment variables for security
function normalizeStorageBucket(input: string | undefined, projectId: string | undefined): string | undefined {
  const raw = input?.trim();
  let bucket = raw;
  if (!bucket) return input;
  const pid = projectId?.trim();
  if (!pid) return bucket;

  // Accept common forms:
  // - "gs://<bucket>"
  // - "https://storage.googleapis.com/<bucket>"
  // - "<bucket>"
  bucket = bucket.replace(/^gs:\/\//i, '');
  bucket = bucket.replace(/^https?:\/\/storage\.googleapis\.com\//i, '');
  bucket = bucket.replace(/\/+$/g, ''); // trailing slashes

  // Firebase projects can have either default bucket naming scheme:
  // - Legacy: `${projectId}.appspot.com`
  // - Newer:  `${projectId}.firebasestorage.app`
  //
  // For this repo's Firebase project, the active bucket is `${projectId}.firebasestorage.app`.
  // If env is set to the legacy form, normalize to the actual bucket to avoid 404/CORS failures.
  if (bucket === `${pid}.appspot.com`) return `${pid}.firebasestorage.app`;
  // Some environments provide the legacy bucket with small variations; normalize those too.
  if (bucket.toLowerCase().startsWith(`${pid.toLowerCase()}.`) && bucket.toLowerCase().endsWith('.appspot.com')) {
    return `${pid}.firebasestorage.app`;
  }

  return bucket;
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: normalizeStorageBucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
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

  // Dev diagnostics: if auth/project/bucket are mismatched, you'll see rules "permission-denied" even after deploy.
  // Don't rely on NODE_ENV (some environments set it to non-standard values); just log on localhost.
  try {
    const host = window.location?.hostname || '';
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.localhost');

    // Firestore SDK can emit noisy internal warnings in some versions (e.g. BloomFilterError).
    // In production, keep logs at "error" to avoid spamming the console while still surfacing real failures.
    // In local dev, keep the default verbosity to help debugging.
    if (!isLocal) {
      try {
        setLogLevel('error');
      } catch {
        // ignore
      }
    }
    if (isLocal) {
      // eslint-disable-next-line no-console
      console.log('[firebase] client config', {
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        authDomain: firebaseConfig.authDomain,
      });
    }
  } catch {
    // ignore
  }
  
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
