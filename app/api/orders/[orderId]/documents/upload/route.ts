/**
 * POST /api/orders/[orderId]/documents/upload
 * 
 * Upload a compliance document for an order (e.g., TPWD transfer approval)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { DocumentType } from '@/lib/types';

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

export async function POST(
  request: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    // Auth check
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const orderId = params.orderId;

    // Verify ownership (buyer or seller)
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    const orderData = orderDoc.data()!;
    if (orderData.buyerId !== userId && orderData.sellerId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Parse body
    const body = await request.json();
    const { documentUrl, type, permitNumber, issuedBy, issuedAt, expiresAt, metadata } = body;

    if (!documentUrl || !type) {
      return NextResponse.json(
        { error: 'documentUrl and type are required' },
        { status: 400 }
      );
    }

    // Validate document type for orders
    const validOrderDocTypes: DocumentType[] = ['TPWD_TRANSFER_APPROVAL', 'DELIVERY_PROOF', 'HEALTH_CERTIFICATE', 'OTHER'];
    if (!validOrderDocTypes.includes(type as DocumentType)) {
      return NextResponse.json(
        { error: `Invalid document type for orders. Must be one of: ${validOrderDocTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Create document
    const documentsRef = db.collection('orders').doc(orderId).collection('documents');
    const docRef = await documentsRef.add({
      type: type as DocumentType,
      documentUrl,
      permitNumber,
      issuedBy,
      issuedAt: issuedAt ? Timestamp.fromDate(new Date(issuedAt)) : undefined,
      expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : undefined,
      status: 'uploaded',
      uploadedBy: userId,
      uploadedAt: Timestamp.now(),
      metadata,
    });

    // Update order transferPermitStatus if TPWD_TRANSFER_APPROVAL uploaded
    if (type === 'TPWD_TRANSFER_APPROVAL') {
      await orderRef.update({
        transferPermitStatus: 'uploaded',
        updatedAt: Timestamp.now(),
      });
    }

    return NextResponse.json({
      success: true,
      documentId: docRef.id,
    });
  } catch (error: any) {
    console.error('Error uploading order document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload document' },
      { status: 500 }
    );
  }
}
