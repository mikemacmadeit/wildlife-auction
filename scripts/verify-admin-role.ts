/**
 * Script to verify admin role in Firestore
 * Run with: npx tsx scripts/verify-admin-role.ts
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
    throw new Error('Firebase Admin credentials not found.');
  }
}

const db = getFirestore();
const auth = getAuth();

async function verifyAdminRole(email: string) {
  try {
    console.log(`Looking up user: ${email}`);
    const user = await auth.getUserByEmail(email);
    console.log(`Found user ID: ${user.uid}`);
    
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      console.log('❌ User document does not exist in Firestore');
      return;
    }
    
    const userData = userDoc.data();
    console.log('\n=== User Document Data ===');
    console.log(JSON.stringify(userData, null, 2));
    console.log('\n=== Role Check ===');
    console.log('role field:', userData?.role);
    console.log('superAdmin field:', userData?.superAdmin);
    console.log('isAdmin (role check):', userData?.role === 'admin' || userData?.role === 'super_admin');
    console.log('isSuperAdmin:', userData?.role === 'super_admin');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

const email = process.argv[2] || 'usalandspecialist@gmail.com';
verifyAdminRole(email)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
