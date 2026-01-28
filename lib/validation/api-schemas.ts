/**
 * API Request Validation Schemas
 * Using Zod for runtime validation
 */

import { z } from 'zod';

/**
 * Checkout session creation schema
 */
export const createCheckoutSessionSchema = z.object({
  listingId: z.string().min(1, 'Listing ID is required').max(100),
  offerId: z.string().max(100).optional(),
  /**
   * Multi-quantity buy-now support (fixed listings only).
   * Server will validate against listing availability.
   */
  quantity: z.number().int().positive().max(100).optional(),
  /**
   * Payment method selection step.
   * - card: Credit/Debit via Stripe Checkout
   * - ach_debit: US bank account (ACH) via Stripe Checkout
   * - wire: Bank transfer (wire) via Stripe Checkout → redirect to Stripe’s hosted instructions page
   */
  paymentMethod: z.enum(['card', 'ach_debit', 'ach', 'wire']).optional(),
  /**
   * Buyer acknowledgment required for animal categories.
   * Server will enforce when listing category is an animal category.
   */
  buyerAcksAnimalRisk: z.boolean().optional(),
});

/**
 * Wire (bank transfer) intent creation schema
 */
export const createWireIntentSchema = z.object({
  listingId: z.string().min(1, 'Listing ID is required').max(100),
  offerId: z.string().max(100).optional(),
  /**
   * Multi-quantity buy-now support (fixed listings only).
   * Server will validate against listing availability.
   */
  quantity: z.number().int().positive().max(100).optional(),
  /**
   * Buyer acknowledgment required for animal categories.
   * Server will enforce when listing category is an animal category.
   */
  buyerAcksAnimalRisk: z.boolean().optional(),
});

/**
 * Release payment schema (Admin only)
 */
export const releasePaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required').max(100),
});

/**
 * Create Stripe Connect account schema
 */
export const createStripeAccountSchema = z.object({
  // No body params needed - uses auth token
}).strict();

/**
 * Create account link schema
 */
export const createAccountLinkSchema = z.object({
  refreshUrl: z.string().url().optional(),
  returnUrl: z.string().url().optional(),
});

/**
 * Process refund schema (Admin only)
 */
export const processRefundSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required').max(100),
  reason: z.string().min(1, 'Refund reason is required').max(500),
  notes: z.string().max(1000).optional(),
  amount: z.number().positive().optional(), // Partial refund amount (optional - full refund if not provided)
});

/**
 * Admin hold schema
 */
export const adminHoldSchema = z.object({
  hold: z.boolean(),
  reason: z.string().min(1, 'Reason is required').max(200),
  notes: z.string().max(1000).optional(),
});

/**
 * Resolve dispute schema
 */
export const resolveDisputeSchema = z.object({
  resolution: z.enum(['release', 'refund', 'partial_refund']),
  refundAmount: z.number().positive().optional(),
  refundReason: z.string().min(1, 'Refund reason is required').max(500).optional(),
  markFraudulent: z.boolean().optional(),
  adminNotes: z.string().min(1, 'Admin notes are required').max(1000),
});

/**
 * Validate request body against schema
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string; details?: z.ZodError } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return {
        success: false,
        error: firstError?.message || 'Validation failed',
        details: error,
      };
    }
    return {
      success: false,
      error: 'Invalid request data',
    };
  }
}
