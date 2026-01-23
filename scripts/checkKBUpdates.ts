/**
 * Knowledge Base Update Guardrail Check
 * 
 * This script ensures that when user-facing features are added or changed,
 * the Knowledge Base is also updated.
 * 
 * Usage:
 *   npx tsx scripts/checkKBUpdates.ts [base-ref]
 * 
 * If base-ref is not provided, compares against origin/main (for CI) or HEAD~1 (for local).
 * 
 * Exit codes:
 *   0 - Success (either no user-facing changes, or KB was updated)
 *   1 - Failure (user-facing changes detected but no KB updates)
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

// Patterns that indicate user-facing changes
const USER_FACING_PATTERNS = [
  // Pages (user-visible routes)
  /^app\/[^/]+\/page\.tsx$/,
  /^app\/[^/]+\/[^/]+\/page\.tsx$/,
  /^pages\/[^/]+\.tsx$/,
  /^pages\/[^/]+\/[^/]+\.tsx$/,
  
  // Components (user-facing UI)
  /^components\/[^/]+\/[^/]+\.tsx$/,
  /^components\/[^/]+\.tsx$/,
  
  // Public routes (API endpoints that users interact with)
  /^app\/api\/(?!admin)[^/]+\/route\.ts$/,
  /^app\/api\/(?!admin)[^/]+\/[^/]+\/route\.ts$/,
  
  // Help/Tutorial content (user-facing)
  /^help\/.*\.ts$/,
  /^help\/.*\.tsx$/,
  
  // User-facing configuration
  /^lib\/help\/.*\.ts$/,
];

// Patterns that indicate KB updates (what we want to see)
const KB_UPDATE_PATTERNS = [
  /^knowledge_base\/.*\.md$/,
  /^knowledge_base\/.*\.mdx$/,
];

// Patterns to ignore (not user-facing)
const IGNORE_PATTERNS = [
  /^\.git/,
  /^node_modules/,
  /^\.next/,
  /^\.env/,
  /^scripts\//,
  /^docs\//,
  /^\.github\//,
  /^netlify\//,
  /^test-results\//,
  /^tests\//,
  /^app\/api\/admin\//, // Admin-only APIs
  /^app\/dashboard\/admin\//, // Admin-only pages
  /^lib\/admin\//, // Admin-only libs
  /^lib\/audit\//, // Internal audit
  /^lib\/rate-limit\.ts$/, // Internal
  /^lib\/firebase\/admin\.ts$/, // Internal
  /^\.md$/, // Documentation files (unless in KB)
  /^package\.json$/,
  /^package-lock\.json$/,
  /^tsconfig\.json$/,
  /^next\.config\.js$/,
  /^tailwind\.config\.ts$/,
  /^postcss\.config\.js$/,
  /^playwright\.config\.ts$/,
  /^netlify\.toml$/,
  /^firebase\.json$/,
  /^firestore\.rules$/,
  /^firestore\.indexes\.json$/,
  /^storage\.rules$/,
  /^sentry\..*\.config\.ts$/,
  /^env\.example$/,
];

function getBaseRef(): string {
  // Check if we're in CI (Netlify, GitHub Actions, etc.)
  const isCI = !!(
    process.env.NETLIFY ||
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.VERCEL
  );

  if (isCI) {
    // In CI, compare against the base branch (usually main)
    // Netlify provides COMMIT_REF and PULL_REQUEST_BASE
    const prBase = process.env.PULL_REQUEST_BASE || process.env.BASE_BRANCH;
    if (prBase) {
      return prBase;
    }
    // Fallback: compare against origin/main
    try {
      execSync('git fetch origin main --depth=1', { stdio: 'ignore' });
      return 'origin/main';
    } catch {
      // If fetch fails, use HEAD~1 (previous commit)
      return 'HEAD~1';
    }
  }

  // Local development: compare against HEAD~1 (previous commit)
  return 'HEAD~1';
}

function getChangedFiles(baseRef: string): string[] {
  try {
    // Check if we're in a git repository
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch {
      console.warn('⚠️  Not in a git repository. Skipping KB check.');
      return [];
    }

    // Try to get the base ref (might not exist in shallow clones)
    try {
      execSync(`git rev-parse --verify ${baseRef}`, { stdio: 'ignore' });
    } catch {
      // Base ref doesn't exist, try HEAD~1 as fallback
      try {
        execSync('git rev-parse --verify HEAD~1', { stdio: 'ignore' });
        baseRef = 'HEAD~1';
      } catch {
        console.warn(`⚠️  Cannot find base ref ${baseRef} or HEAD~1. Skipping KB check.`);
        return [];
      }
    }

    // Get list of changed files
    const output = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error: any) {
    // If git command fails, return empty array (don't block build)
    console.warn('⚠️  Git diff failed, assuming no changes:', error.message);
    return [];
  }
}

function isUserFacingChange(file: string): boolean {
  // Ignore files that match ignore patterns
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(file)) {
      return false;
    }
  }

  // Check if file matches user-facing patterns
  for (const pattern of USER_FACING_PATTERNS) {
    if (pattern.test(file)) {
      return true;
    }
  }

  return false;
}

function isKBUpdate(file: string): boolean {
  for (const pattern of KB_UPDATE_PATTERNS) {
    if (pattern.test(file)) {
      return true;
    }
  }
  return false;
}

function checkKBUpdates() {
  const baseRef = process.argv[2] || getBaseRef();
  
  console.log('🔍 Checking Knowledge Base update requirements...\n');
  console.log(`📊 Comparing against: ${baseRef}\n`);

  const changedFiles = getChangedFiles(baseRef);

  if (changedFiles.length === 0) {
    console.log('✅ No changes detected. Skipping KB check.\n');
    process.exit(0);
  }

  console.log(`📝 Found ${changedFiles.length} changed file(s)\n`);

  const userFacingChanges: string[] = [];
  const kbUpdates: string[] = [];

  for (const file of changedFiles) {
    if (isUserFacingChange(file)) {
      userFacingChanges.push(file);
    }
    if (isKBUpdate(file)) {
      kbUpdates.push(file);
    }
  }

  // Report findings
  if (userFacingChanges.length > 0) {
    console.log('👤 User-facing changes detected:');
    userFacingChanges.forEach((file) => console.log(`   - ${file}`));
    console.log('');
  }

  if (kbUpdates.length > 0) {
    console.log('📚 Knowledge Base updates detected:');
    kbUpdates.forEach((file) => console.log(`   - ${file}`));
    console.log('');
  }

  // Check if KB directory exists
  if (!existsSync('knowledge_base')) {
    console.warn('⚠️  Warning: knowledge_base directory not found.\n');
  }

  // Guardrail: If user-facing changes exist but no KB updates, fail
  if (userFacingChanges.length > 0 && kbUpdates.length === 0) {
    console.error('❌ GUARDRAIL FAILED: User-facing changes detected but no Knowledge Base updates found.\n');
    console.error('📋 Required Action:');
    console.error('   When adding or changing user-facing features, you MUST update the Knowledge Base.\n');
    console.error('   Please:');
    console.error('   1. Add or update KB articles in /knowledge_base/');
    console.error('   2. Document the new/changed feature');
    console.error('   3. Include troubleshooting information if applicable');
    console.error('   4. Run: npx tsx scripts/syncKnowledgeBaseToFirestore.ts\n');
    console.error('💡 Tip: Create KB articles that explain:');
    console.error('   - How the feature works');
    console.error('   - Common questions/troubleshooting');
    console.error('   - Step-by-step instructions\n');
    console.error('🔧 To bypass this check (not recommended):');
    console.error('   Set SKIP_KB_CHECK=true in environment variables\n');
    
    // Allow bypass via env var (for emergency situations)
    if (process.env.SKIP_KB_CHECK === 'true') {
      console.warn('⚠️  SKIP_KB_CHECK=true detected. Bypassing guardrail.\n');
      process.exit(0);
    }
    
    process.exit(1);
  }

  if (userFacingChanges.length > 0 && kbUpdates.length > 0) {
    console.log('✅ Guardrail passed: User-facing changes accompanied by KB updates.\n');
  } else if (userFacingChanges.length === 0) {
    console.log('✅ Guardrail passed: No user-facing changes detected.\n');
  }

  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  try {
    checkKBUpdates();
  } catch (error: any) {
    console.error('❌ Error running KB check:', error.message);
    process.exit(1);
  }
}

export { checkKBUpdates };
