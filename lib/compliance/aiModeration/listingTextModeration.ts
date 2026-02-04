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

  const systemPrompt = `You are a marketplace listing moderator. Analyze the listing and return a JSON object with:
- confidence: number 0-1 (how confident you are in the assessment)
- riskScore: number 0-1 (0=low risk, 1=high risk)
- flags: array of strings from this exact set only: illegal_species, permit_required_missing, interstate_shipping, prohibited_language, scam_pricing, misrepresentation, uncertain (use uncertain if not confident)
- reasons: array of short human-readable reasons (1-2 sentences max each)
- evidence: array of { flag: string, snippet: string } - short text snippets (max 200 chars each) that support each flag

Rules:
- Texas legality and species validation are handled by the platform; flag "illegal_species" only if text explicitly claims illegal/wild/prohibited species or sale of venison/meat/tags.
- "prohibited_language" = venison, meat, hunting tags, licenses, wild whitetail, etc.
- "scam_pricing" = suspiciously low, "free", or contradictory pricing.
- "misrepresentation" = title/description mismatch, misleading claims.
- "interstate_shipping" = explicit interstate transport of live animals in ways that may violate regulations.
- If uncertain, set confidence low and include "uncertain" in flags.
- Return ONLY valid JSON, no markdown or extra text.`;

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
