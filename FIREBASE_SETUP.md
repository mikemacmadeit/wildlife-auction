# Firebase Setup Complete

Your Firebase project "wildlife-exchange" has been configured!

## Environment Variables

Create a `.env.local` file in the `project` directory with these values:

```env
# Get these values from Firebase Console > Project Settings > General
# Replace the placeholder values below with your actual Firebase config

NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key-here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
```

**Where to find these values:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon ⚙️ → **Project settings**
4. Scroll down to **"Your apps"** section
5. Click on your web app (or create one if needed)
6. Copy the config values to your `.env.local` file

**Important:** After creating `.env.local`, restart your development server for the changes to take effect.

**Google Sign-In 403 / "The requested action is invalid"?**  
If Google sign-in fails with `API_KEY_HTTP_REFERRER_BLOCKED` or "Requests from referer ... are blocked", your API key’s HTTP referrer restrictions are blocking the Firebase Auth domain. Add the Firebase auth domain and localhost to the key’s allowed referrers in [Google Cloud Console → Credentials → your API key](https://console.cloud.google.com/apis/credentials). Step-by-step: [docs/GOOGLE_SIGNIN_API_KEY_REFERRER_FIX.md](docs/GOOGLE_SIGNIN_API_KEY_REFERRER_FIX.md).

## What's Configured

✅ Firebase App initialized
✅ Firebase Authentication
✅ Firestore Database
✅ Firebase Storage
✅ Firebase Analytics

## Next Steps

1. Enable Firebase services in the Firebase Console:
   - **Authentication**: Enable Email/Password sign-in
   - **Firestore**: Create database (test mode or production)
   - **Storage**: Enable storage (test mode or production)

2. Set up security rules for Firestore and Storage (see `lib/firebase/README.md`)

3. Start using Firebase in your components:
   ```typescript
   import { auth, db, storage } from '@/lib/firebase';
   import { signUp, signIn } from '@/lib/firebase/auth';
   import { getDocument, createDocument } from '@/lib/firebase/firestore';
   ```
