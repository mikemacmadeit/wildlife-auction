import { FieldValue } from 'firebase-admin/firestore';
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

