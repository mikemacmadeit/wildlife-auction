/**
 * POST /api/orders/[orderId]/confirm-receipt
 *
 * Buyer confirms receipt of the item/animal.
 * Transitions: paid_held/paid/in_transit/delivered → buyer_confirmed (or ready_to_release if eligible)
 */
// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// Route handlers work fine with Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { OrderStatus } from '@/lib/types';

let adminApp: App | undefined;
let auth: ReturnType<typeof getAuth>;
let db: ReturnType<typeof getFirestore>;

async function initializeFirebaseAdmin() {
  if (!adminApp) {
    if (!getApps().length) {
      const serviceAccount = process.env.FIREBASE_PRIVATE_KEY
        ? {
            projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }
        : undefined;

      adminApp = serviceAccount?.projectId && serviceAccount?.clientEmail && serviceAccount?.privateKey
        ? initializeApp({ credential: cert(serviceAccount as any) })
        : initializeApp();
    } else {
      adminApp = getApps()[0];
    }
  }
  auth = getAuth(adminApp);
  db = getFirestore(adminApp);
  return { auth, db };
}

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(request: Request, { params }: { params: { orderId: string } }) {
  try {
    const { auth, db } = await initializeFirebaseAdmin();

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      return json({ error: 'Invalid token' }, { status: 401 });
    }

    const buyerId = decodedToken.uid;
    const orderId = params.orderId;

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only confirm receipt for your own orders' }, { status: 403 });
    }

    const currentStatus = orderData.status as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['paid', 'paid_held', 'in_transit', 'delivered'];
    if (!allowedStatuses.includes(currentStatus)) {
      return json(
        {
          error: 'Invalid status transition',
          details: `Cannot confirm receipt for order with status '${currentStatus}'.`,
        },
        { status: 400 }
      );
    }

    // Require delivery to be marked first
    if (!orderData.deliveredAt && !orderData.deliveryConfirmedAt) {
      return json(
        {
          error: 'Delivery not confirmed',
          details: 'Delivery must be marked as delivered before you can confirm receipt.',
        },
        { status: 400 }
      );
    }

    if (currentStatus === 'disputed') {
      return json({ error: 'Cannot confirm receipt for a disputed order.' }, { status: 400 });
    }

    const now = new Date();
    const updateData: any = {
      status: 'buyer_confirmed' as OrderStatus,
      buyerConfirmedAt: now,
      acceptedAt: now, // legacy
      buyerAcceptedAt: now, // protected transaction legacy
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
    };

    // If protected transaction and no open dispute, mark as ready_to_release
    if (
      orderData.protectedTransactionDaysSnapshot &&
      (!orderData.protectedDisputeStatus || orderData.protectedDisputeStatus === 'none')
    ) {
      updateData.status = 'ready_to_release';
      updateData.payoutHoldReason = 'none';
    }

    await orderRef.update(updateData);

    return json({
      success: true,
      orderId,
      status: updateData.status,
      buyerConfirmedAt: now,
      message:
        updateData.status === 'ready_to_release'
          ? 'Receipt confirmed. Order is ready for admin review and release.'
          : 'Receipt confirmed. Order will be reviewed for release.',
    });
  } catch (error: any) {
    console.error('Error confirming receipt:', error);
    return json({ error: 'Failed to confirm receipt', message: error.message }, { status: 500 });
  }
}

