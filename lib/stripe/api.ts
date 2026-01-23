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

  // Force token refresh to ensure it's valid
  const token = await getIdToken(user, true);
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
    let errorMessage = 'Failed to create Stripe account';
    let errorDetails: any = {};
    
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
        errorDetails = error;
      } else {
        // Response is HTML (error page), get status text
        errorMessage = `${response.status} ${response.statusText}`;
        const text = await response.text();
        // Try to extract error from HTML if possible
        const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (match) {
          errorMessage = match[1];
        }
      }
    } catch (parseError) {
      // If parsing fails, use status text
      errorMessage = `${response.status} ${response.statusText}`;
    }
    
    // Don't log expected configuration errors
    const isConfigError = errorMessage.includes('Stripe is not configured') || 
                          errorMessage.includes('STRIPE_SECRET_KEY') ||
                          errorMessage.includes('503');
    if (!isConfigError) {
      console.error('Failed to create Stripe account:', errorMessage);
      if (errorDetails && Object.keys(errorDetails).length > 0) {
        console.error('Error details:', errorDetails);
      }
    }
    const err: any = new Error(errorMessage);
    if (errorDetails?.code) err.code = errorDetails.code;
    if (errorDetails?.actionUrl) err.actionUrl = errorDetails.actionUrl;
    if (errorDetails?.message) err.detailsMessage = errorDetails.message;
    if (errorDetails?.stripe?.requestLogUrl) err.requestLogUrl = errorDetails.stripe.requestLogUrl;
    if (errorDetails?.stripe?.requestId) err.requestId = errorDetails.stripe.requestId;
    if (errorDetails?.stripe?.platformAccountId) err.platformAccountId = errorDetails.stripe.platformAccountId;
    if (typeof errorDetails?.stripe?.platformLivemode === 'boolean') err.platformLivemode = errorDetails.stripe.platformLivemode;
    throw err;
  }

  return response.json();
}

/**
 * Check Stripe Connect account status and update user document
 */
export async function checkStripeAccountStatus(): Promise<{
  success: boolean;
  status: {
    onboardingStatus: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue?: string[];
    requirementsErrors?: any[];
    requirementsPending?: string[];
    hasPendingRequirements?: boolean;
    capabilities?: any;
  };
  debug?: any;
  message?: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  // Force token refresh to ensure it's valid
  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`${API_BASE}/connect/check-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let errorMessage = 'Failed to check account status';
    let errorDetails: any = {};
    
    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
        errorDetails = error;
      } else {
        errorMessage = `${response.status} ${response.statusText}`;
      }
    } catch (parseError) {
      errorMessage = `${response.status} ${response.statusText}`;
    }
    
    const isConfigError = errorMessage.includes('Stripe is not configured') || 
                          errorMessage.includes('STRIPE_SECRET_KEY') ||
                          errorMessage.includes('503');
    if (!isConfigError) {
      console.error('Failed to check account status:', errorMessage);
      if (errorDetails && Object.keys(errorDetails).length > 0) {
        console.error('Error details:', errorDetails);
      }
    }
    const err: any = new Error(errorMessage);
    if (errorDetails?.code) err.code = errorDetails.code;
    if (errorDetails?.type) err.type = errorDetails.type;
    if (errorDetails?.stripe?.code) err.stripeCode = errorDetails.stripe.code;
    if (errorDetails?.stripe?.type) err.stripeType = errorDetails.stripe.type;
    if (errorDetails?.stripe?.message) err.stripeMessage = errorDetails.stripe.message;
    throw err;
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

  // Force token refresh to ensure it's valid
  const token = await getIdToken(user, true);
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
    let errorMessage = 'Failed to create onboarding link';
    let errorDetails: any = {};

    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        errorDetails = error;
        errorMessage = error.error || error.message || errorMessage;
      } else {
        errorMessage = `${response.status} ${response.statusText}`;
        const text = await response.text();
        const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (match) errorMessage = match[1];
      }
    } catch {
      errorMessage = `${response.status} ${response.statusText}`;
    }

    // Don't log expected configuration errors
    const isConfigError = errorMessage.includes('Stripe is not configured') || 
                          errorMessage.includes('STRIPE_SECRET_KEY');
    if (!isConfigError) {
      console.error('Failed to create onboarding link:', errorMessage);
    }
    const err: any = new Error(errorMessage);
    if (errorDetails?.code) err.code = errorDetails.code;
    if (errorDetails?.actionUrl) err.actionUrl = errorDetails.actionUrl;
    if (errorDetails?.message) err.detailsMessage = errorDetails.message;
    if (errorDetails?.stripe?.requestId) err.requestId = errorDetails.stripe.requestId;
    if (errorDetails?.stripe?.platformAccountId) err.platformAccountId = errorDetails.stripe.platformAccountId;
    if (typeof errorDetails?.stripe?.platformLivemode === 'boolean') err.platformLivemode = errorDetails.stripe.platformLivemode;
    if (errorDetails?.stripe?.requestLogUrl) err.requestLogUrl = errorDetails.stripe.requestLogUrl;
    throw err;
  }

  return response.json();
}

/**
 * Create a Stripe Connect Express dashboard login link.
 * Sellers use this to manage payout settings (bank account) inside Stripe.
 */
export async function createConnectLoginLink(): Promise<{ url: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`${API_BASE}/connect/create-login-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let errorMessage = 'Failed to create Stripe login link';
    let errorDetails: any = {};

    try {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await response.json();
        errorDetails = error;
        errorMessage = error.error || error.message || errorMessage;
      } else {
        errorMessage = `${response.status} ${response.statusText}`;
      }
    } catch {
      errorMessage = `${response.status} ${response.statusText}`;
    }

    const err: any = new Error(errorMessage);
    if (errorDetails?.code) err.code = errorDetails.code;
    throw err;
  }

  return response.json();
}

/**
 * Create a Stripe Checkout session for purchasing a listing
 */
export async function createCheckoutSession(
  listingId: string,
  offerId?: string,
  paymentMethod?: 'card' | 'ach_debit',
  quantity?: number,
  opts?: { buyerAcksAnimalRisk?: boolean }
): Promise<{ url: string; sessionId: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  // Force token refresh to ensure it's valid
  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`${API_BASE}/checkout/create-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      listingId,
      ...(offerId ? { offerId } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(typeof quantity === 'number' && Number.isFinite(quantity) ? { quantity } : {}),
      ...(opts?.buyerAcksAnimalRisk === true ? { buyerAcksAnimalRisk: true } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    const errorMessage =
      error.message ||
      (error.code ? `${error.code}: ${error.error || 'Checkout failed'}` : undefined) ||
      error.error ||
      'Failed to create checkout session';
    // Don't log expected configuration errors
    const isConfigError = errorMessage.includes('Stripe is not configured') || 
                          errorMessage.includes('STRIPE_SECRET_KEY');
    if (!isConfigError) {
      console.error('Failed to create checkout session:', errorMessage);
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function createWireIntent(
  listingId: string,
  offerId?: string,
  quantity?: number,
  opts?: { buyerAcksAnimalRisk?: boolean }
): Promise<{
  orderId: string;
  paymentIntentId: string;
  paymentMethod: 'wire';
  status: 'awaiting_wire';
  instructions: { reference: string; financialAddresses: Array<{ type: string; address: any }> };
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`${API_BASE}/wire/create-intent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      listingId,
      ...(offerId ? { offerId } : {}),
      ...(typeof quantity === 'number' && Number.isFinite(quantity) ? { quantity } : {}),
      ...(opts?.buyerAcksAnimalRisk === true ? { buyerAcksAnimalRisk: true } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({} as any));
    const errorMessage =
      error.message ||
      (error.code ? `${error.code}: ${error.error || 'Wire setup failed'}` : undefined) ||
      error.error ||
      'Failed to create wire transfer instructions';
    const err: any = new Error(errorMessage);
    if (error?.stripe?.requestId) err.requestId = error.stripe.requestId;
    if (error?.stripe?.code) err.stripeCode = error.stripe.code;
    if (error?.stripe?.type) err.stripeType = error.stripe.type;
    throw err;
  }

  return response.json();
}

/**
 * Release held funds to seller (Admin only)
 * Creates a Stripe transfer to the seller's connected account
 */
export async function releasePayment(orderId: string): Promise<{
  success: boolean;
  transferId: string;
  amount: number;
  message: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  // Force token refresh to ensure it's valid
  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  // Canonical admin release endpoint (order-scoped)
  const response = await fetch(`/api/admin/orders/${orderId}/release`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({} as any));
    const errorMessage = error.error || error.message || 'Failed to release payment';

    // Bubble up structured context so Admin Ops can show actionable info (and so we can detect key/account mismatch).
    const err: any = new Error(errorMessage);
    if (error?.holdReasonCode) err.holdReasonCode = error.holdReasonCode;
    if (error?.stripeDebug) err.stripeDebug = error.stripeDebug;

    // Helpful suffix for the common test-mode failure.
    if (error?.holdReasonCode === 'STRIPE_INSUFFICIENT_AVAILABLE_BALANCE' && error?.stripeDebug) {
      const dbg = error.stripeDebug;
      const av = typeof dbg.availableUsdCents === 'number' ? (dbg.availableUsdCents / 100).toFixed(2) : 'unknown';
      const pd = typeof dbg.pendingUsdCents === 'number' ? (dbg.pendingUsdCents / 100).toFixed(2) : 'unknown';
      const acct = dbg.platformAccountId ? String(dbg.platformAccountId) : 'unknown';
      const live = typeof dbg.platformLivemode === 'boolean' ? String(dbg.platformLivemode) : 'unknown';
      err.message = `${errorMessage} (Stripe account ${acct}, livemode=${live}, USD available=$${av}, pending=$${pd})`;
    }

    console.error('Failed to release payment:', err.message, error);
    throw err;
  }

  return response.json();
}

/**
 * Admin-only: Mark bank/wire order as paid_held (fallback if webhook delivery fails)
 */
export async function adminMarkOrderPaid(orderId: string): Promise<{ success: boolean; orderId: string; status: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('User must be authenticated');

  const token = await getIdToken(user, true);
  if (!token) throw new Error('Failed to get authentication token');

  const response = await fetch(`/api/admin/orders/${orderId}/mark-paid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to mark order paid');
  }

  return response.json();
}

/**
 * Process refund (Admin only)
 * Creates a Stripe refund for an order
 */
export async function processRefund(orderId: string, reason: string, amount?: number, notes?: string): Promise<{
  success: boolean;
  refundId: string;
  amount: number;
  isFullRefund: boolean;
  message: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  // Force token refresh to ensure it's valid
  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`${API_BASE}/refunds/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, reason, amount, notes }),
  });

  if (!response.ok) {
    const error = await response.json();
    const errorMessage = error.error || error.message || 'Failed to process refund';
    console.error('Failed to process refund:', errorMessage, error);
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Confirm receipt (buyer)
 * NOTE: `acceptOrder` is kept for backward compatibility with older UI code.
 */
export async function acceptOrder(orderId: string): Promise<{
  success: boolean;
  orderId: string;
  status: string;
  message: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`/api/orders/${orderId}/confirm-receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    const errorMessage = error.error || 'Failed to accept order';
    console.error('Failed to accept order:', errorMessage, error);
    throw new Error(errorMessage);
  }

  return response.json();
}

export const confirmReceipt = acceptOrder;

/**
 * Open a dispute on an order
 */
export async function disputeOrder(
  orderId: string,
  reason: string,
  notes?: string
): Promise<{
  success: boolean;
  orderId: string;
  status: string;
  message: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`/api/orders/${orderId}/dispute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason, notes }),
  });

  if (!response.ok) {
    const error = await response.json();
    const errorMessage = error.error || 'Failed to open dispute';
    console.error('Failed to open dispute:', errorMessage, error);
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Admin-only: Resolve a dispute
 */
export async function resolveDispute(
  orderId: string,
  resolution: 'release' | 'refund' | 'partial_refund',
  refundAmount?: number,
  refundReason?: string,
  markFraudulent?: boolean,
  adminNotes?: string
): Promise<{ success: boolean; message: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`/api/orders/${orderId}/disputes/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ resolution, refundAmount, refundReason, markFraudulent, adminNotes: adminNotes || '' }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to resolve dispute');
  }

  return response.json();
}

/**
 * Admin-only: Confirm delivery and start protection window
 */
export async function confirmDelivery(orderId: string): Promise<{ success: boolean; message: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`/api/orders/${orderId}/confirm-delivery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to confirm delivery');
  }

  return response.json();
}

/**
 * Admin-only: Run reconciliation check
 */
export async function runReconciliation(params?: {
  orderId?: string;
  listingId?: string;
  buyerEmail?: string;
  sellerEmail?: string;
  paymentIntentId?: string;
  limit?: number;
}): Promise<{
  success: boolean;
  summary: {
    totalIssues: number;
    errorCount: number;
    warningCount: number;
    ordersChecked: number;
  };
  issues: Array<{
    type: string;
    severity: 'error' | 'warning';
    orderId?: string;
    listingId?: string;
    stripeId?: string;
    description: string;
    firestoreData?: any;
    stripeData?: any;
  }>;
  issuesByType: Record<string, any[]>;
  checkedAt: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const searchParams = new URLSearchParams();
  if (params?.orderId) searchParams.append('orderId', params.orderId);
  if (params?.listingId) searchParams.append('listingId', params.listingId);
  if (params?.buyerEmail) searchParams.append('buyerEmail', params.buyerEmail);
  if (params?.sellerEmail) searchParams.append('sellerEmail', params.sellerEmail);
  if (params?.paymentIntentId) searchParams.append('paymentIntentId', params.paymentIntentId);
  if (params?.limit) searchParams.append('limit', params.limit.toString());

  const response = await fetch(`/api/admin/reconcile?${searchParams.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to run reconciliation');
  }

  return response.json();
}

/**
 * Admin-only: Fetch orders with server-side filtering
 */
// NOTE: filter value `'escrow'` is a legacy internal key meaning "payout holds" (paid funds awaiting delayed payout release).
// Keep the key for backward compatibility with server-side filtering and admin UI wiring.
export async function getAdminOrders(filter: 'escrow' | 'protected' | 'disputes' | 'ready_to_release' | 'all' = 'all', limit: number = 100, cursor?: string): Promise<{ orders: any[]; nextCursor: string | null; hasMore: boolean }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const params = new URLSearchParams({ filter, limit: limit.toString() });
  if (cursor) params.append('cursor', cursor);

  const response = await fetch(`/api/admin/orders?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to fetch admin orders');
  }

  return response.json();
}

/**
 * Admin-only: Set admin hold on an order
 */
export async function adminSetOrderHold(orderId: string, hold: boolean, reason: string, notes?: string): Promise<{ success: boolean; orderId: string; adminHold: boolean; message: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch(`/api/orders/${orderId}/admin-hold`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ hold, reason, notes }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to update admin hold');
  }

  return response.json();
}

/**
 * Create a Stripe subscription for Seller Tiers (Priority/Premier)
 */
export async function createSubscription(planId: 'priority' | 'premier' | 'pro' | 'elite'): Promise<{
  subscriptionId: string;
  clientSecret: string;
  status: string;
  hostedInvoiceUrl?: string | null;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch('/api/stripe/subscriptions/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ planId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const msg = error?.error || error?.message || 'Failed to create subscription';
    // Preserve a stable "code" for callers that want to degrade gracefully.
    const e: any = new Error(msg);
    if (error?.code) e.code = error.code;
    if (error?.planId) e.planId = error.planId;
    throw e;
  }

  return response.json();
}

/**
 * Cancel a Stripe subscription
 */
export async function cancelSubscription(immediately: boolean = false): Promise<{
  success: boolean;
  subscriptionId: string;
  status: string;
  canceledAtPeriodEnd: boolean;
  message: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch('/api/stripe/subscriptions/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ immediately }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to cancel subscription');
  }

  return response.json();
}

/**
 * Create a Stripe Billing Portal session
 */
export async function createBillingPortalSession(): Promise<{ url: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated');
  }

  const token = await getIdToken(user, true);
  if (!token) {
    throw new Error('Failed to get authentication token');
  }

  const response = await fetch('/api/stripe/billing-portal/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || 'Failed to create billing portal session');
  }

  return response.json();
}
