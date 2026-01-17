/**
 * POST /api/orders/[orderId]/documents/upload
 * 
 * Upload a compliance document for an order (e.g., TPWD transfer approval)
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, production builds can fail resolving an internal Next module
// (`next/dist/server/web/exports/next-response`). Route handlers work fine with Web `Request` / `Response`.
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { DocumentType } from '@/lib/types';
import { z } from 'zod';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

const bodySchema = z.object({
  documentUrl: z.string().url(),
  type: z.string().min(1),
  permitNumber: z.string().max(200).optional(),
  issuedBy: z.string().max(200).optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  metadata: z.any().optional(),
});

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.default);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, { status: rateLimitResult.status });
    }

    const auth = getAdminAuth();
    const db = getAdminDb() as unknown as ReturnType<typeof getFirestore>;

    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const orderId = params.orderId;

    // Verify ownership (buyer or seller)
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      return json({ error: 'Order not found' }, { status: 404 });
    }

    const orderData = orderDoc.data()!;
    if (orderData.buyerId !== userId && orderData.sellerId !== userId) {
      return json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Parse + validate body
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Invalid body' }, { status: 400 });
    }

    const { documentUrl, type, permitNumber, issuedBy, issuedAt, expiresAt, metadata } = parsed.data;

    // Only allow https URLs (prevents javascript:/data: URL injection)
    if (!documentUrl.startsWith('https://')) {
      return json({ error: 'documentUrl must be an https URL' }, { status: 400 });
    }

    // Validate document type for orders
    const validOrderDocTypes: DocumentType[] = ['TPWD_TRANSFER_APPROVAL', 'DELIVERY_PROOF', 'HEALTH_CERTIFICATE', 'OTHER'];
    if (!validOrderDocTypes.includes(type as DocumentType)) {
      return json({ error: `Invalid document type for orders. Must be one of: ${validOrderDocTypes.join(', ')}` }, { status: 400 });
    }

    // Create document
    const documentsRef = db.collection('orders').doc(orderId).collection('documents');
    // IMPORTANT: Never write `undefined` to Firestore (admin SDK will reject).
    const docData: any = {
      type: type as DocumentType,
      documentUrl,
      status: 'uploaded',
      uploadedBy: userId,
      uploadedAt: Timestamp.now(),
    };
    if (permitNumber) docData.permitNumber = permitNumber;
    if (issuedBy) docData.issuedBy = issuedBy;
    if (issuedAt) docData.issuedAt = Timestamp.fromDate(new Date(issuedAt));
    if (expiresAt) docData.expiresAt = Timestamp.fromDate(new Date(expiresAt));
    if (metadata !== undefined) docData.metadata = metadata;

    const docRef = await documentsRef.add(docData);

    // Update order transferPermitStatus if TPWD_TRANSFER_APPROVAL uploaded
    if (type === 'TPWD_TRANSFER_APPROVAL') {
      await orderRef.update({
        transferPermitStatus: 'uploaded',
        updatedAt: Timestamp.now(),
      });
    }

    return json({
      success: true,
      documentId: docRef.id,
    });
  } catch (error: any) {
    console.error('Error uploading order document:', error);
    return json({ error: error.message || 'Failed to upload document' }, { status: 500 });
  }
}
