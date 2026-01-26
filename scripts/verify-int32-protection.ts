/**
 * Verify Int32 Protection
 * 
 * This script checks that all Firestore write operations in API routes
 * are using sanitization. It's a build-time check to ensure we don't
 * accidentally introduce unsafe writes.
 * 
 * Run: npx ts-node scripts/verify-int32-protection.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const API_DIR = join(process.cwd(), 'app', 'api');
const SAFE_IMPORTS = [
  'sanitizeFirestorePayload',
  'safeUpdate',
  'safeSet',
  'safeAdd',
  'safeCreate',
  'safeFirestore',
];

interface Finding {
  file: string;
  line: number;
  operation: string;
  hasSanitization: boolean;
}

function findUnsafeWrites(dir: string, findings: Finding[] = []): Finding[] {
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      findUnsafeWrites(fullPath, findings);
      continue;
    }

    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) {
      continue;
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      // Check if file has safe imports
      const hasSafeImport = SAFE_IMPORTS.some(imp => content.includes(imp));

      // Find all Firestore write operations
      const writePatterns = [
        /\.update\s*\(/g,
        /\.set\s*\(/g,
        /\.add\s*\(/g,
        /\.create\s*\(/g,
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Check for unsafe writes
        if (writePatterns.some(pattern => pattern.test(line))) {
          // Check if this line uses safe wrapper
          const usesSafeWrapper = line.includes('safeUpdate') ||
            line.includes('safeSet') ||
            line.includes('safeAdd') ||
            line.includes('safeCreate') ||
            line.includes('sanitizeFirestorePayload');

          if (!usesSafeWrapper) {
            findings.push({
              file: fullPath.replace(process.cwd(), ''),
              line: lineNum,
              operation: line.trim(),
              hasSanitization: false,
            });
          }
        }
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  return findings;
}

async function main() {
  console.log('🔍 Checking for unsafe Firestore writes...\n');

  const findings = findUnsafeWrites(API_DIR);

  if (findings.length === 0) {
    console.log('✅ All Firestore writes appear to be protected!\n');
    return;
  }

  console.log(`⚠️  Found ${findings.length} potentially unsafe Firestore writes:\n`);

  const byFile = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (!byFile.has(finding.file)) {
      byFile.set(finding.file, []);
    }
    byFile.get(finding.file)!.push(finding);
  }

  for (const [file, fileFindings] of byFile.entries()) {
    console.log(`📄 ${file}`);
    for (const finding of fileFindings) {
      console.log(`   Line ${finding.line}: ${finding.operation.substring(0, 80)}...`);
    }
    console.log('');
  }

  console.log('\n💡 Recommendation: Use safe wrapper functions from @/lib/firebase/safeFirestore');
  console.log('   Example: await safeUpdate(docRef, data) instead of await docRef.update(data)\n');
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
