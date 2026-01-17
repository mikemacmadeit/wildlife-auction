import { Timestamp } from 'firebase-admin/firestore';

export interface SellerDashboardListing {
  id: string;
  title: string;
  type: string;
  category?: string;
  status: string;
  price?: number;
  currentBid?: number;
  reservePrice?: number;
  startingBid?: number;
  endsAt?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  bidCount: number;
  watcherCount: number;
}

export interface SellerDashboardOrder {
  id: string;
  listingId: string;
  listingTitle?: string;
  buyerId: string;
  amount: number;
  status: string;
  createdAt?: string | null;
  deliveredAt?: string | null;
  deliveryConfirmedAt?: string | null;
  buyerConfirmedAt?: string | null;
  stripeTransferId?: string | null;
  protectedTransactionDaysSnapshot?: number | null;
}

export interface SellerDashboardOffer {
  id: string;
  listingId: string;
  listingTitle?: string;
  buyerId: string;
  status: string;
  currentAmount: number;
  expiresAt?: string | null;
  updatedAt?: string | null;
  lastActorRole?: string | null;
}

export interface SellerDashboardData {
  sellerId: string;
  generatedAt: string;

  activeListings: SellerDashboardListing[];
  draftListings: SellerDashboardListing[];
  offers: SellerDashboardOffer[];
  soldListings: {
    last30d: SellerDashboardOrder[];
    last90d: SellerDashboardOrder[];
    all: SellerDashboardOrder[];
  };

  totals: {
    gmvAll: number;
    gmv30d: number;
    gmv90d: number;
    avgTimeToSaleDays: number | null;
    bidCountTotal: number;
    watcherCountTotal: number;
    offers: {
      received: number;
      accepted: number;
      expired: number;
      open: number;
      countered: number;
    };
    revenue: {
      held: number;
      released: number;
      protectedHeld: number;
      protectedReleased: number;
    };
  };
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  if (v?.toDate) return (v.toDate() as Date).toISOString();
  return null;
}

function tsToDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  if (v?.toDate) return v.toDate();
  return null;
}

function inLastDays(d: Date | null, days: number): boolean {
  if (!d) return false;
  const ms = days * 24 * 60 * 60 * 1000;
  return Date.now() - d.getTime() <= ms;
}

/**
 * Seller dashboard aggregator (Phase 3A A1).
 *
 * Server-side only. Uses existing Firestore docs:
 * - listings (sellerId, status, metrics)
 * - orders (sellerId, amount, payout markers)
 * - offers (sellerId, status, expiresAt)
 *
 * No writes; purely aggregation.
 */
export async function getSellerDashboardData(params: {
  db: FirebaseFirestore.Firestore;
  sellerId: string;
}): Promise<SellerDashboardData> {
  const { db, sellerId } = params;
  const now = new Date();

  // Load seller listings/orders/offers. (At 10× scale we may need pagination/partitioning; this is a seller-scoped dashboard.)
  const [listingSnap, orderSnap, offerSnap] = await Promise.all([
    db.collection('listings').where('sellerId', '==', sellerId).get(),
    db.collection('orders').where('sellerId', '==', sellerId).get(),
    db.collection('offers').where('sellerId', '==', sellerId).get(),
  ]);

  const listingById = new Map<string, any>();
  listingSnap.docs.forEach((d) => listingById.set(d.id, d.data()));

  const listings: SellerDashboardListing[] = listingSnap.docs.map((d) => {
    const data = d.data() as any;
    const watcherCount =
      typeof data?.watcherCount === 'number'
        ? data.watcherCount
        : Number(data?.metrics?.favorites || 0) || 0;
    const bidCount = Number(data?.metrics?.bidCount || 0) || 0;
    return {
      id: d.id,
      title: String(data.title || ''),
      type: String(data.type || ''),
      category: typeof data.category === 'string' ? data.category : undefined,
      status: String(data.status || ''),
      price: typeof data.price === 'number' ? data.price : undefined,
      currentBid: typeof data.currentBid === 'number' ? data.currentBid : undefined,
      reservePrice: typeof data.reservePrice === 'number' ? data.reservePrice : undefined,
      startingBid: typeof data.startingBid === 'number' ? data.startingBid : undefined,
      endsAt: toIso(data.endsAt),
      createdAt: toIso(data.createdAt),
      publishedAt: toIso(data.publishedAt),
      updatedAt: toIso(data.updatedAt),
      bidCount,
      watcherCount,
    };
  });

  const ordersAll: SellerDashboardOrder[] = orderSnap.docs
    .map((d) => {
      const o = d.data() as any;
      const listing = listingById.get(String(o.listingId || '')) as any;
      return {
        id: d.id,
        listingId: String(o.listingId || ''),
        listingTitle: listing?.title ? String(listing.title) : undefined,
        buyerId: String(o.buyerId || ''),
        amount: Number(o.amount || 0) || 0,
        status: String(o.status || ''),
        createdAt: toIso(o.createdAt),
        deliveredAt: toIso(o.deliveredAt),
        deliveryConfirmedAt: toIso(o.deliveryConfirmedAt),
        buyerConfirmedAt: toIso(o.buyerConfirmedAt),
        stripeTransferId: typeof o.stripeTransferId === 'string' ? o.stripeTransferId : null,
        protectedTransactionDaysSnapshot:
          typeof o.protectedTransactionDaysSnapshot === 'number' ? o.protectedTransactionDaysSnapshot : null,
      };
    })
    .filter((o) => o.listingId && o.buyerId);

  const offers: SellerDashboardOffer[] = offerSnap.docs.map((d) => {
    const o = d.data() as any;
    const listing = listingById.get(String(o.listingId || '')) as any;
    return {
      id: d.id,
      listingId: String(o.listingId || ''),
      listingTitle: listing?.title ? String(listing.title) : undefined,
      buyerId: String(o.buyerId || ''),
      status: String(o.status || ''),
      currentAmount: Number(o.currentAmount || 0) || 0,
      expiresAt: toIso(o.expiresAt),
      updatedAt: toIso(o.updatedAt),
      lastActorRole: typeof o.lastActorRole === 'string' ? o.lastActorRole : null,
    };
  });

  const activeListings = listings.filter((l) => l.status === 'active');
  const draftListings = listings.filter((l) => l.status === 'draft' || l.status === 'pending');

  const orders30d = ordersAll.filter((o) => inLastDays(tsToDate(o.createdAt), 30));
  const orders90d = ordersAll.filter((o) => inLastDays(tsToDate(o.createdAt), 90));

  const gmvAll = ordersAll.reduce((sum, o) => sum + (Number.isFinite(o.amount) ? o.amount : 0), 0);
  const gmv30d = orders30d.reduce((sum, o) => sum + (Number.isFinite(o.amount) ? o.amount : 0), 0);
  const gmv90d = orders90d.reduce((sum, o) => sum + (Number.isFinite(o.amount) ? o.amount : 0), 0);

  // Avg time-to-sale: uses listing.publishedAt -> order.createdAt when available.
  const saleDurations: number[] = [];
  ordersAll.forEach((o) => {
    const listing = listingById.get(o.listingId) as any;
    const publishedAt = tsToDate(listing?.publishedAt) || tsToDate(listing?.createdAt);
    const orderCreatedAt = tsToDate(o.createdAt);
    if (publishedAt && orderCreatedAt) {
      const days = (orderCreatedAt.getTime() - publishedAt.getTime()) / (24 * 60 * 60 * 1000);
      if (Number.isFinite(days) && days >= 0) saleDurations.push(days);
    }
  });
  const avgTimeToSaleDays = saleDurations.length ? saleDurations.reduce((a, b) => a + b, 0) / saleDurations.length : null;

  const bidCountTotal = activeListings.reduce((sum, l) => sum + (l.bidCount || 0), 0);
  const watcherCountTotal = activeListings.reduce((sum, l) => sum + (l.watcherCount || 0), 0);

  const offersCounts = {
    received: offers.length,
    accepted: offers.filter((o) => o.status === 'accepted').length,
    expired: offers.filter((o) => o.status === 'expired').length,
    open: offers.filter((o) => o.status === 'open').length,
    countered: offers.filter((o) => o.status === 'countered').length,
  };

  let held = 0;
  let released = 0;
  let protectedHeld = 0;
  let protectedReleased = 0;
  for (const o of ordersAll) {
    const isReleased = !!o.stripeTransferId;
    const isRefunded = o.status === 'refunded';
    const isProtected = !!o.protectedTransactionDaysSnapshot;
    if (isRefunded) continue;
    if (isReleased) {
      released += o.amount;
      if (isProtected) protectedReleased += o.amount;
    } else {
      held += o.amount;
      if (isProtected) protectedHeld += o.amount;
    }
  }

  return {
    sellerId,
    generatedAt: now.toISOString(),
    activeListings,
    draftListings,
    offers,
    soldListings: {
      last30d: orders30d,
      last90d: orders90d,
      all: ordersAll,
    },
    totals: {
      gmvAll,
      gmv30d,
      gmv90d,
      avgTimeToSaleDays,
      bidCountTotal,
      watcherCountTotal,
      offers: offersCounts,
      revenue: { held, released, protectedHeld, protectedReleased },
    },
  };
}

