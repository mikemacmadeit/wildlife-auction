/**
 * Netlify Scheduled Function: Aggregate Revenue (scaling helper)
 *
 * Writes server-authored aggregate docs so `/api/admin/revenue` doesn't need all-time scans.
 * - Aggregates are computed incrementally using a cursor (paidAt + docId).
 * - 7d/30d windows are computed on each run (bounded queries).
 *
 * Output docs (server-written via Admin SDK):
 * - adminRevenueAggregates/global
 * - adminRevenueAggState/global
 */

import { Handler, schedule } from '@netlify/functions';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../../lib/firebase/admin';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';
import { captureException } from '../../lib/monitoring/capture';

type FeesByPlan = Record<string, number>;

function feeFromOrder(orderData: any): number {
  const v = orderData?.platformFeeAmount ?? orderData?.platformFee ?? 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampInt(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const baseHandler: Handler = async () => {
  const requestId = `cron_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  const startTime = Date.now();
  const timeBudgetMs = 45_000;

  try {
    const db = getAdminDb();

    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stateRef = db.collection('adminRevenueAggState').doc('global');
    const aggRef = db.collection('adminRevenueAggregates').doc('global');

    const stateSnap = await stateRef.get();
    const state = stateSnap.exists ? (stateSnap.data() as any) : {};

    let allTimeTotalFees = Number(state?.platformFeesAllTime || 0);
    if (!Number.isFinite(allTimeTotalFees)) allTimeTotalFees = 0;

    // Cursor for incremental processing
    const cursorPaidAtIso = typeof state?.cursorPaidAt === 'string' ? state.cursorPaidAt : null;
    const cursorDocId = typeof state?.cursorDocId === 'string' ? state.cursorDocId : null;

    const perRunLimit = clampInt(process.env.REVENUE_AGG_BATCH_SIZE, 500, 50, 2000);

    // Incremental all-time scan: orders where paidAt exists.
    // We keep the existing field heuristic for platformFee so this matches current endpoint behavior.
    let q = db
      .collection('orders')
      .where('paidAt', '>=', Timestamp.fromDate(new Date(0)))
      .orderBy('paidAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(perRunLimit);

    if (cursorPaidAtIso && cursorDocId) {
      const cursorPaidAt = Timestamp.fromDate(new Date(cursorPaidAtIso));
      // Start after the last processed row (paidAt, docId)
      q = q.startAfter(cursorPaidAt, cursorDocId);
    }

    let processed = 0;
    let lastCursorPaidAt: Timestamp | null = null;
    let lastCursorDocId: string | null = null;

    const snap = await q.get();
    for (const doc of snap.docs) {
      const d = doc.data();
      allTimeTotalFees += feeFromOrder(d);
      processed += 1;
      lastCursorPaidAt = d?.paidAt || null;
      lastCursorDocId = doc.id;
      if (Date.now() - startTime > timeBudgetMs) break;
    }

    // Windowed stats (bounded queries by paidAt range).
    // NOTE: For scale, these can also be incrementally maintained, but bounded scans are typically ok.
    const windowOrdersQuery = db
      .collection('orders')
      .where('paidAt', '>=', Timestamp.fromDate(last30Days))
      .where('paidAt', '<=', Timestamp.fromDate(now));

    const windowOrdersSnap = await windowOrdersQuery.get();
    let totalFees7d = 0;
    let totalFees30d = 0;
    let ordersCount7d = 0;
    let ordersCount30d = 0;
    const feesByPlan30d: FeesByPlan = { free: 0, pro: 0, elite: 0, unknown: 0 };

    windowOrdersSnap.forEach((doc) => {
      const d = doc.data();
      const paidAt = d?.paidAt?.toDate?.();
      if (!(paidAt instanceof Date)) return;
      const fee = feeFromOrder(d);
      const planSnapshot = d?.sellerPlanSnapshot || 'unknown';

      totalFees30d += fee;
      ordersCount30d += 1;
      feesByPlan30d[planSnapshot] = (feesByPlan30d[planSnapshot] || 0) + fee;

      if (paidAt >= last7Days) {
        totalFees7d += fee;
        ordersCount7d += 1;
      }
    });

    // Windowed refunds (matches current endpoint logic: refundedAt + refundAmount)
    let totalRefunds30d = 0;
    windowOrdersSnap.forEach((doc) => {
      const d = doc.data();
      const refundedAt = d?.refundedAt?.toDate?.();
      if (!(refundedAt instanceof Date)) return;
      if (refundedAt < last30Days || refundedAt > now) return;
      const refundAmount = d?.refundAmount;
      const n = typeof refundAmount === 'number' ? refundAmount : Number(refundAmount);
      if (Number.isFinite(n)) totalRefunds30d += n;
    });

    // Chargebacks in last30d (matches current endpoint: chargebacks.amount in cents -> dollars)
    let totalChargebacks30d = 0;
    try {
      const chargebacksSnap = await db
        .collection('chargebacks')
        .where('createdAt', '>=', Timestamp.fromDate(last30Days))
        .where('createdAt', '<=', Timestamp.fromDate(now))
        .get();
      chargebacksSnap.forEach((doc) => {
        const d = doc.data();
        const amount = d?.amount;
        const cents = typeof amount === 'number' ? amount : Number(amount);
        if (Number.isFinite(cents)) totalChargebacks30d += cents / 100;
      });
    } catch (e: any) {
      logWarn('Revenue aggregation: chargebacks query failed', {
        requestId,
        route: 'aggregateRevenue',
        message: e?.message || String(e),
      });
    }

    // Persist aggregate doc (used by /api/admin/revenue for fast "default view")
    await aggRef.set(
      {
        computedAt: Timestamp.now(),
        windows: {
          last7DaysStart: Timestamp.fromDate(last7Days),
          last30DaysStart: Timestamp.fromDate(last30Days),
          now: Timestamp.fromDate(now),
        },
        platformFees: {
          last7Days: totalFees7d,
          last30Days: totalFees30d,
          allTime: allTimeTotalFees,
        },
        feesByPlanLast30Days: feesByPlan30d,
        refundsLast30Days: totalRefunds30d,
        chargebacksLast30Days: totalChargebacks30d,
        orders: {
          last7Days: ordersCount7d,
          last30Days: ordersCount30d,
        },
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    // Persist incremental state
    await stateRef.set(
      {
        cursorPaidAt: lastCursorPaidAt ? lastCursorPaidAt.toDate().toISOString() : cursorPaidAtIso,
        cursorDocId: lastCursorDocId || cursorDocId,
        platformFeesAllTime: allTimeTotalFees,
        lastRunAt: Timestamp.now(),
        lastRunProcessed: processed,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    // Health metrics
    try {
      await db.collection('opsHealth').doc('aggregateRevenue').set(
        {
          lastRunAt: Timestamp.now(),
          processed,
          durationMs: Date.now() - startTime,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    } catch {
      // ignore
    }

    logInfo('Revenue aggregation completed', {
      requestId,
      route: 'aggregateRevenue',
      processed,
      durationMs: Date.now() - startTime,
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, processed }) };
  } catch (error: any) {
    logError('Revenue aggregation failed', error, { route: 'aggregateRevenue' });
    captureException(error instanceof Error ? error : new Error(String(error)), { route: 'aggregateRevenue' });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error?.message || String(error) }) };
  }
};

// Run hourly.
export const handler = schedule('10 * * * *', baseHandler);

