/**
 * Script to deploy Firestore index
 * 
 * Prerequisites:
 * 1. Run: firebase login
 * 2. Then run: node scripts/deploy-index.js
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Deploying Firestore index...\n');

try {
  const projectDir = path.join(__dirname, '..');
  process.chdir(projectDir);
  
  // Deploy only the indexes
  execSync('firebase deploy --only firestore:indexes', {
    stdio: 'inherit',
    cwd: projectDir
  });
  
  console.log('\n✅ Index deployed successfully!');
  console.log('⏳ It may take 1-2 minutes for the index to build.');
  console.log('   Check status at: https://console.firebase.google.com/project/wildlife-exchange/firestore/indexes');
} catch (error) {
  console.error('\n❌ Error deploying index:', error.message);
  console.log('\n💡 Alternative: Use the direct link to create the index:');
  console.log('   https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg');
  process.exit(1);
}
