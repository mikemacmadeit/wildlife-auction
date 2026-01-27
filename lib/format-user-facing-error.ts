/**
 * Returns friendly, non-technical copy for user-facing error messages.
 * Use for auth, checkout, and API error handling.
 */
export function formatUserFacingError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (error == null) return fallback;
  const msg = typeof (error as { message?: string }).message === 'string'
    ? (error as { message: string }).message
    : String(error);

  const lower = msg.toLowerCase();

  // Auth
  if (lower.includes('invalid email') || lower.includes('invalid-email'))
    return 'Please check your email address.';
  if (lower.includes('user-not-found')) return 'No account found with this email.';
  if (lower.includes('wrong password') || lower.includes('invalid-credential'))
    return 'Email or password is incorrect. Please try again.';
  if (lower.includes('email-already-in-use')) return 'This email is already in use.';
  if (lower.includes('weak-password')) return 'Please choose a stronger password.';
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Check your connection and try again.';

  // Generic
  if (lower.includes('timeout')) return 'Request timed out. Please try again.';
  if (lower.includes('unauthorized') || lower.includes('401'))
    return 'Please sign in and try again.';

  return fallback;
}
