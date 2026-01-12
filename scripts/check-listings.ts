/**
 * Check listings in Firestore
 */

const admin = require('firebase-admin');
import * as path from 'path';
import * as fs from 'fs';

// Initialize Admin SDK
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkListings() {
  try {
    console.log('🔍 Checking listings in Firestore...\n');
    
    // Get all listings
    const listingsSnapshot = await db.collection('listings').get();
    
    console.log(`📊 Found ${listingsSnapshot.size} listing(s) in Firestore\n`);
    
    if (listingsSnapshot.size === 0) {
      console.log('⚠️  No listings found!');
      console.log('   Make sure you ran the seed script successfully.');
      return;
    }
    
    // List all listings
    listingsSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`✅ ${data.title || 'Untitled'}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Status: ${data.status || 'unknown'}`);
      console.log(`   Type: ${data.type || 'unknown'}`);
      console.log(`   Seller: ${data.sellerSnapshot?.displayName || data.sellerId || 'unknown'}`);
      console.log('');
    });
    
    // Check active listings specifically
    const activeListings = listingsSnapshot.docs.filter(
      doc => doc.data().status === 'active'
    );
    
    console.log(`\n📈 Summary:`);
    console.log(`   Total listings: ${listingsSnapshot.size}`);
    console.log(`   Active listings: ${activeListings.length}`);
    console.log(`   Other status: ${listingsSnapshot.size - activeListings.length}`);
    
    if (activeListings.length > 0) {
      console.log(`\n✅ Your listings should now appear on the website!`);
      console.log(`   Try refreshing your browser.`);
    } else {
      console.log(`\n⚠️  No active listings found.`);
      console.log(`   Listings may have a different status.`);
    }
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.message?.includes('index')) {
      console.error('\n💡 The index may still be building.');
      console.error('   Wait 1-2 minutes and try again.');
    }
  }
}

checkListings()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
