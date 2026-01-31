/**
 * Server-only listing fetch for SSR (e.g. listing detail page shell).
 * Uses Firebase Admin SDK. Do not import in client bundles.
 */

import { getAdminDb } from '@/lib/firebase/admin';
import type { Listing, ListingAttributes, ListingCategory, ListingDurationDays, ListingEndedReason } from '@/lib/types';
import { normalizeCategory } from '@/lib/listings/normalizeCategory';
import { normalizeListingForUI } from '@/lib/listings/duration';

/** Admin Timestamp or serialized { seconds, nanoseconds } to Date */
function timestampToDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) return d;
    } catch {
      // ignore
    }
  }
  const seconds = (value as { seconds?: number })?.seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) {
    const d = new Date(seconds * 1000);
    return Number.isFinite(d.getTime()) ? d : undefined;
  }
  return undefined;
}

/** Migrate old metadata to attributes (mirrors lib/firebase/listings.ts for server) */
function migrateAttributes(docData: Record<string, unknown> & { id: string }): ListingAttributes {
  if (docData.attributes && typeof docData.attributes === 'object') {
    return docData.attributes as ListingAttributes;
  }
  const oldMetadata = docData.metadata as Record<string, unknown> | undefined;
  const category = docData.category as string | undefined;
  let mappedCategory: ListingCategory = 'wildlife_exotics';
  try {
    mappedCategory = normalizeCategory(category || 'wildlife_exotics');
  } catch {
    mappedCategory = 'wildlife_exotics';
  }
  if (mappedCategory === 'wildlife_exotics') {
    return {
      speciesId: String(oldMetadata?.breed || 'other_exotic'),
      sex: 'unknown',
      age: oldMetadata?.age != null ? String(oldMetadata.age) : undefined,
      quantity: Number(oldMetadata?.quantity || 1),
      animalIdDisclosure: true,
      healthDisclosure: true,
      healthNotes: oldMetadata?.healthStatus != null ? String(oldMetadata.healthStatus) : undefined,
      transportDisclosure: true,
    } as ListingAttributes;
  }
  if (mappedCategory === 'horse_equestrian') {
    return {
      speciesId: 'horse',
      sex: 'unknown',
      age: oldMetadata?.age != null ? String(oldMetadata.age) : undefined,
      registered: Boolean(oldMetadata?.papers || false),
      registrationOrg: oldMetadata?.registrationOrg != null ? String(oldMetadata.registrationOrg) : undefined,
      registrationNumber: oldMetadata?.registrationNumber != null ? String(oldMetadata.registrationNumber) : undefined,
      identification: {
        microchip: oldMetadata?.microchip != null ? String(oldMetadata.microchip) : undefined,
        brand: oldMetadata?.brand != null ? String(oldMetadata.brand) : undefined,
        tattoo: oldMetadata?.tattoo != null ? String(oldMetadata.tattoo) : undefined,
        markings: oldMetadata?.markings != null ? String(oldMetadata.markings) : undefined,
      },
      disclosures: {
        identificationDisclosure: true,
        healthDisclosure: true,
        transportDisclosure: true,
        titleOrLienDisclosure: true,
      },
      quantity: Number(oldMetadata?.quantity || 1),
    } as ListingAttributes;
  }
  if (mappedCategory === 'cattle_livestock') {
    return {
      breed: String(oldMetadata?.breed || 'Unknown'),
      sex: 'unknown',
      age: oldMetadata?.age != null ? String(oldMetadata.age) : undefined,
      registered: Boolean(oldMetadata?.papers || false),
      registrationNumber: oldMetadata?.registrationNumber != null ? String(oldMetadata.registrationNumber) : undefined,
      quantity: Number(oldMetadata?.quantity || 1),
      identificationDisclosure: true,
      healthDisclosure: true,
      healthNotes: oldMetadata?.healthStatus != null ? String(oldMetadata.healthStatus) : undefined,
    } as ListingAttributes;
  }
  return {
    equipmentType: 'other',
    condition: 'good',
    quantity: Number(oldMetadata?.quantity || 1),
  } as ListingAttributes;
}

/**
 * Fetch a single listing by ID for SSR (server shell / metadata).
 * Returns plain Listing shape (Dates are serialized when passed to client).
 * Returns null if not found or if Admin is not configured (e.g. static build).
 */
export async function getListingForSSR(id: string): Promise<Listing | null> {
  try {
    const db = getAdminDb();
    const snap = await db.collection('listings').doc(id).get();
    if (!snap.exists) return null;
    const docData = snap.data() as Record<string, unknown>;
    const docId = snap.id;
    const d = { ...docData, id: docId } as Record<string, unknown> & { id: string };

    const legacySeller = d.sellerSnapshot
      ? {
          id: d.sellerId as string,
          name: (d.sellerSnapshot as { displayName?: string }).displayName ?? 'Seller',
          rating: 0,
          responseTime: 'N/A',
          verified: (d.sellerSnapshot as { verified?: boolean }).verified ?? false,
        }
      : undefined;

    const attributes = migrateAttributes(d);
    let normalizedCategory: ListingCategory = 'wildlife_exotics';
    try {
      normalizedCategory = normalizeCategory((d.category as string) || 'wildlife_exotics');
    } catch {
      normalizedCategory = 'wildlife_exotics';
    }

    const photoSnapshot = d.photos as Array<{ photoId?: string; url?: string; width?: number; height?: number; sortOrder?: number; focalPoint?: { x: number; y: number }; cropZoom?: number; cropAspect?: number }> | undefined;
    const normalizedPhotos =
      Array.isArray(photoSnapshot) && photoSnapshot.length
        ? photoSnapshot
            .map((p) => ({
              photoId: String(p.photoId),
              url: String(p.url),
              width: typeof p.width === 'number' ? p.width : undefined,
              height: typeof p.height === 'number' ? p.height : undefined,
              sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : undefined,
              focalPoint:
                p?.focalPoint && typeof p.focalPoint === 'object' && typeof p.focalPoint.x === 'number' && typeof p.focalPoint.y === 'number'
                  ? { x: Math.max(0, Math.min(1, p.focalPoint.x)), y: Math.max(0, Math.min(1, p.focalPoint.y)) }
                  : undefined,
              cropZoom: typeof p?.cropZoom === 'number' && Number.isFinite(p.cropZoom) ? Math.max(1, Math.min(3, p.cropZoom)) : undefined,
              cropAspect: typeof p?.cropAspect === 'number' && Number.isFinite(p.cropAspect) ? p.cropAspect : undefined,
            }))
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        : undefined;
    const derivedImages = normalizedPhotos?.map((p) => p.url).filter(Boolean) ?? (d.images as string[] | undefined) ?? [];

    const listing: Listing = {
      id: docId,
      title: d.title as string,
      description: d.description as string,
      type: d.type as Listing['type'],
      category: normalizedCategory,
      status: d.status as Listing['status'],
      price: d.price as number | undefined,
      currentBid: d.currentBid as number | undefined,
      currentBidderId: d.currentBidderId as string | undefined,
      reservePrice: d.reservePrice as number | undefined,
      startingBid: d.startingBid as number | undefined,
      images: derivedImages,
      photoIds: Array.isArray(d.photoIds) ? (d.photoIds as unknown[]).map(String) : undefined,
      photos: normalizedPhotos,
      coverPhotoId: d.coverPhotoId != null ? String(d.coverPhotoId) : undefined,
      location: (d.location as Listing['location']) || { city: 'Unknown', state: 'Unknown' },
      sellerId: d.sellerId as string,
      sellerSnapshot: d.sellerSnapshot as Listing['sellerSnapshot'],
      sellerTier: d.sellerTierSnapshot as Listing['sellerTier'],
      seller: legacySeller,
      trust: (d.trust as Listing['trust']) || { verified: false, insuranceAvailable: false, transportReady: false },
      subcategory: d.subcategory as string | undefined,
      attributes,
      endsAt: timestampToDate(d.endsAt),
      startAt: timestampToDate(d.startAt),
      endAt: timestampToDate(d.endAt),
      durationDays: (typeof d.durationDays === 'number' && [1, 3, 5, 7, 10].includes(d.durationDays) ? d.durationDays : undefined) as ListingDurationDays | undefined,
      endedAt: timestampToDate(d.endedAt) || null,
      endedReason: (typeof d.endedReason === 'string' ? d.endedReason : undefined) as ListingEndedReason | undefined,
      soldAt: timestampToDate(d.soldAt) || null,
      soldPriceCents: typeof d.soldPriceCents === 'number' ? d.soldPriceCents : null,
      saleType: (typeof d.saleType === 'string' ? d.saleType : undefined) as Listing['saleType'],
      featured: d.featured as boolean | undefined,
      featuredUntil: timestampToDate(d.featuredUntil),
      metrics: (d.metrics as Listing['metrics']) || { views: 0, favorites: 0, bidCount: 0 },
      watcherCount: typeof d.watcherCount === 'number' ? d.watcherCount : undefined,
      createdAt: timestampToDate(d.createdAt) || new Date(),
      updatedAt: timestampToDate(d.updatedAt) || new Date(),
      createdBy: d.createdBy as string,
      updatedBy: d.updatedBy as string | undefined,
      publishedAt: timestampToDate(d.publishedAt),
      pendingReason: (d.pendingReason === 'admin_approval' || d.pendingReason === 'compliance_review' ? d.pendingReason : null) as Listing['pendingReason'],
      rejectedAt: timestampToDate(d.rejectedAt) || null,
      rejectedBy: typeof d.rejectedBy === 'string' ? d.rejectedBy : undefined,
      rejectionReason: typeof d.rejectionReason === 'string' ? d.rejectionReason : undefined,
      approvedAt: timestampToDate(d.approvedAt) || null,
      approvedBy: typeof d.approvedBy === 'string' ? d.approvedBy : undefined,
      resubmittedAt: timestampToDate(d.resubmittedAt) || null,
      resubmittedForRejectionAt: timestampToDate(d.resubmittedForRejectionAt) || null,
      resubmissionCount: typeof d.resubmissionCount === 'number' ? d.resubmissionCount : undefined,
      transportOption: d.transportOption === 'SELLER_TRANSPORT' || d.transportOption === 'BUYER_TRANSPORT' ? d.transportOption : undefined,
      deliveryDetails: d.deliveryDetails && typeof d.deliveryDetails === 'object' ? { ...d.deliveryDetails } : undefined,
      protectedTransactionEnabled: d.protectedTransactionEnabled as boolean | undefined,
      protectedTransactionDays: d.protectedTransactionDays as 7 | 14 | null | undefined,
      protectedTransactionBadge: d.protectedTransactionDays === 7 ? 'PROTECTED_7' : d.protectedTransactionDays === 14 ? 'PROTECTED_14' : null,
      protectedTermsVersion: d.protectedTermsVersion as string | undefined,
      protectedEnabledAt: timestampToDate(d.protectedEnabledAt),
      sellerAttestationAccepted: d.sellerAttestationAccepted as boolean | undefined,
      sellerAttestationAcceptedAt: timestampToDate(d.sellerAttestationAcceptedAt),
      internalFlags: d.internalFlags as Listing['internalFlags'],
      internalFlagsNotes: d.internalFlagsNotes as Listing['internalFlagsNotes'],
      bestOfferEnabled: (d.bestOfferEnabled ?? (d.bestOfferSettings as { enabled?: boolean } | undefined)?.enabled) as boolean | undefined,
      bestOfferMinPrice: (d.bestOfferMinPrice ?? (d.bestOfferSettings as { minPrice?: number } | undefined)?.minPrice) as number | undefined,
      bestOfferAutoAcceptPrice: (d.bestOfferAutoAcceptPrice ?? (d.bestOfferSettings as { autoAcceptPrice?: number } | undefined)?.autoAcceptPrice) as number | undefined,
      bestOfferSettings: d.bestOfferSettings as Listing['bestOfferSettings'],
      offerReservedByOfferId: d.offerReservedByOfferId as string | undefined,
      offerReservedAt: timestampToDate(d.offerReservedAt),
      purchaseReservedByOrderId: typeof d.purchaseReservedByOrderId === 'string' ? d.purchaseReservedByOrderId : undefined,
      purchaseReservedAt: timestampToDate(d.purchaseReservedAt),
      purchaseReservedUntil: timestampToDate(d.purchaseReservedUntil),
      quantityTotal:
        typeof d.quantityTotal === 'number' && Number.isFinite(d.quantityTotal)
          ? Math.max(1, Math.floor(d.quantityTotal))
          : Math.max(1, Math.floor(Number((attributes as { quantity?: number })?.quantity ?? 1) || 1)),
      quantityAvailable:
        typeof d.quantityAvailable === 'number' && Number.isFinite(d.quantityAvailable)
          ? Math.max(0, Math.floor(d.quantityAvailable))
          : Math.max(
              0,
              typeof d.quantityTotal === 'number' && Number.isFinite(d.quantityTotal)
                ? Math.max(1, Math.floor(d.quantityTotal))
                : Math.max(1, Math.floor(Number((attributes as { quantity?: number })?.quantity ?? 1) || 1))
            ),
    };

    return normalizeListingForUI(listing);
  } catch (err) {
    // Admin not configured (e.g. next build without NETLIFY) or permission/not-found
    console.error('[getListingForSSR]', id, err);
    return null;
  }
}
