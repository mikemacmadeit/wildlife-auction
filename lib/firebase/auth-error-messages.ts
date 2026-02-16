/**
 * User-friendly messages for Firebase Auth errors.
 * Never show raw Firebase error codes or messages to users.
 */

const SIGN_IN_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Wrong email or password. Try again or use Forgot password below.',
  'auth/invalid-credentials': 'Wrong email or password. Try again or use Forgot password below.',
  'auth/invalid-email': 'Please check your email address.',
  'auth/user-not-found': "We don't have an account for you. Please sign up first.",
  'auth/wrong-password': 'Wrong email or password. Try again or use Forgot password below.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/too-many-requests': 'Too many failed attempts. Please try again in a few minutes.',
  'auth/network-request-failed': 'Connection problem. Check your internet and try again.',
  'auth/operation-not-allowed': 'Email sign-in is not available. Please contact support.',
  'auth/unauthorized-domain': 'Sign-in is not available for this site. Please contact support.',
};

const PASSWORD_RESET_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-not-found': 'If an account exists for this email, you’ll receive reset instructions shortly. Check your spam folder if you don’t see it.',
  'auth/unauthorized-domain': 'Password reset isn’t set up for this domain. Please contact support.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again, or contact support.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
};

const GOOGLE_SIGN_IN_MESSAGES: Record<string, string> = {
  'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
  'auth/popup-blocked': 'Popup was blocked. Please allow popups or try again.',
  'auth/cancelled-popup-request': 'Please wait and try again.',
  'auth/unauthorized-domain': 'Google sign-in is not available for this site. Please contact support.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled. Please contact support.',
};

const PASSWORD_UPDATE_MESSAGES: Record<string, string> = {
  'auth/wrong-password': 'Your current password is incorrect. Please try again.',
  'auth/invalid-credential': 'Your current password is incorrect. Please try again.',
  'auth/invalid-credentials': 'Your current password is incorrect. Please try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a bit and try again.',
  'auth/requires-recent-login': 'For security, please sign out and sign back in, then try again.',
};

const REGISTER_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists. Please sign in instead.',
  'auth/weak-password': 'Please choose a stronger password (at least 8 characters).',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/operation-not-allowed': 'Registration is not available. Please contact support.',
  'auth/unauthorized-domain': 'Registration is not available for this site. Please contact support.',
};

const VERIFICATION_EMAIL_MESSAGES: Record<string, string> = {
  'auth/too-many-requests':
    'Too many verification emails sent. Please wait a few minutes, or click "I verified — refresh" if you already verified.',
  'auth/network-request-failed': 'Connection problem. Check your internet and try again.',
  'auth/unauthorized-continue-uri': "Verification link couldn't be set for this site. Please contact support.",
  'auth/unauthorized-domain': "Verification isn't available for this domain. Please contact support.",
};

const DEFAULT_SIGN_IN = 'Sign-in failed. Please try again.';
const DEFAULT_PASSWORD_RESET = 'We couldn’t send a reset email. Please try again or contact support.';
const DEFAULT_GOOGLE = 'Google sign-in failed. Please try again.';
const DEFAULT_PASSWORD_UPDATE = 'Could not update password. Please try again.';
const DEFAULT_REGISTER = 'We couldn’t create your account. Please try again.';

const DEFAULT_VERIFICATION_EMAIL =
  "Couldn't send the verification email. If you already verified, click \"I verified — refresh\"; otherwise try again in a moment.";

/**
 * Get a user-friendly message for verification email errors (resend).
 */
export function getVerificationEmailErrorMessage(code: string | undefined): string {
  if (!code || !code.startsWith('auth/')) return DEFAULT_VERIFICATION_EMAIL;
  return VERIFICATION_EMAIL_MESSAGES[code] ?? DEFAULT_VERIFICATION_EMAIL;
}

/**
 * Get a user-friendly message for sign-in errors (email/password).
 * Use this so users never see "Firebase: Error (auth/invalid-credentials)".
 */
export function getSignInErrorMessage(code: string | undefined): string {
  if (!code || !code.startsWith('auth/')) return DEFAULT_SIGN_IN;
  return SIGN_IN_MESSAGES[code] ?? DEFAULT_SIGN_IN;
}

/**
 * Get a user-friendly message for password reset errors.
 */
export function getPasswordResetErrorMessage(code: string | undefined): string {
  if (!code || !code.startsWith('auth/')) return DEFAULT_PASSWORD_RESET;
  return PASSWORD_RESET_MESSAGES[code] ?? DEFAULT_PASSWORD_RESET;
}

/**
 * Get a user-friendly message for Google sign-in errors.
 */
export function getGoogleSignInErrorMessage(code: string | undefined): string {
  if (!code || !code.startsWith('auth/')) return DEFAULT_GOOGLE;
  return GOOGLE_SIGN_IN_MESSAGES[code] ?? DEFAULT_GOOGLE;
}

/**
 * Get a user-friendly message for password update errors (e.g. change password on account page).
 */
export function getPasswordUpdateErrorMessage(code: string | undefined): string {
  if (!code || !code.startsWith('auth/')) return DEFAULT_PASSWORD_UPDATE;
  return PASSWORD_UPDATE_MESSAGES[code] ?? DEFAULT_PASSWORD_UPDATE;
}

/**
 * Get a user-friendly message for registration errors.
 */
export function getRegisterErrorMessage(code: string | undefined): string {
  if (!code || !code.startsWith('auth/')) return DEFAULT_REGISTER;
  return REGISTER_MESSAGES[code] ?? DEFAULT_REGISTER;
}
