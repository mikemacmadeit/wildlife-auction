/**
 * Moderation signal extraction for Trust & Safety.
 * This is intentionally heuristic (best-effort) and should never be the sole enforcement mechanism.
 */

import type { Message, MessageThread } from '@/lib/types';

export type ModerationSignalType =
  | 'contact_info_attempt'
  | 'off_platform_payment'
  | 'off_platform_contact'
  | 'crypto'
  | 'wire'
  | 'external_link'
  | 'urgency_or_pressure'
  | 'redacted_content'
  | 'attachments';

export type ModerationRisk = 'low' | 'medium' | 'high';

export interface ModerationSignals {
  risk: ModerationRisk;
  score: number; // 0..100
  signalCounts: Record<ModerationSignalType, number>;
  paymentKeywords: string[];
  links: string[];
  redactedMessages: number;
  totalViolations: number;
  summary: string;
}

const URL_REGEX = /\bhttps?:\/\/[^\s)>\]]+/gi;
const URGENCY_REGEX =
  /\b(urgent|asap|right now|today only|act fast|last chance|send deposit|deposit now|hold it|reserve it|wire it now)\b/i;

function uniqStrings(xs: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const s = String(x || '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function analyzeThreadForModeration(thread: MessageThread, messages: Message[]): ModerationSignals {
  const signalCounts: ModerationSignals['signalCounts'] = {
    contact_info_attempt: 0,
    off_platform_payment: 0,
    off_platform_contact: 0,
    crypto: 0,
    wire: 0,
    external_link: 0,
    urgency_or_pressure: 0,
    redacted_content: 0,
    attachments: 0,
  };

  const paymentKeywords: string[] = [];
  const links: string[] = [];

  let redactedMessages = 0;
  let totalViolations = 0;

  for (const m of messages || []) {
    const body = String(m?.body || '');
    const detected = (m as any)?.detectedViolations as any;

    if ((m as any)?.wasRedacted === true) {
      redactedMessages++;
      signalCounts.redacted_content++;
    }

    const v = typeof (m as any)?.violationCount === 'number' ? (m as any).violationCount : 0;
    if (Number.isFinite(v) && v > 0) totalViolations += v;

    // Contact info attempt
    if (detected?.phone === true || detected?.email === true) {
      signalCounts.contact_info_attempt++;
      signalCounts.off_platform_contact += detected?.phone === true || detected?.email === true ? 1 : 0;
    }

    // Payment / circumvention keywords
    if (Array.isArray(detected?.paymentKeywords) && detected.paymentKeywords.length) {
      for (const kw of detected.paymentKeywords) paymentKeywords.push(String(kw));
      signalCounts.off_platform_payment += detected.paymentKeywords.length;
      for (const kw of detected.paymentKeywords) {
        const k = String(kw || '').toLowerCase();
        if (k.includes('crypto') || k === 'btc' || k === 'eth' || k.includes('bitcoin') || k.includes('ethereum')) {
          signalCounts.crypto++;
        }
        if (k.includes('wire')) signalCounts.wire++;
      }
    }

    // External links (common in scams or circumvention attempts)
    const urlMatches = body.match(URL_REGEX) || [];
    if (urlMatches.length) {
      signalCounts.external_link += urlMatches.length;
      links.push(...urlMatches);
    }

    if (URGENCY_REGEX.test(body)) {
      signalCounts.urgency_or_pressure++;
    }

    if (Array.isArray((m as any)?.attachments) && (m as any).attachments.length) {
      signalCounts.attachments += (m as any).attachments.length;
    }
  }

  const keywordList = uniqStrings(paymentKeywords);
  const linkList = uniqStrings(links);

  // Risk scoring (heuristic)
  // - repeated redactions + payment keywords are high-signal for circumvention
  // - external links + urgency bump risk
  let score = 0;
  score += clamp((thread?.violationCount || 0) * 5, 0, 60);
  score += clamp(signalCounts.contact_info_attempt * 10, 0, 30);
  score += clamp(signalCounts.off_platform_payment * 8, 0, 40);
  score += clamp(signalCounts.external_link * 6, 0, 24);
  score += clamp(signalCounts.urgency_or_pressure * 10, 0, 20);
  score += signalCounts.crypto > 0 ? 10 : 0;
  score = clamp(score, 0, 100);

  const risk: ModerationRisk = score >= 70 ? 'high' : score >= 35 ? 'medium' : 'low';

  const summaryParts: string[] = [];
  if (signalCounts.contact_info_attempt) summaryParts.push('contact attempt');
  if (signalCounts.off_platform_payment) summaryParts.push('payment circumvention');
  if (signalCounts.external_link) summaryParts.push('external link(s)');
  if (signalCounts.crypto) summaryParts.push('crypto mention');
  if (signalCounts.wire) summaryParts.push('wire mention');
  if (!summaryParts.length) summaryParts.push('general review');

  return {
    risk,
    score,
    signalCounts,
    paymentKeywords: keywordList,
    links: linkList,
    redactedMessages,
    totalViolations,
    summary: summaryParts.join(' • '),
  };
}

