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
 * Sign in with Google
 */
export const signInWithGoogle = async (): Promise<UserCredential> => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  return await signInWithPopup(auth, provider);
};

/**
 * Listen to auth state changes
 */
export const onAuthStateChange = (callback: NextOrObserver<User | null>) => {
  return onAuthStateChanged(auth, callback);
};
