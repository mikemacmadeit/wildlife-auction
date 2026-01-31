import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
  UserCredential,
  sendPasswordResetEmail,
  updatePassword,
  sendEmailVerification,
  onAuthStateChanged,
  NextOrObserver,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { auth } from './config';
import { getSiteUrl } from '@/lib/site-url';

/**
 * Create a new user account with email and password
 */
export const signUp = async (
  email: string,
  password: string,
  displayName?: string
): Promise<UserCredential> => {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  if (displayName && userCredential.user) {
    await updateProfile(userCredential.user, {
      displayName,
    });
  }

  // Send email verification (branded server email preferred; Firebase default as fallback)
  if (userCredential.user) {
    try {
      await resendVerificationEmail();
    } catch {
      // Fall back to Firebase's default template if our server route is unavailable.
      await sendEmailVerification(userCredential.user);
    }
  }

  return userCredential;
};

/**
 * Sign in with email and password
 */
export const signIn = async (
  email: string,
  password: string
): Promise<UserCredential> => {
  return await signInWithEmailAndPassword(auth, email, password);
};

/**
 * Sign out the current user
 */
export const signOutUser = async (): Promise<void> => {
  return await signOut(auth);
};

/**
 * Send password reset email
 */
export const resetPassword = async (email: string): Promise<void> => {
  // Ensure Firebase sends users back to our app after completing the reset flow.
  // Note: your domain (including localhost for dev) must be allowed in Firebase Auth settings.
  const actionCodeSettings = {
    url: `${getSiteUrl()}/login?reset=1`,
    handleCodeInApp: false,
  };
  return await sendPasswordResetEmail(auth, email, actionCodeSettings);
};

/**
 * Update user password
 */
export const updateUserPassword = async (
  newPassword: string
): Promise<void> => {
  if (!auth.currentUser) {
    throw new Error('No user is currently signed in');
  }
  return await updatePassword(auth.currentUser, newPassword);
};

/**
 * Update user profile (display name, photo URL)
 */
export const updateUserProfile = async (
  updates: { displayName?: string; photoURL?: string }
): Promise<void> => {
  if (!auth.currentUser) {
    throw new Error('No user is currently signed in');
  }
  return await updateProfile(auth.currentUser, updates);
};

/**
 * Re-send the verification email to the currently signed-in user.
 */
export const resendVerificationEmail = async (): Promise<void> => {
  if (!auth.currentUser) {
    throw new Error('No user is currently signed in');
  }

  // Preferred: send a branded verification email via our server (Admin SDK generates the verification link).
  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch('/api/auth/send-verification-email', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) return;
  } catch {
    // ignore and fall back below
  }

  // Fallback: Firebase-managed email (default template)
  const actionCodeSettings = {
    url: `${getSiteUrl()}/dashboard/account?verified=1`,
    handleCodeInApp: false,
  };
  try {
    await sendEmailVerification(auth.currentUser, actionCodeSettings as any);
  } catch (e: any) {
    // If the continue URL/domain isn't authorized in Firebase Auth settings,
    // fall back to Firebase default behavior (still sends the email).
    const code = String(e?.code || '');
    if (code === 'auth/unauthorized-continue-uri' || code === 'auth/unauthorized-domain') {
      await sendEmailVerification(auth.currentUser);
      return;
    }
    throw e;
  }
};

/**
 * Force-refresh the currently signed-in user from Firebase Auth.
 * Useful after verifying email in another tab.
 */
export const reloadCurrentUser = async (): Promise<void> => {
  if (!auth.currentUser) {
    throw new Error('No user is currently signed in');
  }
  // `reload()` exists on the User instance in the Firebase v9 modular SDK.
  await (auth.currentUser as any).reload();
  // Refresh ID token so server-side `email_verified` checks don't use stale claims.
  try {
    await auth.currentUser.getIdToken(true);
  } catch {
    // best-effort
  }
};

/**
 * Get the current user
 */
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

/**
 * Sign in with Google using popup
 * Falls back to redirect if popup is blocked
 */
export const signInWithGoogle = async (): Promise<UserCredential> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  // #region agent log
  const apiKey = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_API_KEY : '';
  const authDomain = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN : '';
  const keyMask = apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'missing';
  if (typeof fetch !== 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'auth.ts:signInWithGoogle:entry', message: 'Google sign-in attempt', data: { authDomain, apiKeyMask: keyMask }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H1_key_identity' }) }).catch(() => {});
  }
  // #endregion

  try {
    // Try popup first (better UX)
    return await signInWithPopup(auth, provider);
  } catch (error: any) {
    // #region agent log
    if (typeof fetch !== 'undefined') {
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'auth.ts:signInWithGoogle:catch', message: 'Google sign-in error', data: { code: error?.code, message: (error?.message || '').slice(0, 200) }, timestamp: Date.now(), sessionId: 'debug-session', hypothesisId: 'H2_error_detail' }) }).catch(() => {});
    }
    // #endregion
    console.error('Google sign-in popup error:', error);
    
    // If popup fails for any reason (blocked, unauthorized domain, illegal URL, etc.), fall back to redirect
    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request' ||
      error.code === 'auth/unauthorized-domain' ||
      error.code === 'auth/operation-not-allowed' ||
      error.message?.includes('illegal URL') ||
      error.message?.includes('illegal') ||
      error.message?.includes('iframe')
    ) {
      // Use redirect as fallback
      console.log('Falling back to redirect for Google sign-in due to:', error.message || error.code);
      
      // CRITICAL: Log the exact URL when initiating redirect
      // Firebase stores redirect result keyed by the exact URL, so we need to ensure
      // the URL we redirect from matches the URL we check on
      if (typeof window !== 'undefined') {
        const currentUrl = window.location.href;
        console.log('[Google Sign-In] Initiating redirect from URL:', currentUrl);
        console.log('[Google Sign-In] URL components:', {
          href: window.location.href,
          origin: window.location.origin,
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash,
        });
        
        // Store the URL we're redirecting from so we can verify it matches on return
        try {
          sessionStorage.setItem('we:google-signin-init-url', currentUrl);
        } catch {
          // Ignore storage errors
        }
      }
      
      await signInWithRedirect(auth, provider);
      // Redirect will navigate away, so we throw a special error
      // The page will reload after redirect completes
      throw new Error('REDIRECT_INITIATED');
    }
    // Re-throw other errors with more context
    console.error('Google sign-in error details:', {
      code: error.code,
      message: error.message,
      email: error.email,
      credential: error.credential,
    });
    throw error;
  }
};

/**
 * Get the result of a Google sign-in redirect
 * Call this on page load to handle redirect completion
 */
export const getGoogleRedirectResult = async (): Promise<UserCredential | null> => {
  try {
    // Log URL info for debugging URL mismatch issues
    if (typeof window !== 'undefined') {
      console.log('[Google Sign-In] Checking redirect result on URL:', window.location.href);
      console.log('[Google Sign-In] URL components:', {
        href: window.location.href,
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      });
    }
    
    const result = await getRedirectResult(auth);
    if (result) {
      console.log('[Google Sign-In] Redirect result found:', {
        email: result.user.email,
        uid: result.user.uid,
        operationType: result.operationType,
      });
    } else {
      console.log('[Google Sign-In] No redirect result found (null returned)');
    }
    return result;
  } catch (error: any) {
    console.error('[Google Sign-In] Error getting redirect result:', error);
    console.error('[Google Sign-In] Error details:', {
      code: error.code,
      message: error.message,
      email: error.email,
      credential: error.credential,
    });
    // Don't throw - return null so the page can still load
    return null;
  }
};

/**
 * Listen to auth state changes
 */
export const onAuthStateChange = (callback: NextOrObserver<User | null>) => {
  return onAuthStateChanged(auth, callback);
};
