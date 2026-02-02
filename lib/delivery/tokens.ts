/**
 * Delivery Session Tokens (JWT-style, HMAC-SHA256)
 *
 * driverToken: allows driver actions (show QR, start/stop tracking, ping location)
 * buyerToken: allows ONLY signature submission
 *
 * Tokens are short-lived (72h), scoped to sessionId + orderId.
 * Server must also verify deliverySessions/{sessionId}.status === "active".
 */

import { createHmac } from 'crypto';

const ALG = 'HS256';
const TTL_SEC = 72 * 60 * 60; // 72 hours

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  return Buffer.from(b64, 'base64');
}

export interface DeliveryTokenPayload {
  sessionId: string;
  orderId: string;
  role: 'driver' | 'buyer';
  exp: number;
  iat: number;
}

function getSecret(): string {
  const secret = process.env.DELIVERY_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('DELIVERY_TOKEN_SECRET must be set and at least 32 chars');
  }
  return secret;
}

export function signDeliveryToken(payload: Omit<DeliveryTokenPayload, 'iat' | 'exp'>): string {
  const secret = getSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TTL_SEC;
  const full: DeliveryTokenPayload = { ...payload, iat, exp };

  const header = { alg: ALG, typ: 'JWT' };
  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(full)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sig = createHmac('sha256', secret).update(signingInput).digest();
  const sigB64 = base64UrlEncode(sig);

  return `${signingInput}.${sigB64}`;
}

export function verifyDeliveryToken(token: string): DeliveryTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const secret = getSecret();
    const expectedSig = createHmac('sha256', secret).update(signingInput).digest();
    const expectedB64 = base64UrlEncode(expectedSig);
    if (expectedB64 !== sigB64) return null;

    const payloadBuf = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadBuf.toString('utf8')) as DeliveryTokenPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (!payload.sessionId || !payload.orderId || !payload.role) return null;
    if (payload.role !== 'driver' && payload.role !== 'buyer') return null;

    return payload;
  } catch {
    return null;
  }
}
