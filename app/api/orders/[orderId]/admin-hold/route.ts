/**
 * POST /api/orders/[orderId]/admin-hold
 * 
 * Admin-only endpoint to place or remove admin hold on an order
 * Prevents auto-release even if deadline passed
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { validateRequest, adminHoldSchema } from '@/lib/validation/api-schemas';
import { createAuditLog } from '@/lib/audit/logger';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

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
  { params }: { params: { orderId: string } }
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
    const validation = validateRequest(adminHoldSchema, body);
    if (!validation.success) {
      return json({ error: validation.error, details: validation.details?.errors }, { status: 400 });
    }

    const { hold, reason, notes } = validation.data;
    const orderId = params.orderId;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Check if already released
    if (orderData.stripeTransferId) {
      return json({ error: 'Cannot modify hold on order after funds have been released' }, { status: 400 });
    }

    // Capture before state for audit
    const beforeState = {
      adminHold: orderData.adminHold,
      adminHoldReason: orderData.adminHoldReason,
    };

    // Update admin hold
    const now = new Date();
    const updateData: any = {
      adminHold: hold,
      updatedAt: now,
      lastUpdatedByRole: 'admin',
      adminHoldReason: reason,
    };

    // Store admin action notes
    if (notes) {
      const existingNotes = orderData.adminActionNotes || [];
      updateData.adminActionNotes = [
        ...existingNotes,
        {
          reason,
          notes,
          actorUid: adminId,
          createdAt: Timestamp.now(),
          action: hold ? 'hold_placed' : 'hold_removed',
        },
      ];
    }

    await orderRef.update(updateData);

    // Create audit log
    await createAuditLog(db, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: hold ? 'admin_hold_placed' : 'admin_hold_removed',
      orderId: orderId,
      listingId: orderData.listingId,
      beforeState,
      afterState: {
        adminHold: hold,
        adminHoldReason: reason || undefined,
      },
      metadata: {
        reason,
        notes: notes || undefined,
      },
      source: 'admin_ui',
    });

    return json({
      success: true,
      orderId,
      adminHold: hold,
      message: hold ? 'Admin hold placed on order' : 'Admin hold removed from order',
    });
  } catch (error: any) {
    console.error('Error updating admin hold:', error);
    return json({ error: 'Failed to update admin hold', message: error.message }, { status: 500 });
  }
}
