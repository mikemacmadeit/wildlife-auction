/**
 * POST /api/admin/ai-summary
 * 
 * Admin-only endpoint to generate AI summaries for entities.
 * 
 * Body:
 * {
 *   entityType: 'user' | 'listing' | 'order' | 'support_ticket',
 *   entityId: string,
 *   forceRegenerate?: boolean
 * }
 */

import { z } from 'zod';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { generateAISummary, isAISummaryEnabled, type EntityType } from '@/lib/admin/ai-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  entityType: z.enum(['user', 'listing', 'order', 'support_ticket']),
  entityId: z.string().min(1),
  forceRegenerate: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const rate = await requireRateLimit(request);
  if (!rate.ok) return rate.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;
  const { db } = admin.ctx;

  // Feature flag check
  if (!isAISummaryEnabled()) {
    return json({ ok: false, error: 'AI summary feature is disabled' }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch (e: any) {
    return json({ ok: false, error: 'Invalid request body', details: e?.errors }, { status: 400 });
  }

  const { entityType, entityId, forceRegenerate } = body;

  try {
    // Fetch entity data based on type
    let entityData: any = null;
    let collectionName: string;
    let docRef: FirebaseFirestore.DocumentReference;

    switch (entityType) {
      case 'user': {
        collectionName = 'users';
        docRef = db.collection('users').doc(entityId);
        
        // For users, also fetch summary and notes
        const [userDoc, summaryDoc] = await Promise.all([
          docRef.get(),
          db.collection('userSummaries').doc(entityId).get(),
        ]);
        
        if (!userDoc.exists) {
          return json({ ok: false, error: 'User not found' }, { status: 404 });
        }
        
        entityData = {
          ...userDoc.data(),
          id: userDoc.id,
          uid: userDoc.id,
        };
        
        if (summaryDoc.exists) {
          entityData.summary = summaryDoc.data();
        }
        
        // Fetch recent notes (limit to 5 for summary)
        const notesSnap = await db
          .collection('adminUserNotes')
          .doc(entityId)
          .collection('notes')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get();
        
        entityData.notes = notesSnap.docs.map((d) => ({
          id: d.id,
          note: d.data().note,
          createdAt: d.data().createdAt,
          createdBy: d.data().createdBy,
        }));
        
        // Fetch recent audits (limit to 10 for summary)
        const auditsSnap = await db
          .collection('auditLogs')
          .where('targetUserId', '==', entityId)
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();
        
        entityData.audits = auditsSnap.docs.map((d) => ({
          auditId: d.id,
          actionType: d.data().actionType,
          actorUid: d.data().actorUid,
          actorRole: d.data().actorRole,
          createdAt: d.data().createdAt,
        }));
        
        break;
      }
      
      case 'listing': {
        collectionName = 'listings';
        docRef = db.collection('listings').doc(entityId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) {
          return json({ ok: false, error: 'Listing not found' }, { status: 404 });
        }
        
        entityData = {
          ...docSnap.data(),
          id: docSnap.id,
        };
        
        // Optionally fetch seller profile for context
        if (entityData.sellerId) {
          const sellerDoc = await db.collection('users').doc(entityData.sellerId).get();
          if (sellerDoc.exists) {
            entityData.seller = sellerDoc.data();
          }
        }
        
        break;
      }
      
      case 'order': {
        collectionName = 'orders';
        docRef = db.collection('orders').doc(entityId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) {
          return json({ ok: false, error: 'Order not found' }, { status: 404 });
        }
        
        entityData = {
          ...docSnap.data(),
          id: docSnap.id,
        };
        
        // Optionally fetch related entities for context
        if (entityData.listingId) {
          const listingDoc = await db.collection('listings').doc(entityData.listingId).get();
          if (listingDoc.exists) {
            entityData.listing = listingDoc.data();
          }
        }
        
        if (entityData.buyerId) {
          const buyerDoc = await db.collection('users').doc(entityData.buyerId).get();
          if (buyerDoc.exists) {
            entityData.buyer = buyerDoc.data();
          }
        }
        
        if (entityData.sellerId) {
          const sellerDoc = await db.collection('users').doc(entityData.sellerId).get();
          if (sellerDoc.exists) {
            entityData.seller = sellerDoc.data();
          }
        }
        
        break;
      }
      
      case 'support_ticket': {
        // Support tickets might be in a different collection
        // Adjust based on your actual structure
        collectionName = 'supportTickets';
        docRef = db.collection('supportTickets').doc(entityId);
        const docSnap = await docRef.get();
        
        if (!docSnap.exists) {
          return json({ ok: false, error: 'Support ticket not found' }, { status: 404 });
        }
        
        entityData = {
          ...docSnap.data(),
          id: docSnap.id,
          ticketId: docSnap.id,
        };
        
        break;
      }
      
      default:
        return json({ ok: false, error: 'Invalid entity type' }, { status: 400 });
    }

    // Check if summary already exists (unless force regenerate)
    // For listings, we generate on submission, so if it exists, use it
    // For other entities, check if it's recent (24 hours)
    if (!forceRegenerate) {
      const existingSummary = entityData.aiAdminSummary;
      const existingSummaryAt = entityData.aiAdminSummaryAt;
      
      if (existingSummary && existingSummaryAt) {
        const summaryDate = existingSummaryAt.toDate ? existingSummaryAt.toDate() : new Date(existingSummaryAt);
        
        // For listings, if summary exists, always use it (it was generated on submission)
        // For other entities, check if it's recent (24 hours)
        if (entityType === 'listing') {
          return json({
            ok: true,
            summary: existingSummary,
            model: entityData.aiAdminSummaryModel || 'gpt-4o-mini',
            generatedAt: summaryDate.toISOString(),
            cached: true,
          });
        }
        
        // For other entities, check age
        const ageInHours = (Date.now() - summaryDate.getTime()) / (1000 * 60 * 60);
        if (ageInHours < 24) {
          return json({
            ok: true,
            summary: existingSummary,
            model: entityData.aiAdminSummaryModel || 'gpt-4o-mini',
            generatedAt: summaryDate.toISOString(),
            cached: true,
          });
        }
      }
    }

    // Generate new summary
    let summaryResult;
    try {
      summaryResult = await generateAISummary({
        entityType: entityType as EntityType,
        entityData,
        existingSummary: entityData.aiAdminSummary
          ? {
              summary: entityData.aiAdminSummary,
              generatedAt: entityData.aiAdminSummaryAt?.toDate
                ? entityData.aiAdminSummaryAt.toDate()
                : new Date(entityData.aiAdminSummaryAt),
              model: entityData.aiAdminSummaryModel || 'gpt-4o-mini',
            }
          : null,
      });
    } catch (summaryError: any) {
      console.error('[AI Summary API] Error in generateAISummary:', summaryError);
      return json(
        { 
          ok: false, 
          error: 'Failed to generate summary', 
          message: summaryError?.message || String(summaryError),
          details: 'Check server logs for details'
        }, 
        { status: 500 }
      );
    }

    if (!summaryResult) {
      // Check if feature is enabled and API key is configured
      const isEnabled = process.env.AI_ADMIN_SUMMARY_ENABLED === 'true';
      const hasKey = !!process.env.OPENAI_API_KEY;
      
      return json({ 
        ok: false, 
        error: 'Failed to generate summary',
        reason: !isEnabled ? 'Feature disabled (AI_ADMIN_SUMMARY_ENABLED not set to true)' 
               : !hasKey ? 'OpenAI API key not configured (OPENAI_API_KEY missing)'
               : 'OpenAI API call failed or returned no result'
      }, { status: 500 });
    }

    // Store summary in Firestore
    const { FieldValue } = await import('firebase-admin/firestore');
    await docRef.update({
      aiAdminSummary: summaryResult.summary,
      aiAdminSummaryAt: FieldValue.serverTimestamp(),
      aiAdminSummaryModel: summaryResult.model,
    });

    return json({
      ok: true,
      summary: summaryResult.summary,
      model: summaryResult.model,
      generatedAt: summaryResult.generatedAt.toISOString(),
      cached: false,
    });
  } catch (error: any) {
    console.error('[AI Summary API] Error:', error);
    return json(
      { ok: false, error: 'Failed to generate summary', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}
