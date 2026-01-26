/**
 * POST /api/admin/sellers/[sellerId]/freeze
 * 
 * Admin-only: Freeze seller account (blocks new listings and checkouts)
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { createAuditLog } from '@/lib/audit/logger';

const freezeSellerSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { sellerId: string } }
) {
  try {
    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: {
          'Retry-After': rateLimitResult.body.retryAfter.toString(),
        },
      });
    }

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const adminId = decodedToken.uid;

    // Verify admin role
    const adminUserRef = db.collection('users').doc(adminId);
    const adminUserDoc = await adminUserRef.get();
    
    if (!adminUserDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const adminUserData = adminUserDoc.data();
    const isAdmin = adminUserData?.role === 'admin' || adminUserData?.role === 'super_admin';
    
    if (!isAdmin) {
      return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = freezeSellerSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { reason, notes } = validation.data;
    const sellerId = params.sellerId;

    // Get seller user document
    const sellerRef = db.collection('users').doc(sellerId);
    const sellerDoc = await sellerRef.get();

    if (!sellerDoc.exists) {
      return json({ error: 'Seller not found' }, { status: 404 });
    }

    const sellerData = sellerDoc.data()!;
    const wasFrozen = sellerData.sellingDisabled === true;

    // Update seller account
    const now = new Date();
    await sellerRef.update({
      sellingDisabled: true,
      sellingDisabledReason: reason,
      sellingDisabledAt: Timestamp.fromDate(now),
      sellingDisabledBy: adminId,
      sellingDisabledNotes: notes || null,
      updatedAt: Timestamp.fromDate(now),
    });

    // Update all orders for this seller to add admin flag
    const ordersRef = db.collection('orders');
    const sellerOrdersQuery = await ordersRef.where('sellerId', '==', sellerId).get();
    
    // Batch update orders (best-effort, non-blocking)
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 500; // Firestore batch limit
    
    for (const orderDoc of sellerOrdersQuery.docs) {
      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        batchCount = 0;
      }
      
      const orderRef = ordersRef.doc(orderDoc.id);
      const currentFlags = orderDoc.data()?.adminFlags || [];
      if (!currentFlags.includes('frozen_seller')) {
        batch.update(orderRef, {
          adminFlags: [...currentFlags, 'frozen_seller'],
          updatedAt: Timestamp.fromDate(now),
        });
        batchCount++;
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }

    // Create audit log
    await createAuditLog(db, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: 'admin_user_selling_disabled',
      targetUserId: sellerId,
      beforeState: {
        sellingDisabled: wasFrozen,
      },
      afterState: {
        sellingDisabled: true,
        sellingDisabledReason: reason,
        sellingDisabledAt: now.toISOString(),
      },
      metadata: {
        sellerId,
        reason,
        notes: notes || null,
      },
      source: 'admin_ui',
    });

    return json({
      success: true,
      sellerId,
      message: wasFrozen ? 'Seller account freeze updated.' : 'Seller account frozen successfully.',
    });
  } catch (error: any) {
    console.error('Error freezing seller:', error);
    return json({ error: 'Failed to freeze seller', message: error.message }, { status: 500 });
  }
}
