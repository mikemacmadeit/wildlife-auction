# Remove Private Key from Git History

**CRITICAL:** The private key is still in Git history even though files were deleted.

## ⚠️ WARNING: This Rewrites Git History

**Before proceeding:**
- ✅ Coordinate with team (if any)
- ✅ Backup your repository
- ✅ Ensure you have admin access to GitHub repo
- ⚠️ This will require force push

---

## Method 1: Using git filter-branch (Built-in)

### Step 1: Remove Files from All Commits

```bash
cd project

# Remove the files from all commits in history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch NETLIFY_ENV_EXACT_VALUES.txt NETLIFY_ENV_FINAL_CHECK.txt NETLIFY_ENV_COPY_PASTE.txt NETLIFY_FIX_MISSING_VARS.txt" \
  --prune-empty --tag-name-filter cat -- --all
```

### Step 2: Clean Up

```bash
# Remove backup refs
rm -rf .git/refs/original/

# Force garbage collection
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### Step 3: Force Push (⚠️ DESTRUCTIVE)

```bash
# Force push to update remote (rewrites history)
git push origin --force --all
git push origin --force --tags
```

---

## Method 2: Using BFG Repo-Cleaner (Easier, Recommended)

### Step 1: Download BFG

1. Download from: https://rtyley.github.io/bfg-repo-cleaner/
2. Save `bfg.jar` to a convenient location

### Step 2: Remove Files

```bash
cd project

# Remove specific files
java -jar bfg.jar --delete-files NETLIFY_ENV_EXACT_VALUES.txt
java -jar bfg.jar --delete-files NETLIFY_ENV_FINAL_CHECK.txt
java -jar bfg.jar --delete-files NETLIFY_ENV_COPY_PASTE.txt
java -jar bfg.jar --delete-files NETLIFY_FIX_MISSING_VARS.txt
```

### Step 3: Clean Up

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### Step 4: Force Push

```bash
git push origin --force --all
git push origin --force --tags
```

---

## Method 3: Contact GitHub Support (Safest)

If you're not comfortable with the above:

1. Go to: https://support.github.com/contact
2. Request removal of sensitive data from repository history
3. Provide:
   - Repository: `mikemacmadeit/wildlife-auction`
   - Files: `NETLIFY_ENV_EXACT_VALUES.txt`, `NETLIFY_ENV_FINAL_CHECK.txt`, `NETLIFY_ENV_COPY_PASTE.txt`, `NETLIFY_FIX_MISSING_VARS.txt`
   - Reason: Exposed Firebase private key

---

## Verification After Cleanup

### Check Key is Removed

```bash
# Search for key in history (should return nothing)
git log --all --full-history -p | Select-String -Pattern "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSk" | Measure-Object

# Should return: Count: 0
```

### Verify GitGuardian Alert Clears

- Wait 24-48 hours after force push
- GitGuardian will rescan
- Alert should clear if key is removed from history

---

## Important Notes

1. **Force Push Required:** This rewrites history, so force push is necessary
2. **Team Coordination:** If others have cloned the repo, they'll need to re-clone
3. **Key Still Compromised:** Even after removing from history, the key was exposed
4. **Must Rotate Key:** You MUST rotate the Firebase service account key (see `SECURITY_INCIDENT_PRIVATE_KEY_EXPOSURE.md`)

---

## After Cleanup

1. ✅ Verify key removed from history
2. ✅ Rotate Firebase service account key
3. ✅ Update Netlify environment variables with new key
4. ✅ Monitor GitGuardian for 48 hours
5. ✅ Document the incident

---

**Last Updated:** January 12, 2026
