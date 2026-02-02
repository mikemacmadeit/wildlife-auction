import { FieldValue } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase/admin';
import { buildEventKey, eventDocIdFromKey, stableHash } from './eventKey';
import { notificationEventPayloadSchema, notificationEventTypeSchema, assertPayloadMatchesType } from './schemas';
import type {
  NotificationEntityType,
  NotificationEventPayload,
  NotificationEventType,
  NotificationEventDoc,
} from './types';

export interface EmitEventParams<TType extends NotificationEventType> {
  type: TType;
  actorId: string | null;
  entityType: NotificationEntityType;
  entityId: string;
  targetUserId: string;
  payload: Extract<NotificationEventPayload, { type: TType }>;
  optionalHash?: string;
  test?: boolean;
}

export interface EmitEventResult {
  ok: boolean;
  created: boolean;
  eventId: string;
  eventKey: string;
  error?: string;
}

/**
 * Emit + immediately process an event (creates in-app notification + queues emails/push jobs)
 * in the same request path. This avoids relying on scheduled functions for time-sensitive UX
 * like offers (eBay-style "see it instantly").
 *
 * Best-effort: if processing fails, the scheduled processor can still retry later.
 */
export async function emitAndProcessEventForUser<TType extends NotificationEventType>(
  params: EmitEventParams<TType>
): Promise<EmitEventResult & { processed?: boolean; processError?: string }> {
  const db = getAdminDb();

  // Emit first (idempotent by eventKey/doc id).
  const emitted = await emitEventForUser(params);
  if (!emitted.ok) return emitted;

  // If we didn't create a new doc, don't try to process inline (avoid double-processing).
  // Scheduled processor will handle it if still pending.
  if (!emitted.created) return emitted;

  try {
    const { processEventDoc } = await import('./processEvent');

    const eventRef = db.collection('events').doc(emitted.eventId);

    // Provide a concrete Timestamp (avoid FieldValue.serverTimestamp() sentinel in the in-memory object).
    const eventData: NotificationEventDoc = {
      id: emitted.eventId,
      type: params.type,
      createdAt: Timestamp.now() as any,
      actorId: params.actorId,
      entityType: params.entityType,
      entityId: params.entityId,
      targetUserIds: [params.targetUserId],
      payload: params.payload as any,
      status: 'pending',
      processing: { attempts: 0, lastAttemptAt: null },
      eventKey: buildEventKey({
        type: params.type,
        entityId: params.entityId,
        targetUserId: params.targetUserId,
        optionalHash: params.optionalHash ? stableHash(params.optionalHash).slice(0, 18) : undefined,
      }),
      ...(params.test ? { test: true } : {}),
    };

    const res = await processEventDoc({ db: db as any, eventRef: eventRef as any, eventData });
    return { ...emitted, processed: res.ok };
  } catch (e: any) {
    return { ...emitted, processed: false, processError: e?.message || String(e) };
  }
}

function isAlreadyExistsError(e: any): boolean {
  // Firestore Admin SDK errors typically have a numeric gRPC `code`.
  // 6 == ALREADY_EXISTS
  if (typeof e?.code === 'number' && e.code === 6) return true;
  const msg = String(e?.message || '');
  return /already exists|ALREADY_EXISTS/i.test(msg);
}

export async function emitEventForUser<TType extends NotificationEventType>(
  params: EmitEventParams<TType>
): Promise<EmitEventResult> {
  const db = getAdminDb();

  // Validate type + payload.
  notificationEventTypeSchema.parse(params.type);
  const parsedPayload = notificationEventPayloadSchema.parse(params.payload) as NotificationEventPayload;
  assertPayloadMatchesType(params.type, parsedPayload);

  const optionalHash = params.optionalHash ? stableHash(params.optionalHash).slice(0, 18) : undefined;
  const eventKey = buildEventKey({
    type: params.type,
    entityId: params.entityId,
    targetUserId: params.targetUserId,
    optionalHash,
  });
  const eventId = eventDocIdFromKey(eventKey);

  const doc: Omit<NotificationEventDoc, 'createdAt' | 'processing.lastAttemptAt'> & {
    createdAt: any;
    processing: { attempts: number; lastAttemptAt: any | null; error?: string };
  } = {
    id: eventId,
    type: params.type,
    createdAt: FieldValue.serverTimestamp(),
    actorId: params.actorId,
    entityType: params.entityType,
    entityId: params.entityId,
    targetUserIds: [params.targetUserId],
    payload: parsedPayload,
    status: 'pending',
    processing: { attempts: 0, lastAttemptAt: null },
    eventKey,
    ...(params.test ? { test: true } : {}),
  };

  try {
    await db.collection('events').doc(eventId).create(doc as any);
    return { ok: true, created: true, eventId, eventKey };
  } catch (e: any) {
    if (isAlreadyExistsError(e)) {
      return { ok: true, created: false, eventId, eventKey };
    }
    return { ok: false, created: false, eventId, eventKey, error: e?.message || String(e) };
  }
}

export async function emitEventToUsers<TType extends NotificationEventType>(
  params: Omit<EmitEventParams<TType>, 'targetUserId'> & { targetUserIds: string[] }
): Promise<EmitEventResult[]> {
  const results: EmitEventResult[] = [];
  for (const uid of params.targetUserIds) {
    results.push(
      await emitEventForUser({
        ...(params as any),
        targetUserId: uid,
      })
    );
  }
  return results;
}

/**
 * Emit + immediately process an event for multiple users (creates in-app notification + queues emails).
 * Use for admin notifications that must be delivered without waiting for the scheduled processor.
 */
export async function emitAndProcessEventToUsers<TType extends NotificationEventType>(
  params: Omit<EmitEventParams<TType>, 'targetUserId'> & { targetUserIds: string[] }
): Promise<(EmitEventResult & { processed?: boolean; processError?: string })[]> {
  const results: (EmitEventResult & { processed?: boolean; processError?: string })[] = [];
  for (const uid of params.targetUserIds) {
    const res = await emitAndProcessEventForUser({
      ...(params as any),
      targetUserId: uid,
    });
    results.push(res);
  }
  return results;
}