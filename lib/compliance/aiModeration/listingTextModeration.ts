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
    `Seller Verified: ${input.sellerVerified === true ? 'yes' : 'no'}`,
    `Price/Starting Bid: ${input.price ?? input.startingBid ?? 'N/A'}`,
  ].join('\n');

  const systemPrompt = `You are a Texas wildlife/livestock marketplace moderator. The platform has ALREADY validated: species (Texas-legal exotic list), category, location (TX), required disclosures (animal ID, health, transport), and structured attributes. Your job is TEXT-ONLY: catch prohibited language, scams, and misrepresentation in title/description.

Return JSON:
- confidence: 0-1. Use HIGH confidence (0.9+) when the free text contains NO prohibited language, scam signals, or misrepresentation. Do NOT lower confidence for: short/vague descriptions (structured fields carry compliance), seller experience, or "absence of compliance details" (platform enforces those).
- riskScore: 0-1. Use LOW risk (≤0.2) when text is clean. Raise risk ONLY for: prohibited keywords, scam pricing, misleading claims, or interstate-shipping language.
- flags: from this exact set only: illegal_species, permit_required_missing, interstate_shipping, prohibited_language, scam_pricing, misrepresentation, uncertain. Use "uncertain" ONLY when text is genuinely ambiguous (e.g. could imply illegal sale). NOT for brief descriptions.
- reasons: short human-readable reasons. Explain only actual flags. If no flags, say "No prohibited language or red flags in text; structured data validated by platform."
- evidence: array of { flag, snippet } - quote the exact problematic text. Empty if no flags.
- factorBreakdown: array of { factor, passed, note }. For EACH of these factors, include an entry: prohibited_language (venison/meat/tags), scam_pricing, misrepresentation, illegal_species, interstate_shipping, description_clarity. passed=true/false, note=one-line explanation. CRITICAL: If ALL factors have passed=true, then confidence MUST be 0.9+ and riskScore MUST be ≤0.2. The overall scores must align with the factor breakdown—no low confidence/high risk when all factors pass.

Platform rules (Texas-aligned):
- illegal_species: ONLY if text explicitly describes sale of venison, meat, hunting tags/licenses, wild whitetail in wildlife_exotics, or clearly illegal species. Species validation is done by platform; do not second-guess.
- prohibited_language: venison, meat, backstrap, hunting tags, licenses, "wild whitetail", game tag, permit sale, tag sale.
- scam_pricing: suspiciously low, "free", or clearly contradictory pricing.
- misrepresentation: title contradicts description, or description makes false/misleading claims.
- interstate_shipping: explicit claims about shipping live animals across state lines in ways that violate regulations.
- permit_required_missing: ONLY if text explicitly mentions needing a permit and suggests it is missing (rare; platform handles most of this).

Short or vague descriptions (e.g. "Big boy") are acceptable—species, quantity, and disclosures come from structured fields. Set confidence 0.9+ and risk ≤0.2 when text is clean. Return ONLY valid JSON.`;

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
