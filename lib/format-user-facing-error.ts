/**
 * Returns friendly, non-technical copy for user-facing error messages.
 * Never shows raw Firebase codes, stack traces, or dev errors to users.
 * Use for toasts, form errors, and any UI that displays errors.
 */
export function formatUserFacingError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (error == null) return fallback;
  const msg =
    typeof (error as { message?: string }).message === 'string'
      ? (error as { message: string }).message
      : String(error);

  if (!msg || typeof msg !== 'string') return fallback;

  const lower = msg.toLowerCase().trim();

  // Never show technical/dev messages to users
  if (isTechnicalMessage(lower)) return fallback;

  // Auth (Firebase-style; we also have auth-error-messages.ts for explicit codes)
  if (lower.includes('invalid email') || lower.includes('invalid-email'))
    return 'Please check your email address.';
  if (lower.includes('user-not-found')) return 'No account found with this email.';
  if (lower.includes('wrong password') || lower.includes('invalid-credential'))
    return 'Email or password is incorrect. Please try again.';
  if (lower.includes('email-already-in-use')) return 'This email is already in use.';
  if (lower.includes('weak-password')) return 'Please choose a stronger password.';
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch'))
    return 'Check your connection and try again.';
  if (lower.includes('too-many-requests')) return 'Too many attempts. Please try again in a few minutes.';

  // HTTP / API
  if (lower.includes('timeout')) return 'Request timed out. Please try again.';
  if (lower.includes('unauthorized') || lower.includes('401'))
    return 'Please sign in and try again.';
  if (lower.includes('forbidden') || lower.includes('403'))
    return "You don't have permission to do that.";
  if (lower.includes('not found') || lower.includes('404'))
    return "We couldn't find that. Please refresh or try again.";
  if (lower.includes('500') || lower.includes('internal server error'))
    return 'Something went wrong on our end. Please try again in a moment.';

  // Stripe / payments
  if (lower.includes('card_declined') || lower.includes('card was declined'))
    return 'Your card was declined. Please try a different card or payment method.';
  if (lower.includes('insufficient_funds')) return 'Insufficient funds. Please use another payment method.';
  if (lower.includes('stripe') && !lower.includes('connect')) return 'Payment failed. Please try again or use a different card.';

  // Firestore / permission
  if (lower.includes('permission-denied') || lower.includes('permission denied'))
    return "You don't have permission to do that. Please sign in again or contact support.";
  if (lower.includes('unavailable') || lower.includes('resource-exhausted'))
    return 'Service is busy. Please try again in a moment.';

  // Short, plain-English messages we can show (e.g. "Listing not found")
  if (msg.length <= 80 && !/[\d]{3,}|auth\/|firebase|error\s*\(/i.test(msg))
    return msg;

  return fallback;
}

/**
 * Returns true if the message looks like a dev/technical error and should never be shown to users.
 */
function isTechnicalMessage(lower: string): boolean {
  if (lower.length > 200) return true; // Likely stack trace or long log
  if (lower.includes('firebase') || lower.includes('auth/')) return true;
  if (lower.includes('error (auth/') || lower.includes('error(auth/')) return true;
  if (lower.includes(' at ') && (lower.includes('.ts:') || lower.includes('.js:') || lower.includes('.tsx:')))
    return true;
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('econnreset'))
    return true;
  if (lower.includes('undefined') || lower.includes('null') || lower.includes('object object'))
    return true;
  if (/\b(ecode|errno|exception|stack)\b/.test(lower)) return true;
  if (/^\d{3}\s/.test(lower) || lower.startsWith('error:') || lower.startsWith('err:')) return true;
  return false;
}
