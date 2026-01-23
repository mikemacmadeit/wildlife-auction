# Knowledge Base Update Enforcement

This directory contains scripts to enforce that Knowledge Base articles are updated when user-facing features change.

## Guardrail Check Script

**File:** `scripts/checkKBUpdates.ts`

**Purpose:** Ensures that when user-facing code changes are made, Knowledge Base articles are also updated.

### How It Works

1. **Detects User-Facing Changes:**
   - Pages (`app/**/page.tsx`)
   - Components (`components/**/*.tsx`)
   - User-facing API routes (`app/api/**/route.ts`, excluding admin)
   - Help content (`help/**/*.ts`)

2. **Checks for KB Updates:**
   - Looks for changes in `/knowledge_base/**/*.md` files

3. **Fails Build If:**
   - User-facing changes detected AND
   - No KB updates found AND
   - `SKIP_KB_CHECK` is not set to `true`

### Usage

**Local Development:**
```bash
npx tsx scripts/checkKBUpdates.ts
```

**CI/CD (Automatic):**
The script runs automatically during Netlify builds. It compares against the base branch (e.g., `main`).

**Manual Check (Specific Base):**
```bash
npx tsx scripts/checkKBUpdates.ts origin/main
```

### Bypassing the Check

**Emergency Bypass (Not Recommended):**
Set `SKIP_KB_CHECK=true` in environment variables. This should only be used in emergency situations.

**Proper Way:**
Update the Knowledge Base! Create or update articles in `/knowledge_base/` that document the new/changed feature.

### What Counts as User-Facing?

**User-Facing (Requires KB Update):**
- ✅ Public pages (`app/browse/page.tsx`, `app/listing/[id]/page.tsx`)
- ✅ User dashboard pages (`app/dashboard/orders/page.tsx`)
- ✅ User-facing components (`components/listing/ListingCard.tsx`)
- ✅ Public API routes (`app/api/orders/route.ts`)
- ✅ Help content (`help/helpContent.ts`)

**Not User-Facing (No KB Update Required):**
- ❌ Admin-only pages (`app/dashboard/admin/**`)
- ❌ Admin-only APIs (`app/api/admin/**`)
- ❌ Internal scripts (`scripts/**`)
- ❌ Documentation files (`*.md` outside KB)
- ❌ Configuration files (`package.json`, `tsconfig.json`, etc.)

### KB Sync Script

**File:** `scripts/syncKnowledgeBaseToFirestore.ts`

**Purpose:** Syncs markdown KB files from `/knowledge_base/` to Firestore.

**Usage:**
```bash
npx tsx scripts/syncKnowledgeBaseToFirestore.ts
```

**When to Run:**
- After creating new KB articles
- After updating existing KB articles
- Before deploying to production
- As part of CI/CD pipeline (optional)

## Workflow

### When Adding a New Feature

1. **Make Code Changes:**
   ```bash
   # Add your feature code
   git add app/new-feature/page.tsx
   ```

2. **Create/Update KB Articles:**
   ```bash
   # Create KB article
   echo '---
title: "New Feature Guide"
slug: "new-feature-guide"
category: "features"
audience: ["all"]
tags: ["feature", "guide"]
enabled: true
---

# New Feature Guide

How to use the new feature...
' > knowledge_base/features/new-feature-guide.md
   
   git add knowledge_base/features/new-feature-guide.md
   ```

3. **Sync to Firestore (Optional, for testing):**
   ```bash
   npx tsx scripts/syncKnowledgeBaseToFirestore.ts
   ```

4. **Commit:**
   ```bash
   git commit -m "feat: Add new feature with KB documentation"
   ```

5. **Build Will Pass:**
   The guardrail check will see both code changes and KB updates, so the build will succeed.

### When Bypassing (Emergency Only)

If you absolutely must bypass the check (e.g., hotfix that doesn't affect users):

```bash
SKIP_KB_CHECK=true git push
```

**⚠️ Warning:** This should be extremely rare. Always update KB as soon as possible after bypassing.

## CI/CD Integration

### Netlify

The check runs automatically in `netlify.toml` build command. If it fails, the build fails.

### GitHub Actions (Optional)

Add to `.github/workflows/ci.yml`:

```yaml
- name: Check KB Updates
  run: npx tsx scripts/checkKBUpdates.ts origin/main
```

## Troubleshooting

### "Guardrail Failed" Error

**Problem:** Build fails with "User-facing changes detected but no KB updates found."

**Solution:**
1. Create or update KB articles in `/knowledge_base/`
2. Commit the KB changes
3. Re-run the build

### "Git diff failed" Warning

**Problem:** Script can't determine changed files.

**Solution:**
- Ensure you're in a git repository
- Ensure you have commits to compare against
- In CI, ensure git history is available (use `fetch-depth: 0` in GitHub Actions)

### False Positives

**Problem:** Script flags files that aren't actually user-facing.

**Solution:**
- Add the file pattern to `IGNORE_PATTERNS` in `checkKBUpdates.ts`
- Or ensure the file path matches an ignore pattern

## Best Practices

1. **Always Update KB with Features:**
   - Create "How it works" article
   - Create "Troubleshooting" article if applicable
   - Update related existing articles

2. **Keep KB in Sync:**
   - Run sync script before deploying
   - Test KB articles in staging
   - Verify AI chat can answer questions about new features

3. **Document Changes:**
   - Include KB file paths in PR descriptions
   - Mention KB updates in commit messages
   - Review KB changes in code reviews

4. **Don't Bypass:**
   - Only bypass in true emergencies
   - Create a follow-up task to update KB
   - Document why bypass was necessary
