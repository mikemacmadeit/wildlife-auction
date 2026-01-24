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
 * Detect if user is on a mobile device or touch device
 * VERY aggressive detection - err on the side of using redirect
 */
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check user agent for mobile devices (case-insensitive, comprehensive)
  const ua = (navigator.userAgent || navigator.vendor || (window as any).opera || '').toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet|kindle|silk|fennec/i.test(ua);
  
  // Check for touch capability (very common on mobile)
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (window as any).DocumentTouch;
  
  // Check screen width (use 1024px threshold to catch tablets and small laptops)
  const width = window.innerWidth || (window as any).screen?.width || 0;
  const isSmallScreen = width < 1024 || (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches);
  
  // Check if it's a mobile browser by checking platform
  const platform = navigator.platform || '';
  const isMobilePlatform = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(platform);
  
  // VERY AGGRESSIVE: If screen is small OR has touch OR mobile UA OR mobile platform, use redirect
  // This ensures we catch all mobile scenarios
  const isMobile = isSmallScreen || hasTouch || isMobileUA || isMobilePlatform;
  
  if (isMobile) {
    console.log('[Google Sign-In] Mobile detected - using redirect:', { 
      width, 
      hasTouch, 
      isSmallScreen, 
      isMobileUA, 
      isMobilePlatform,
      ua: ua.substring(0, 60) 
    });
  } else {
    console.log('[Google Sign-In] Desktop detected - will try popup:', { width, hasTouch });
  }
  
  return isMobile;
};

/**
 * Sign in with Google using redirect only (more reliable across devices)
 *
 * NOTE:
 * - This always uses `signInWithRedirect`, even on desktop, to ensure consistent behavior.
 * - Callers should treat the `REDIRECT_INITIATED` error as a non-error and let the page reload.
 * - After redirect completes, `getGoogleRedirectResult` should be called on page load to finalize sign-in.
 */
export const signInWithGoogle = async (): Promise<UserCredential> => {
  // Only run on client-side
  if (typeof window === 'undefined') {
    throw new Error('Google sign-in can only be initiated on the client-side');
  }

  if (!auth) {
    console.error('[Google Sign-In] Auth instance is not available');
    throw new Error('Firebase Auth is not initialized');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  try {
    console.log('[Google Sign-In] Starting Google redirect flow for all devices');
    console.log('[Google Sign-In] Auth domain:', auth.app.options.authDomain);
    console.log('[Google Sign-In] Current URL:', window.location.href);
    
    // Mark that we're initiating a redirect so the return page knows to wait
    // Use both sessionStorage and localStorage for reliability (localStorage persists better)
    try {
      sessionStorage.setItem('we:google-signin-pending', '1');
      localStorage.setItem('we:google-signin-pending', '1');
      console.log('[Google Sign-In] Set redirect pending flag in storage');
    } catch {
      // Ignore storage errors
    }
    
    // signInWithRedirect is async but will redirect the page before resolving
    // We need to catch any errors that occur before the redirect
    await signInWithRedirect(auth, provider);
    
    // This line should never execute because signInWithRedirect redirects the page
    // But if it does, we throw to indicate redirect was initiated
    console.warn('[Google Sign-In] signInWithRedirect completed without redirecting (unexpected)');
    throw new Error('REDIRECT_INITIATED');
  } catch (error: any) {
    // signInWithRedirect might throw before redirecting if there's a config issue
    if (error.message !== 'REDIRECT_INITIATED') {
      console.error('[Google Sign-In] Redirect initiation failed:', error);
      console.error('[Google Sign-In] Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack,
      });
      
      // Check for common configuration errors
      if (error.code === 'auth/unauthorized-domain') {
        console.error('[Google Sign-In] Domain not authorized. Check Firebase Console > Authentication > Settings > Authorized domains');
        console.error('[Google Sign-In] Current domain:', window.location.hostname);
        console.error('[Google Sign-In] Auth domain:', auth.app.options.authDomain);
      }
    } else {
      console.log('[Google Sign-In] Redirect initiated successfully');
    }
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
      console.log('Google redirect sign-in successful:', result.user.email);
    }
    return result;
  } catch (error: any) {
    console.error('Error getting redirect result:', error);
    console.error('Error details:', {
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
