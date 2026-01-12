/**
 * Create Firestore index using Google Cloud Firestore Admin API
 */

const admin = require('firebase-admin');
import * as path from 'path';
import * as fs from 'fs';
import { google } from 'googleapis';

// Initialize
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function createIndex() {
  try {
    console.log('🚀 Creating Firestore index...\n');
    
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    
    const authClient = await auth.getClient();
    const projectId = 'wildlife-exchange';
    
    // Use Firestore Admin API v1
    const firestore = google.firestore('v1');
    
    const parent = `projects/${projectId}/databases/(default)/collectionGroups/listings`;
    
    // Correct index format for Firestore Admin API
    const index = {
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
    
    console.log('Creating index with fields: status (ASC), createdAt (DESC)');
    
    const response = await firestore.projects.databases.collectionGroups.indexes.create({
      parent: parent,
      requestBody: index,
    }, {
      auth: authClient,
    });
    
    console.log('\n✅ Index created successfully!');
    console.log('Index ID:', response.data.name);
    console.log('\n⏳ The index will build in 1-2 minutes.');
    console.log('   Once ready, your listings will appear!');
    console.log('\n   Check status: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes');
    
  } catch (error: any) {
    if (error.message?.includes('already exists') || error.code === 409) {
      console.log('\n✅ Index already exists!');
      console.log('   It may still be building. Check status at:');
      console.log('   https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes');
      console.log('\n   If it shows "Enabled", your listings should appear now!');
    } else {
      console.error('\n❌ Error:', error.message);
      console.error('\n💡 The Management API requires specific permissions.');
      console.error('   Please click this link to create it manually (takes 10 seconds):');
      console.error('   https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg');
    }
  }
}

createIndex()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error.message);
    process.exit(1);
  });
