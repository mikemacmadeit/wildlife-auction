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

  // Send email verification
  if (userCredential.user) {
    await sendEmailVerification(userCredential.user);
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
  return await sendPasswordResetEmail(auth, email);
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
  
  try {
    // Try popup first (better UX)
    return await signInWithPopup(auth, provider);
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
