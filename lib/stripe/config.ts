/**
 * Stripe Configuration and Client Initialization
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

/**
 * Stripe client instance (server-side only)
 * Use this for all Stripe API calls
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  typescript: true,
  // Let Stripe use the account's default API version
});

/**
 * Platform commission percentage (5%)
 */
export const PLATFORM_COMMISSION_PERCENT = 0.05;

/**
 * Calculate platform fee (application fee) for a given amount
 */
export function calculatePlatformFee(amount: number): number {
  return Math.round(amount * PLATFORM_COMMISSION_PERCENT);
}

/**
 * Calculate seller amount (amount minus platform fee)
 */
export function calculateSellerAmount(amount: number): number {
  return amount - calculatePlatformFee(amount);
}

/**
 * Get base URL for the application
 */
export function getAppUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NETLIFY_URL) {
    return process.env.NETLIFY_URL;
  }
  // Default to localhost for development
  return 'http://localhost:3000';
}
