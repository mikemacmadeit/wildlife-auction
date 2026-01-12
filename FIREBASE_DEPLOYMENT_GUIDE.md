# Firebase CLI Authentication & Deployment Guide

## Quick Start: Deploy Firestore Rules & Indexes

### Step 1: Install Firebase CLI (if not installed)

```bash
npm install -g firebase-tools
```

Or use npx (no installation needed):
```bash
npx firebase-tools --version
```

### Step 2: Login to Firebase

```bash
firebase login
```

This will:
1. Open your browser
2. Ask you to sign in with your Google account (the one with access to the Firebase project)
3. Grant permissions to Firebase CLI
4. Save your credentials locally

**Alternative:** If you need to use a different account:
```bash
firebase login --no-localhost
```
This gives you a code to paste in the browser.

### Step 3: Verify You're Logged In

```bash
firebase projects:list
```

You should see `wildlife-exchange` in the list.

### Step 4: Set the Active Project (if needed)

```bash
cd project
firebase use wildlife-exchange
```

### Step 5: Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

This deploys `firestore.rules` to your Firebase project.

### Step 6: Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

This deploys the indexes from `firestore.indexes.json`. **Note:** Index building can take 5-30 minutes.

### Step 7: Deploy Storage Rules

```bash
firebase deploy --only storage:rules
```

### Deploy Everything at Once

```bash
firebase deploy --only firestore,storage
```

---

## What I Can Help With

✅ **I can:**
- Modify `firestore.rules` file
- Update `firestore.indexes.json`
- Update `storage.rules` file
- Prepare code changes
- Provide exact commands to run

❌ **I cannot:**
- Run `firebase login` for you (requires browser authentication)
- Execute deployment commands (you need to run these)
- Access your Firebase Console directly

---

## Common Commands

### Check Current Project
```bash
firebase use
```

### List All Projects
```bash
firebase projects:list
```

### Switch Projects
```bash
firebase use <project-id>
```

### View Deployment History
```bash
firebase deploy:list
```

### Test Rules Locally (requires emulator)
```bash
firebase emulators:start --only firestore
```

---

## Troubleshooting

### "Error: No project active"
```bash
firebase use wildlife-exchange
```

### "Error: Not logged in"
```bash
firebase login
```

### "Error: Permission denied"
- Make sure you're logged in with an account that has Editor/Owner permissions on the Firebase project
- Check Firebase Console → Project Settings → Users and permissions

### "Error: Index already exists"
- This is normal - Firebase will update existing indexes
- Check status in Firebase Console → Firestore → Indexes

---

## Next Steps After Deployment

1. **Verify Rules:**
   - Go to Firebase Console → Firestore → Rules
   - Check that your rules are deployed

2. **Verify Indexes:**
   - Go to Firebase Console → Firestore → Indexes
   - Wait for indexes to show "Enabled" status (can take 5-30 min)

3. **Test:**
   - Try browsing listings without being logged in (after fixing public browsing rule)
   - Test filters on browse page
   - Verify no "index required" errors

---

## Quick Reference: Current Files

- **Firestore Rules:** `project/firestore.rules`
- **Firestore Indexes:** `project/firestore.indexes.json`
- **Storage Rules:** `project/storage.rules`
- **Firebase Config:** `project/firebase.json`
- **Project Config:** `project/.firebaserc`
