/**
 * POST /api/orders/[orderId]/dispute
 * 
 * Buyer opens a dispute on the order
 * Transitions: paid/in_transit/delivered → disputed
 * Blocks release until admin resolves
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { OrderStatus } from '@/lib/types';
import { z } from 'zod';

// Initialize Firebase Admin
let adminApp: App | undefined;
let auth: ReturnType<typeof getAuth>;
let db: ReturnType<typeof getFirestore>;

async function initializeFirebaseAdmin() {
  if (!adminApp) {
    if (!getApps().length) {
      try {
        const serviceAccount = process.env.FIREBASE_PRIVATE_KEY
          ? {
              projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }
          : undefined;

        if (serviceAccount?.projectId && serviceAccount?.clientEmail && serviceAccount?.privateKey) {
          adminApp = initializeApp({
            credential: cert(serviceAccount as any),
          });
        } else {
          adminApp = initializeApp();
        }
      } catch (error) {
        console.error('Firebase Admin initialization error:', error);
        throw error;
      }
    } else {
      adminApp = getApps()[0];
    }
  }
  auth = getAuth(adminApp);
  db = getFirestore(adminApp);
  return { auth, db };
}

const disputeSchema = z.object({
  reason: z.string().min(1, 'Dispute reason is required').max(200, 'Reason too long'),
  notes: z.string().max(1000, 'Notes too long').optional(),
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
  { params }: { params: { orderId: string } }
) {
  try {
    const { auth, db } = await initializeFirebaseAdmin();

    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
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

    const buyerId = decodedToken.uid;
    const orderId = params.orderId;

    // Parse and validate request body
    const body = await request.json();
    const validation = disputeSchema.safeParse(body);
    if (!validation.success) {
      return json({ error: 'Invalid request data', details: validation.error.flatten() }, { status: 400 });
    }

    const { reason, notes } = validation.data;

    // Get order
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;

    // Verify buyer owns this order
    if (orderData.buyerId !== buyerId) {
      return json({ error: 'Unauthorized - You can only dispute your own orders' }, { status: 403 });
    }

    // Validate status transition
    const currentStatus = orderData.status as OrderStatus;
    const allowedStatuses: OrderStatus[] = ['paid', 'in_transit', 'delivered'];
    
    if (!allowedStatuses.includes(currentStatus)) {
      return json(
        { 
          error: 'Invalid status transition',
          details: `Cannot dispute order with status '${currentStatus}'. Order must be in one of: ${allowedStatuses.join(', ')}`
        },
        { status: 400 }
      );
    }

    // Check if already disputed
    if (currentStatus === 'disputed') {
      return json({ error: 'Order already disputed' }, { status: 400 });
    }

    // Check if already accepted or completed
    if (currentStatus === 'accepted' || currentStatus === 'completed') {
      return json({ error: 'Cannot dispute an order that has been accepted or completed' }, { status: 400 });
    }

    // Check if dispute deadline has passed
    const disputeDeadline = orderData.disputeDeadlineAt?.toDate();
    if (disputeDeadline && disputeDeadline.getTime() < Date.now()) {
      return json(
        { 
          error: 'Dispute deadline has passed',
          details: `The dispute window closed on ${disputeDeadline.toISOString()}`
        },
        { status: 400 }
      );
    }

    // Check if funds already released
    if (orderData.stripeTransferId) {
      return json({ error: 'Cannot dispute order after funds have been released' }, { status: 400 });
    }

    // Update order to disputed
    const now = new Date();
    await orderRef.update({
      status: 'disputed' as OrderStatus,
      disputedAt: now,
      disputeReason: reason,
      disputeNotes: notes || null,
      updatedAt: now,
      lastUpdatedByRole: 'buyer',
    });

    return json({
      success: true,
      orderId,
      status: 'disputed',
      disputedAt: now,
      message: 'Dispute opened successfully. Admin will review and resolve.',
    });
  } catch (error: any) {
    console.error('Error opening dispute:', error);
    return json({ error: 'Failed to open dispute', message: error.message }, { status: 500 });
  }
}
