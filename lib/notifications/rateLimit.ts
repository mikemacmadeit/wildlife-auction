import { FieldValue } from 'firebase-admin/firestore';
import { stableHash } from './eventKey';
import type { NotificationChannel } from './types';

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function yyyymmddhh(d: Date): string {
  const base = yyyymmdd(d);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${base}${hh}`;
}

function rateDocId(params: { userId: string; channel: NotificationChannel; window: string }): string {
  // Keep ids short and Firestore-safe.
  return stableHash(`${params.userId}:${params.channel}:${params.window}`).slice(0, 32);
}

export async function checkAndIncrementRateLimit(params: {
  db: FirebaseFirestore.Firestore;
  userId: string;
  channel: NotificationChannel;
  now?: Date;
  perHour: number;
  perDay: number;
}): Promise<{ allowed: boolean; reason?: string }> {
  const now = params.now || new Date();
  const dayKey = yyyymmdd(now);
  const hourKey = yyyymmddhh(now);

  const dayRef = params.db.collection('notificationRateLimits').doc(rateDocId({ userId: params.userId, channel: params.channel, window: `day:${dayKey}` }));
  const hourRef = params.db.collection('notificationRateLimits').doc(rateDocId({ userId: params.userId, channel: params.channel, window: `hour:${hourKey}` }));

  try {
    await params.db.runTransaction(async (tx) => {
      const [daySnap, hourSnap] = await Promise.all([tx.get(dayRef), tx.get(hourRef)]);
      const dayCount = daySnap.exists ? Number((daySnap.data() as any).count || 0) : 0;
      const hourCount = hourSnap.exists ? Number((hourSnap.data() as any).count || 0) : 0;

      if (params.perDay > 0 && dayCount >= params.perDay) {
        throw Object.assign(new Error('RATE_LIMIT_DAY'), { code: 'RATE_LIMIT_DAY' });
      }
      if (params.perHour > 0 && hourCount >= params.perHour) {
        throw Object.assign(new Error('RATE_LIMIT_HOUR'), { code: 'RATE_LIMIT_HOUR' });
      }

      const base = {
        userId: params.userId,
        channel: params.channel,
        updatedAt: FieldValue.serverTimestamp(),
      };

      tx.set(
        dayRef,
        {
          ...base,
          window: `day:${dayKey}`,
          count: FieldValue.increment(1),
        },
        { merge: true }
      );
      tx.set(
        hourRef,
        {
          ...base,
          window: `hour:${hourKey}`,
          count: FieldValue.increment(1),
        },
        { merge: true }
      );
    });
    return { allowed: true };
  } catch (e: any) {
    if (e?.code === 'RATE_LIMIT_DAY') return { allowed: false, reason: 'rate_limit_day' };
    if (e?.code === 'RATE_LIMIT_HOUR') return { allowed: false, reason: 'rate_limit_hour' };
    // Fail open: do not block notifications if rate limiter itself fails.
    return { allowed: true };
  }
}

