/**
 * POST /api/listings/[id]/documents/upload
 * 
 * Upload a compliance document for a listing
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { uploadDocument } from '@/lib/firebase/documents';
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
  { params }: { params: { id: string } }
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

    const listingId = params.id;

    // Verify ownership
    const listingRef = db.collection('listings').doc(listingId);
    const listingDoc = await listingRef.get();
    
    if (!listingDoc.exists) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      );
    }

    const listingData = listingDoc.data()!;
    if (listingData.sellerId !== userId) {
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

    // Upload document (using client SDK helper - will need to adapt for admin SDK)
    // For now, create directly in Firestore
    const documentsRef = db.collection('listings').doc(listingId).collection('documents');
    const docRef = await documentsRef.add({
      type: type as DocumentType,
      documentUrl,
      permitNumber,
      issuedBy,
      issuedAt: issuedAt ? new Date(issuedAt) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      status: 'uploaded',
      uploadedBy: userId,
      uploadedAt: new Date(),
      metadata,
    });

    return NextResponse.json({
      success: true,
      documentId: docRef.id,
    });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload document' },
      { status: 500 }
    );
  }
}
