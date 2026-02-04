/**
 * AI Text Moderation for Listings
 *
 * Server-only. Uses GPT with structured JSON output and zod validation.
 * Fail-closed: on any error, caller must treat as manual review.
 */

import { z } from 'zod';
import type { TextModerationResult } from './types';

const AI_MODERATION_TIMEOUT_MS = 15_000;

const ResponseSchema = z.object({
  confidence: z.number().min(0).max(1),
  riskScore: z.number().min(0).max(1),
  flags: z.array(z.string()),
  reasons: z.array(z.string()),
  evidence: z.array(
    z.object({
      flag: z.string(),
      snippet: z.string().max(200),
    })
  ),
  factorBreakdown: z.array(
    z.object({
      factor: z.string(),
      passed: z.boolean(),
      note: z.string().max(300).optional(),
    })
  ).optional(),
});

const SUPPORTED_FLAGS = [
  'illegal_species',
  'permit_required_missing',
  'interstate_shipping',
  'prohibited_language',
  'scam_pricing',
  'misrepresentation',
  'uncertain',
] as const;

function sanitizeFlags(flags: string[]): string[] {
  return flags.filter((f) => SUPPORTED_FLAGS.includes(f as any));
}

export interface SanitizedListingInput {
  title: string;
  description: string;
  category: string;
  type: string;
  locationState?: string;
  locationCity?: string;
  attributesSpeciesId?: string;
  transportOption?: string;
  deliveryTimeframe?: string;
  sellerVerified?: boolean;
  price?: number;
  startingBid?: number;
}

/**
 * Run text-based AI moderation on a listing.
 * Returns null on any error (caller must fail closed to manual review).
 */
export async function runListingTextModeration(
  input: SanitizedListingInput
): Promise<TextModerationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    console.warn('[AI Moderation] OPENAI_API_KEY not configured');
    return null;
  }

  const dataForPrompt = [
    `Title: ${(input.title || '').trim().slice(0, 500)}`,
    `Description: ${(input.description || '').trim().slice(0, 2000)}`,
    `Category: ${input.category}`,
    `Type: ${input.type}`,
    `Location State: ${input.locationState || 'N/A'}`,
    `Location City: ${input.locationCity || 'N/A'}`,
    `Species (attributes.speciesId): ${input.attributesSpeciesId || 'N/A'}`,
    `Transport: ${input.transportOption || 'N/A'}`,
    `Delivery Timeframe: ${input.deliveryTimeframe || 'N/A'}`,
    `Stripe payouts ready: ${input.sellerVerified === true ? 'yes' : 'no'}`,
    `Price/Starting Bid: ${input.price ?? input.startingBid ?? 'N/A'}`,
  ].join('\n');

  const systemPrompt = `You are a Texas wildlife/livestock marketplace moderator. Your DEFAULT is to APPROVE. Only send for manual review when there is a clear, specific violation in the title or description text.

The platform has ALREADY validated: species (Texas-legal list), category, location (TX), disclosures (animal ID, health, transport), and structured attributes. Your job is TEXT-ONLY: catch prohibited language, scams, and clear misrepresentation.

APPROVE BY DEFAULT:
- Short or vague descriptions ("Big boy", "Test", "Nice animal") → APPROVE. Species, quantity, and compliance come from structured fields.
- Minimal descriptions, few details, no images mentioned → APPROVE. Not your concern.
- Seller experience, pricing reasonableness, description quality → APPROVE. Platform handles these.
- When in doubt → APPROVE.

FLAG FOR MANUAL REVIEW ONLY when you find a SPECIFIC violation:
- prohibited_language: explicit use of venison, meat, backstrap, hunting tags, licenses, "wild whitetail" (in wildlife_exotics), game tag, permit sale, tag sale.
- illegal_species: text explicitly describes sale of venison, meat, hunting tags/licenses, or clearly illegal species. Do NOT second-guess platform species validation.
- scam_pricing: "free" animal, suspiciously low price that contradicts listing type, or clearly contradictory pricing.
- misrepresentation: title directly contradicts description, or description makes provably false claims.
- interstate_shipping: explicit claims about shipping live animals across state lines in violation of regulations.
- permit_required_missing: text explicitly says a permit is needed and suggests it is missing (rare).

Return JSON:
- confidence: 0-1. Use 0.95 when no flags. Use lower ONLY when you have a concrete flag.
- riskScore: 0-1. Use 0.05 when no flags. Raise ONLY for actual violations.
- flags: from this set only: illegal_species, permit_required_missing, interstate_shipping, prohibited_language, scam_pricing, misrepresentation, uncertain. Use "uncertain" ONLY when text could plausibly imply an illegal sale. NOT for brief or vague descriptions.
- reasons: short reasons. If no flags: "Text clean; no prohibited language or red flags. Platform validated compliance."
- evidence: array of { flag, snippet }. Empty if no flags. Quote exact problematic text.
- factorBreakdown: REQUIRED. Include ALL 6: prohibited_language, scam_pricing, misrepresentation, illegal_species, interstate_shipping, description_clarity. passed=true unless you found a specific problem. note=one-line. CRITICAL: When all passed=true, confidence MUST be 0.9+ and riskScore MUST be ≤0.2.

Return ONLY valid JSON.`;

  const userPrompt = `Analyze this listing and return the JSON moderation result:\n\n${dataForPrompt}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_MODERATION_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 800,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[AI Moderation] OpenAI API error:', response.status, errText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      console.warn('[AI Moderation] No content in response');
      return null;
    }

    const parsed = JSON.parse(content);
    const validated = ResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error('[AI Moderation] Schema validation failed:', validated.error.message);
      return null;
    }

    const v = validated.data;
    return {
      confidence: v.confidence,
      riskScore: v.riskScore,
      flags: sanitizeFlags(v.flags),
      reasons: v.reasons.slice(0, 10),
      evidence: v.evidence.slice(0, 10),
      factorBreakdown: Array.isArray(v.factorBreakdown) ? v.factorBreakdown.slice(0, 10) : undefined,
      model: 'gpt-4o-mini',
    };
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === 'AbortError') {
      console.warn('[AI Moderation] Request timed out');
    } else {
      console.error('[AI Moderation] Error:', e?.message || e);
    }
    return null;
  }
}
