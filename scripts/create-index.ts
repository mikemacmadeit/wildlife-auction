/**
 * Create Firestore index using Firebase Management API
 * 
 * Run: npx tsx scripts/create-index.ts
 */

const admin = require('firebase-admin');
import * as path from 'path';
import * as fs from 'fs';

// Initialize Admin SDK
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: serviceAccountKey.json not found!');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function createIndex() {
  try {
    console.log('🚀 Creating Firestore index via Management API...\n');
    
    // Use Google APIs client library
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    
    const authClient = await auth.getClient();
    const projectId = 'wildlife-exchange';
    
    // Use Firestore Admin API
    const firestore = google.firestore('v1');
    
    const parent = `projects/${projectId}/databases/(default)`;
    
    // Index definition
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
    
    console.log('Creating index:', JSON.stringify(indexDefinition, null, 2));
    
    // Create the index
    const response = await firestore.projects.databases.collectionGroups.indexes.create({
      parent: `${parent}/collectionGroups/listings`,
      requestBody: indexDefinition,
      auth: authClient,
    });
    
    console.log('\n✅ Index created successfully!');
    console.log('Index name:', response.data.name);
    console.log('\n⏳ The index will build in 1-2 minutes.');
    console.log('   Check status at: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes');
    
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('\n✅ Index already exists!');
      console.log('   It may still be building. Check status at:');
      console.log('   https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes');
    } else {
      console.error('\n❌ Error creating index:', error.message);
      console.error('\n💡 Alternative: Click this link to create it manually:');
      console.error('   https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg');
      process.exit(1);
    }
  }
}

createIndex()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
