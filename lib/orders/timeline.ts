import type { OrderTimelineActor, OrderTimelineEventType, OrderTimelineVisibility } from '@/lib/types';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Server-side (Admin SDK) helpers for appending immutable order timeline events.
 *
 * - Idempotent by `event.id`
 * - Transaction-safe under retries/concurrency
 * - Caps timeline length to prevent unbounded growth
 */
export type FirestoreTimestampLike = { toDate?: () => Date } | Date;

export type OrderTimelineEventInput = {
  id: string;
  type: OrderTimelineEventType;
  label: string;
  actor: OrderTimelineActor;
  visibility?: OrderTimelineVisibility;
  timestamp?: any; // firebase-admin Timestamp preferred
  meta?: Record<string, any>;
};

export async function appendOrderTimelineEvent(params: {
  db: FirebaseFirestore.Firestore;
  orderId: string;
  event: OrderTimelineEventInput;
  maxEvents?: number;
  now?: Timestamp;
}) {
  const { db, orderId, event } = params;
  const maxEvents = typeof params.maxEvents === 'number' ? params.maxEvents : 60;
  const now = params.now || Timestamp.now();

  if (!event?.id || !event?.type || !event?.label || !event?.actor) {
    throw new Error('Invalid timeline event');
  }

  const orderRef = db.collection('orders').doc(orderId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return;
    const data = snap.data() as any;
    const existing = Array.isArray(data?.timeline) ? (data.timeline as any[]) : [];
    if (existing.some((e) => String(e?.id || '') === event.id)) {
      return; // idempotent
    }

    const next = [
      ...existing,
      {
        id: event.id,
        type: event.type,
        label: event.label,
        actor: event.actor,
        visibility: event.visibility || 'buyer',
        timestamp: event.timestamp || now,
        ...(event.meta ? { meta: event.meta } : {}),
      },
    ];

    // Keep most recent N by timestamp (best-effort).
    next.sort((a: any, b: any) => {
      const at =
        typeof a?.timestamp?.toMillis === 'function'
          ? a.timestamp.toMillis()
          : typeof a?.timestamp?.toDate === 'function'
            ? a.timestamp.toDate().getTime()
            : a?.timestamp instanceof Date
              ? a.timestamp.getTime()
              : 0;
      const bt =
        typeof b?.timestamp?.toMillis === 'function'
          ? b.timestamp.toMillis()
          : typeof b?.timestamp?.toDate === 'function'
            ? b.timestamp.toDate().getTime()
            : b?.timestamp instanceof Date
              ? b.timestamp.getTime()
              : 0;
      return at - bt;
    });

    const trimmed = next.slice(Math.max(0, next.length - maxEvents));

    tx.set(
      orderRef,
      {
        timeline: trimmed,
        updatedAt: now,
      },
      { merge: true }
    );
  });
}

