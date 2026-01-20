/**
 * Patch script to fix Next.js generateBuildId bug
 * This fixes the "generate is not a function" error that occurs
 * when config.generateBuildId is undefined
 */
const fs = require('fs');
const path = require('path');

const generateBuildIdPath = path.join(__dirname, '../node_modules/next/dist/build/generate-build-id.js');

if (fs.existsSync(generateBuildIdPath)) {
  let content = fs.readFileSync(generateBuildIdPath, 'utf8');
  
  // Check if patch is already applied
  if (content.includes('typeof generate !== "function"')) {
    console.log('✓ Next.js patch already applied');
    return;
  }
  
  // Apply the patch
  // Next.js internal: generateBuildId(generate, fallback) expects `generate` to be a function.
  // In some environments/configs it may be undefined; in that case, safely fall back to `fallback`.
  const patchedContent = content.replace(
    /async function generateBuildId\(generate, fallback\) \{/,
    `async function generateBuildId(generate, fallback) {
    if (typeof generate !== "function") {
        generate = fallback;
    }`
  );
  
  if (content !== patchedContent) {
    fs.writeFileSync(generateBuildIdPath, patchedContent, 'utf8');
    console.log('✓ Next.js patch applied successfully');
  } else {
    console.log('⚠ Could not apply Next.js patch (pattern not found)');
  }
} else {
  console.log('⚠ Next.js build file not found, patch skipped');
}
