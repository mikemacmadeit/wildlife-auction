/**
 * POST /api/help/chat
 *
 * AI Help Chat endpoint (KB-grounded).
 * This endpoint will be fully functional once Knowledge Base is implemented in Phase 3.
 * For now, it returns a placeholder response indicating KB is not yet available.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase/admin';
import { json, getRequestMeta } from '@/app/api/admin/_util';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';

const ChatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  role: z.enum(['buyer', 'seller', 'all']).optional(),
  context: z
    .object({
      pathname: z.string().optional(),
      listingId: z.string().optional(),
      orderId: z.string().optional(),
    })
    .optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })
    )
    .optional(),
});

async function requireUser(request: Request): Promise<{ uid: string | null; db: ReturnType<typeof getAdminDb>; userRole?: 'buyer' | 'seller' | 'all' } | Response> {
  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  // Optional auth - allow anonymous users to use help chat
  const authHeader = request.headers.get('authorization');
  let uid: string | null = null;
  let userRole: 'buyer' | 'seller' | 'all' = 'all';
  
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { getAdminAuth } = await import('@/lib/firebase/admin');
      const auth = getAdminAuth();
      const token = authHeader.slice('Bearer '.length);
      const decoded = await auth.verifyIdToken(token);
      uid = decoded?.uid || null;
      
      // Determine user role by checking if they have seller data
      if (uid) {
        try {
          const userDoc = await db.collection('users').doc(uid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            // Check if user is a seller (has Stripe account or seller data)
            if (userData?.stripeAccountId || userData?.seller || userData?.stripeAccountStatus) {
              userRole = 'seller';
            } else {
              // If they have a profile but no seller data, they're a buyer
              userRole = 'buyer';
            }
          }
        } catch (e) {
          // If we can't check, default to 'all'
          console.warn('[Help Chat] Could not determine user role:', e);
        }
      }
    } catch {
      // Invalid token, continue as anonymous
      uid = null;
    }
  }

  return { uid, db, userRole };
}

export async function POST(request: Request) {
  const rl = await rateLimitMiddleware(RATE_LIMITS.support)(request as any);
  if (!rl.allowed) {
    return json(rl.body, { status: rl.status, headers: { 'Retry-After': String(rl.body.retryAfter || 60) } });
  }

  const ctx = await requireUser(request);
  if (ctx instanceof Response) return ctx;
  const { uid, db, userRole } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });
  }

  // Generate KB-grounded AI response
  const { generateKBGroundedChatResponse } = await import('@/lib/help/ai-chat');
  
  // Use detected role if not provided, fallback to 'all'
  const audience = parsed.data.role || userRole || 'all';
  
  const result = await generateKBGroundedChatResponse({
    userMessage: parsed.data.message,
    audience: audience as 'buyer' | 'seller' | 'all',
    context: parsed.data.context,
    conversationHistory: parsed.data.conversationHistory,
  });
  
  // Generate suggested follow-up questions
  const suggestedQuestions = generateSuggestedQuestions(parsed.data.message, result.answer);

  return json({
    ok: true,
    answer: result.answer,
    sources: result.sources,
    kbAvailable: result.kbAvailable,
    suggestedQuestions,
  });
}

/**
 * Generate suggested follow-up questions based on the user's question and the answer
 */
function generateSuggestedQuestions(userQuestion: string, answer: string): string[] {
  const questionLower = userQuestion.toLowerCase();
  const suggestions: string[] = [];
  
  // Common follow-ups based on question type
  if (questionLower.includes('sign in') || questionLower.includes('login')) {
    suggestions.push('How do I reset my password?', 'Why is my email not verified?');
  } else if (questionLower.includes('list') || questionLower.includes('sell')) {
    suggestions.push('What are the seller fees?', 'How do I add photos to my listing?');
  } else if (questionLower.includes('buy') || questionLower.includes('purchase')) {
    suggestions.push('What payment methods are accepted?', 'How long does delivery take?');
  } else if (questionLower.includes('bid') || questionLower.includes('auction')) {
    suggestions.push('How does proxy bidding work?', 'What is a reserve price?');
  } else if (questionLower.includes('refund') || questionLower.includes('return')) {
    suggestions.push('How do I open a dispute?', 'What if I don\'t receive my order?');
  } else if (questionLower.includes('deliver') || questionLower.includes('ship')) {
    suggestions.push('How do I track my order?', 'What are the delivery options?');
  } else {
    // Generic helpful suggestions
    suggestions.push('How do I contact support?', 'What are the platform fees?');
  }
  
  // Limit to 3 suggestions
  return suggestions.slice(0, 3);
}
