/**
 * Stripe Configuration and Client Initialization
 */

import Stripe from 'stripe';
import { MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';

/**
 * Get Stripe client instance (server-side only)
 * Returns null if STRIPE_SECRET_KEY is not configured
 * Use this for all Stripe API calls
 */
function getStripeClient(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    typescript: true,
    // Let Stripe use the account's default API version
  });
}

/**
 * Stripe client instance (server-side only)
 * Will be null if STRIPE_SECRET_KEY is not set
 * Use this for all Stripe API calls
 */
export const stripe = getStripeClient();

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return stripe !== null;
}

/**
 * Platform commission percentage (flat for all sellers/categories).
 */
export const PLATFORM_COMMISSION_PERCENT = MARKETPLACE_FEE_PERCENT;

/**
 * Calculate platform fee (application fee) for a given amount
 * @deprecated Use calculatePlatformFeeForPlan() instead to support plan-based fees
 */
export function calculatePlatformFee(amount: number): number {
  return Math.round(amount * PLATFORM_COMMISSION_PERCENT);
}

/**
 * Calculate platform fee based on seller's plan
 * @param amount - Amount in cents
 * @param planId - Seller's plan ID ('free' | 'pro' | 'elite')
 * @returns Platform fee in cents
 */
export function calculatePlatformFeeForPlan(amount: number, _planId: string | null | undefined): number {
  // Exposure Plans do not affect the marketplace fee; keep it flat.
  return calculatePlatformFee(amount);
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
