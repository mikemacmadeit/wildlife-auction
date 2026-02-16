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
import { getVerificationEmailErrorMessage } from './auth-error-messages';

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
 * Send password reset email.
 * Uses the current window origin when in browser so the reset link always redirects to the site the user is on.
 */
export const resetPassword = async (email: string): Promise<void> => {
  const siteUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : getSiteUrl();
  const actionCodeSettings = {
    url: `${siteUrl}/login?reset=1`,
    handleCodeInApp: false,
  };
  try {
    await sendPasswordResetEmail(auth, email, actionCodeSettings);
  } catch (e: any) {
    const code = String(e?.code || '');
    if (code === 'auth/unauthorized-continue-uri' || code === 'auth/unauthorized-domain') {
      await sendPasswordResetEmail(auth, email);
      return;
    }
    throw e;
  }
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

const VERIFICATION_EMAIL_FETCH_TIMEOUT_MS = 15000;

/**
 * Re-send the verification email to the currently signed-in user.
 * Uses app API first (branded email), then Firebase sendEmailVerification as fallback.
 * @returns { alreadyVerified: true } if the user is already verified (no email sent).
 */
export type ResendVerificationResult = { alreadyVerified?: boolean } | { sentVia: 'firebase' } | void;

export const resendVerificationEmail = async (): Promise<ResendVerificationResult> => {
  if (!auth.currentUser) {
    throw new Error('No user is currently signed in');
  }

  let apiErrorMessage: string | null = null;
  try {
    const token = await auth.currentUser.getIdToken(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFICATION_EMAIL_FETCH_TIMEOUT_MS);
    const res = await fetch('/api/auth/send-verification-email', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      if (data?.alreadyVerified === true) return { alreadyVerified: true };
      return;
    }
    apiErrorMessage =
      (data?.error || data?.message || (res.status === 503 ? 'Verification email service is temporarily unavailable.' : '')) || null;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      apiErrorMessage = 'Request timed out. Trying fallback…';
    } else {
      apiErrorMessage = 'Could not reach the server.';
    }
  }

  // Fallback: Firebase-managed email (default template). Use current origin in browser so redirect works after verification.
  const baseUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : getSiteUrl();
  const actionCodeSettings = {
    url: `${baseUrl}/dashboard/account?verified=1`,
    handleCodeInApp: false,
  };
  try {
    await sendEmailVerification(auth.currentUser, actionCodeSettings as any);
    return { sentVia: 'firebase' };
  } catch (e: any) {
    const code = String(e?.code || '');
    if (code === 'auth/unauthorized-continue-uri' || code === 'auth/unauthorized-domain') {
      try {
        await sendEmailVerification(auth.currentUser);
        return { sentVia: 'firebase' };
      } catch (e2: any) {
        throw new Error(apiErrorMessage || getVerificationEmailErrorMessage(code || e2?.message));
      }
    }
    const msg = apiErrorMessage || getVerificationEmailErrorMessage(code || e?.message);
    throw new Error(msg);
  }
};

/**
 * Send verification email using only Firebase (no branded API).
 * Use when the user didn't receive the branded email (e.g. spam, provider issue).
 */
export const sendVerificationEmailFirebaseOnly = async (): Promise<void> => {
  if (!auth.currentUser) throw new Error('No user is currently signed in');
  const baseUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : getSiteUrl();
  const actionCodeSettings = {
    url: `${baseUrl}/dashboard/account?verified=1`,
    handleCodeInApp: false,
  };
  try {
    await sendEmailVerification(auth.currentUser, actionCodeSettings as any);
  } catch (e: any) {
    const code = String(e?.code || '');
    if (code === 'auth/unauthorized-continue-uri' || code === 'auth/unauthorized-domain') {
      await sendEmailVerification(auth.currentUser);
      return;
    }
    throw new Error(getVerificationEmailErrorMessage(code || e?.message));
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
 * Temporarily override window.open so the next popup (e.g. Google OAuth) opens centered
 * in the current browser window. Restore the original after the async fn completes.
 */
function withCenteredPopup<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined') return fn();
  const originalOpen = window.open;
  window.open = function (
    url?: string | URL,
    target?: string,
    features?: string
  ): Window | null {
    const parsed: Record<string, string> = {};
    if (typeof features === 'string' && features.length > 0) {
      features.split(',').forEach((part) => {
        const eq = part.indexOf('=');
        if (eq > 0) {
          const k = part.slice(0, eq).trim().toLowerCase();
          const v = part.slice(eq + 1).trim();
          if (k && v) parsed[k] = v;
        }
      });
    }
    // Center popup on screen (not parent window) so it appears in the middle regardless of window position
    const s = window.screen as Screen & { availLeft?: number; availTop?: number };
    const availW = s?.availWidth ?? 1024;
    const availH = s?.availHeight ?? 768;
    const availLeft = s?.availLeft ?? 0;
    const availTop = s?.availTop ?? 0;
    const width = Math.min(Number(parsed.width) || 500, availW);
    const height = Math.min(Number(parsed.height) || 600, availH);
    const left = Math.round(availLeft + Math.max(0, (availW - width) / 2));
    const top = Math.round(availTop + Math.max(0, (availH - height) / 2));
    parsed.left = String(left);
    parsed.top = String(top);
    parsed.width = String(width);
    parsed.height = String(height);
    features = Object.entries(parsed)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return originalOpen.call(window, url, target, features);
  };
  return fn().finally(() => {
    window.open = originalOpen;
  });
}

/**
 * Sign in with Google using redirect only (no popup).
 * Use this on /login and /register to avoid COOP blocking window.closed/window.close.
 * After redirect, handle the result with getGoogleRedirectResult() on page load.
 */
export const signInWithGoogleRedirectOnly = async (): Promise<void> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  if (typeof window !== 'undefined') {
    const currentUrl = window.location.href;
    try {
      sessionStorage.setItem('we:google-signin-init-url', currentUrl);
    } catch {
      // Ignore storage errors
    }
  }
  await signInWithRedirect(auth, provider);
  // Page will navigate away to Google; result is handled by getGoogleRedirectResult() on return
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

  try {
    // Try popup first (better UX); center it in the current window
    return await withCenteredPopup(() => signInWithPopup(auth, provider));
  } catch (error: any) {
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
    const result = await getRedirectResult(auth);
    if (result) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Google Sign-In] Redirect result found:', {
          email: result.user.email,
          uid: result.user.uid,
          operationType: result.operationType,
        });
      }
      return result;
    }
    // Only log when we were expecting a redirect (user had clicked "Sign in with Google" and was sent to Google)
    if (typeof window !== 'undefined') {
      const hadInitiated = sessionStorage.getItem('we:google-signin-init-url');
      if (hadInitiated) {
        sessionStorage.removeItem('we:google-signin-init-url');
        console.warn('[Google Sign-In] No redirect result found after return from Google (URL or storage mismatch).');
      }
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
