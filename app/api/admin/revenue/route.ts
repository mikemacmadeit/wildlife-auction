/**
 * GET /api/admin/revenue
 * 
 * Admin-only revenue reporting endpoint
 * Returns platform revenue KPIs and breakdowns
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin } from '@/app/api/admin/_util';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { logInfo, logError, logWarn } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function GET(request: Request) {
  try {
    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await requireAdmin(request);
    if (!admin.ok) {
      if (admin.response.status === 401) return json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
      if (admin.response.status === 403) return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
      return admin.response;
    }

    const adminId = admin.ctx.actorUid;
    const db = admin.ctx.db;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const sellerId = searchParams.get('sellerId');
    const listingId = searchParams.get('listingId');

    // Calculate date ranges
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const startDate = startDateParam ? new Date(startDateParam) : last30Days;
    const endDate = endDateParam ? new Date(endDateParam) : now;

    // Build query constraints
    const ordersRef = db.collection('orders');
    let ordersQuery = ordersRef.where('paidAt', '>=', Timestamp.fromDate(startDate))
      .where('paidAt', '<=', Timestamp.fromDate(endDate));

    // Apply filters
    if (sellerId) {
      ordersQuery = ordersQuery.where('sellerId', '==', sellerId) as any;
    }
    if (listingId) {
      ordersQuery = ordersQuery.where('listingId', '==', listingId) as any;
    }

    const ordersSnapshot = await ordersQuery.get();

    // Calculate totals for period
    let totalFees7d = 0;
    let totalFees30d = 0;
    const feesByPlan: Record<string, number> = { free: 0, pro: 0, elite: 0, unknown: 0 };
    let totalRefunds = 0;
    let totalChargebacks = 0;
    let ordersCount7d = 0;
    let ordersCount30d = 0;

    // Process orders in period
    ordersSnapshot.forEach((doc) => {
      const orderData = doc.data();
      const paidAt = orderData.paidAt?.toDate();
      if (!paidAt) return;

      const platformFee = orderData.platformFeeAmount || orderData.platformFee || 0;
      const planSnapshot = orderData.sellerPlanSnapshot || 'unknown';

      // Last 30 days (for plan breakdown)
      if (paidAt >= last30Days) {
        totalFees30d += platformFee;
        ordersCount30d++;
        feesByPlan[planSnapshot] = (feesByPlan[planSnapshot] || 0) + platformFee;
      }

      // Last 7 days
      if (paidAt >= last7Days) {
        totalFees7d += platformFee;
        ordersCount7d++;
      }

      // Refunds
      if (orderData.refundedAt && orderData.refundAmount) {
        const refundedAt = orderData.refundedAt.toDate();
        if (refundedAt >= startDate && refundedAt <= endDate) {
          totalRefunds += orderData.refundAmount;
        }
      }
    });

    // Query chargebacks for the period
    const chargebacksRef = db.collection('chargebacks');
    const chargebacksQuery = chargebacksRef
      .where('createdAt', '>=', Timestamp.fromDate(startDate))
      .where('createdAt', '<=', Timestamp.fromDate(endDate));

    const chargebacksSnapshot = await chargebacksQuery.get();
    chargebacksSnapshot.forEach((doc) => {
      const chargebackData = doc.data();
      if (chargebackData.amount) {
        totalChargebacks += chargebackData.amount / 100; // Convert cents to dollars
      }
    });

    // Calculate all-time total (separate query for efficiency)
    // Note: This queries all paid orders, which can be expensive at scale
    // Consider using aggregated collections or scheduled jobs for production
    let totalFeesAllTime = 0;
    try {
      const allTimeStart = new Date(0); // Start of epoch
      const allTimeOrdersQuery = db.collection('orders')
        .where('paidAt', '>=', Timestamp.fromDate(allTimeStart));
      
      // Limit to prevent timeout on large datasets
      // For production, consider aggregation collection or scheduled job
      const allTimeSnapshot = await allTimeOrdersQuery.limit(10000).get();
      allTimeSnapshot.forEach((doc) => {
        const orderData = doc.data();
        const platformFee = orderData.platformFeeAmount || orderData.platformFee || 0;
        totalFeesAllTime += platformFee;
      });
    } catch (error) {
      // If query fails (e.g., no index or timeout), log warning
      logWarn('All-time revenue query limited, may need aggregation', {
        route: '/api/admin/revenue',
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - just show 0 or use period approximation
      totalFeesAllTime = totalFees30d; // Approximation for display
    }

    logInfo('Revenue report generated', {
      route: '/api/admin/revenue',
      adminId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ordersProcessed: ordersSnapshot.size,
    });

    return json({
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      platformFees: {
        last7Days: totalFees7d,
        last30Days: totalFees30d,
        allTime: totalFeesAllTime,
      },
      feesByPlan: {
        free: feesByPlan.free || 0,
        pro: feesByPlan.pro || 0,
        elite: feesByPlan.elite || 0,
        unknown: feesByPlan.unknown || 0,
      },
      refunds: {
        total: totalRefunds,
        period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      },
      chargebacks: {
        total: totalChargebacks,
        period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      },
      orders: {
        last7Days: ordersCount7d,
        last30Days: ordersCount30d,
        inPeriod: ordersSnapshot.size,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logError('Error generating revenue report', error, {
      route: '/api/admin/revenue',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      route: '/api/admin/revenue',
    });
    return json({ error: 'Failed to generate revenue report', message: error.message }, { status: 500 });
  }
}
