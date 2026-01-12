/**
 * Stripe API Client Functions
 * Client-side functions to call Stripe Connect API routes
 */

import { getIdToken } from '@/lib/firebase/auth-helper';
import { auth } from '@/lib/firebase/config';

const API_BASE = '/api/stripe';

/**
 * Create a Stripe Connect Express account
 */
export async function createStripeAccount(): Promise<{ stripeAccountId: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`${API_BASE}/connect/create-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create Stripe account');
  }

  return response.json();
}

/**
 * Create an onboarding link for Stripe Connect account
 */
export async function createAccountLink(): Promise<{ url: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`${API_BASE}/connect/create-account-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create onboarding link');
  }

  return response.json();
}

/**
 * Create a Stripe Checkout session for purchasing a listing
 */
export async function createCheckoutSession(listingId: string): Promise<{ url: string; sessionId: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`${API_BASE}/checkout/create-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ listingId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create checkout session');
  }

  return response.json();
}
