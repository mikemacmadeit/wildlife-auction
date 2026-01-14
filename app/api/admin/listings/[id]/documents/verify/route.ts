/**
 * POST /api/admin/listings/[id]/documents/verify
 * 
 * Admin-only: Verify or reject a compliance document
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';

// Initialize Firebase Admin
let adminApp: App;
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

const auth = getAuth(adminApp);
const db = getFirestore(adminApp);

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const adminId = decodedToken.uid;

    // Verify admin role
    const adminUserRef = db.collection('users').doc(adminId);
    const adminUserDoc = await adminUserRef.get();
    
    if (!adminUserDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const adminUserData = adminUserDoc.data()!;
    const isAdmin = adminUserData?.role === 'admin' || adminUserData?.role === 'super_admin';
    
    if (!isAdmin) {
      return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const listingId = params.id;
    const body = await request.json();
    const { documentId, status, rejectionReason } = body;

    if (!documentId || !status) {
      return json({ error: 'documentId and status are required' }, { status: 400 });
    }

    if (!['verified', 'rejected'].includes(status)) {
      return json({ error: 'status must be "verified" or "rejected"' }, { status: 400 });
    }

    if (status === 'rejected' && (!rejectionReason || String(rejectionReason).trim().length === 0)) {
      return json({ error: 'rejectionReason is required when rejecting a document' }, { status: 400 });
    }

    // Update document
    const docRef = db.collection('listings').doc(listingId).collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return json({ error: 'Document not found' }, { status: 404 });
    }

    const updateData: Record<string, any> = {
      status,
      verifiedBy: adminId,
      verifiedAt: Timestamp.now(),
    };

    // Never write undefined to Firestore. Only include rejectionReason when rejecting; clear otherwise.
    if (status === 'rejected') {
      updateData.rejectionReason = String(rejectionReason).trim();
    } else {
      updateData.rejectionReason = null;
    }

    await docRef.update(updateData);

    // If TPWD_BREEDER_PERMIT is verified, update listing compliance status
    const docData = docSnap.data()!;
    if (docData.type === 'TPWD_BREEDER_PERMIT' && status === 'verified') {
      const listingRef = db.collection('listings').doc(listingId);
      await listingRef.update({
        complianceStatus: 'approved',
        complianceReviewedBy: adminId,
        complianceReviewedAt: Timestamp.now(),
      });
    }

    return json({
      success: true,
      message: `Document ${status}`,
    });
  } catch (error: any) {
    console.error('Error verifying document:', error);
    return json({ error: error.message || 'Failed to verify document' }, { status: 500 });
  }
}
