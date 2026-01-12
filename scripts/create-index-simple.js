/**
 * Simple script to create Firestore index
 * Uses the direct Firebase Console link (opens browser)
 */

const { exec } = require('child_process');
const url = 'https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClJwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvbGlzdGluZ3MvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg';

console.log('🌐 Opening Firebase Console to create index...\n');
console.log('📋 Instructions:');
console.log('   1. The browser should open automatically');
console.log('   2. Click "Create Index" button');
console.log('   3. Wait 1-2 minutes for the index to build');
console.log('   4. Your listings will appear once the index is ready!\n');

// Open in default browser
if (process.platform === 'win32') {
  exec(`start ${url}`);
} else if (process.platform === 'darwin') {
  exec(`open ${url}`);
} else {
  exec(`xdg-open ${url}`);
}

console.log('✅ Browser opened!');
console.log('\n💡 If the browser didn\'t open, click this link manually:');
console.log(`   ${url}`);
