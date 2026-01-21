/**
 * Client-safe Stripe mode detection.
 *
 * Must NEVER show test-only UI in live mode.
 * Prefer explicit env flags; fall back to publishable key prefix.
 */
export function isStripeTestModeClient(): boolean {
  // Preferred explicit config (safe and reliable if set)
  const liveFlag = process.env.NEXT_PUBLIC_STRIPE_LIVEMODE;
  if (liveFlag === 'true') return false;
  if (liveFlag === 'false') return true;

  const mode = process.env.NEXT_PUBLIC_STRIPE_MODE;
  if (mode === 'live') return false;
  if (mode === 'test') return true;

  // Fallback: infer from publishable key prefix
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  if (pk.startsWith('pk_live_')) return false;
  if (pk.startsWith('pk_test_')) return true;

  // Default to safe behavior: don't show test-only UI.
  return false;
}

