/**
 * Script to set a user as super_admin in Firestore
 * Run with: npx tsx scripts/set-admin-role.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local file manually
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const envFile = readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};
    
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          envVars[key.trim()] = value.trim();
        }
      }
    });
    
    // Set environment variables
    Object.assign(process.env, envVars);
  } catch (error) {
    console.error('Warning: Could not load .env.local file:', error);
  }
}

loadEnv();

// Initialize Firebase Admin
if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_PRIVATE_KEY
    ? {
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }
    : undefined;

  if (serviceAccount?.projectId && serviceAccount?.clientEmail && serviceAccount?.privateKey) {
    initializeApp({
      credential: cert(serviceAccount as any),
    });
  } else {
    console.error('❌ Firebase Admin credentials not found.');
    console.error('Make sure .env.local has:');
    console.error('  - FIREBASE_PROJECT_ID');
    console.error('  - FIREBASE_CLIENT_EMAIL');
    console.error('  - FIREBASE_PRIVATE_KEY');
    throw new Error('Firebase Admin credentials not found. Check your .env.local file.');
  }
}

const db = getFirestore();
const auth = getAuth();

async function setAdminRole(email: string) {
  try {
    console.log(`Looking up user with email: ${email}`);
    
    // Find user by email
    const user = await auth.getUserByEmail(email);
    console.log(`Found user: ${user.uid} (${user.email})`);
    
    // 1) Firestore (source of truth for fallback)
    const userRef = db.collection('users').doc(user.uid);
    await userRef.set({
      role: 'super_admin',
    }, { merge: true });

    // 2) Firebase Auth custom claims (so token has role and admin nav shows without re-fetching profile)
    await auth.setCustomUserClaims(user.uid, { role: 'super_admin', superAdmin: true });
    
    console.log(`✅ Successfully set ${email} as super_admin`);
    console.log(`User ID: ${user.uid}`);
    console.log(`→ User must sign out and sign back in (or refresh to get a new token) for admin dashboard to appear.`);
    
    // Verify the update
    const userDoc = await userRef.get();
    const userData = userDoc.data();
    console.log(`Verified Firestore role: ${userData?.role}`);
    
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ User with email ${email} not found`);
    } else {
      console.error('❌ Error setting admin role:', error);
    }
    process.exit(1);
  }
}

// Get email from command line or use default
const email = process.argv[2] || 'usalandspecialist@gmail.com';

setAdminRole(email)
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
