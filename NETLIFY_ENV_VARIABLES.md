# Netlify Environment Variables - Copy & Paste Ready

## 🔥 Required Firebase Environment Variables

Copy these **exactly** into Netlify's Environment Variables section:

### Firebase Client Configuration (Public - Browser Accessible)

```
NEXT_PUBLIC_FIREBASE_PROJECT_ID=wildlife-exchange
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY_HERE
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=wildlife-exchange.firebaseapp.com
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=wildlife-exchange.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=997321283928
NEXT_PUBLIC_FIREBASE_APP_ID=1:997321283928:web:75a1cb8fe4cfc0e5c76d2d
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-MEELFLSGMC
```

### Firebase Admin SDK (Server-Side Only)

**⚠️ IMPORTANT:** For `FIREBASE_PRIVATE_KEY`, you need to format it correctly with newlines.

**Option 1: Single line with \n (Recommended for Netlify)**
```
FIREBASE_PROJECT_ID=wildlife-exchange
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@wildlife-exchange.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[REDACTED - Get from Firebase Console Service Account JSON]\n-----END PRIVATE KEY-----\n"
```

**Option 2: Multi-line (if Netlify supports it)**
```
FIREBASE_PROJECT_ID=wildlife-exchange
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@wildlife-exchange.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
YOUR_PRIVATE_KEY_HERE
-----END PRIVATE KEY-----
```

## 📋 Step-by-Step Instructions

### 1. Get Your Firebase Values

**For Public Variables:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/settings/general
2. Scroll to **"Your apps"** section
3. Click on your web app (or create one)
4. Copy the config values

**For Admin SDK Variables:**
1. Go to: https://console.firebase.google.com/project/wildlife-exchange/settings/serviceaccounts/adminsdk
2. Click **"Generate new private key"**
3. Download the JSON file
4. Extract these values:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (keep the newlines!)

### 2. Add to Netlify

1. Go to your Netlify site dashboard
2. **Site settings** → **Environment variables**
3. Click **"Add a variable"** for each one
4. Paste the variable name and value
5. Click **"Save"**

### 3. Format FIREBASE_PRIVATE_KEY Correctly

The private key from the JSON file looks like:
```json
"private_key": "-----BEGIN PRIVATE KEY-----\n[YOUR_PRIVATE_KEY_FROM_JSON_FILE]\n-----END PRIVATE KEY-----\n"
```

**For Netlify, use ONE of these formats:**

**Format A (Single line with \n):**
```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[YOUR_PRIVATE_KEY_FROM_JSON_FILE]\n-----END PRIVATE KEY-----\n"
```

**Format B (If Netlify supports multi-line):**
Just paste the entire key as-is (with actual line breaks)

### 4. Verify All Variables

Make sure you have ALL of these:
- ✅ NEXT_PUBLIC_FIREBASE_PROJECT_ID
- ✅ NEXT_PUBLIC_FIREBASE_API_KEY
- ✅ NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- ✅ NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- ✅ NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- ✅ NEXT_PUBLIC_FIREBASE_APP_ID
- ✅ NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID (optional but recommended)
- ✅ FIREBASE_PROJECT_ID
- ✅ FIREBASE_CLIENT_EMAIL
- ✅ FIREBASE_PRIVATE_KEY

### 5. Redeploy

After adding all variables:
1. Go to **Deploys** tab
2. Click **"Trigger deploy"** → **"Clear cache and deploy site"**

## 🔍 How to Get Your Actual Values

### Firebase Public Config:
1. Visit: https://console.firebase.google.com/project/wildlife-exchange/settings/general
2. Scroll to **"Your apps"**
3. Click your web app → Copy config values

### Firebase Admin SDK:
1. Visit: https://console.firebase.google.com/project/wildlife-exchange/settings/serviceaccounts/adminsdk
2. Click **"Generate new private key"**
3. Download JSON file
4. Open JSON and copy:
   - `project_id`
   - `client_email`
   - `private_key` (entire value including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)

## ⚠️ Important Notes

1. **Private Key Formatting**: The `FIREBASE_PRIVATE_KEY` must include the `\n` characters or actual line breaks. Netlify should handle both, but if you have issues, try the single-line format with `\n`.

2. **No Quotes Needed**: In Netlify's UI, don't add quotes around values (except for the private key if using single-line format).

3. **Case Sensitive**: Variable names are case-sensitive. Use exact names shown above.

4. **Public vs Private**: 
   - `NEXT_PUBLIC_*` variables are exposed to the browser (safe for public config)
   - Variables without `NEXT_PUBLIC_` are server-side only (keep secret!)

5. **After Adding Variables**: Always trigger a new deploy with cache cleared.

## 🧪 Test After Deployment

1. Visit your Netlify site
2. Check browser console for Firebase errors
3. Test authentication (sign in/up)
4. Test listing creation
5. Check Netlify function logs if you see errors
