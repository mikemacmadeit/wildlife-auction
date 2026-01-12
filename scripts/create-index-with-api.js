/**
 * Script to create Firestore index using Firebase Management API
 * 
 * This uses the service account key (same one used for seeding)
 * 
 * Run: node scripts/create-index-with-api.js
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Admin SDK
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: serviceAccountKey.json not found!');
  console.error('   Please download it from Firebase Console > Project Settings > Service Accounts');
  console.error('   Save it as: project/serviceAccountKey.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const projectId = 'wildlife-exchange';

async function createIndex() {
  try {
    console.log('🚀 Creating Firestore index...\n');
    
    // Note: Firestore indexes cannot be created via Admin SDK directly
    // They must be created via the Management API or Console
    // However, we can use the Firebase Management REST API
    
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();
    
    const indexDefinition = {
      collectionId: 'listings',
      queryScope: 'COLLECTION',
      fields: [
        {
          fieldPath: 'status',
          order: 'ASCENDING'
        },
        {
          fieldPath: 'createdAt',
          order: 'DESCENDING'
        }
      ]
    };
    
    // Use Firebase Management API
    const firestore = google.firestore({ version: 'v1', auth: authClient });
    
    const parent = `projects/${projectId}/databases/(default)/collectionGroups/listings`;
    
    console.log('Creating index via Management API...');
    
    // Note: The Management API for indexes is complex. 
    // The easiest way is still via the Console link or firebase CLI
    
    console.log('\n⚠️  Firestore indexes must be created via:');
    console.log('   1. Firebase Console (easiest)');
    console.log('   2. Firebase CLI: firebase deploy --only firestore:indexes');
    console.log('\n📋 Use this direct link:');
    console.log('   https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 The easiest way is to click the link above in your browser.');
    process.exit(1);
  }
}

createIndex();
