/**
 * AI-Assisted Admin Summaries
 * 
 * Server-side only. Generates concise summaries for admin review.
 * This is READ-ONLY and ADVISORY - AI does NOT make decisions.
 */

export type EntityType = 'user' | 'listing' | 'order' | 'support_ticket';

export interface GenerateSummaryOptions {
  entityType: EntityType;
  entityData: Record<string, any>;
  existingSummary?: {
    summary: string;
    generatedAt: Date | string;
    model: string;
  } | null;
}

export interface SummaryResult {
  summary: string;
  model: string;
  generatedAt: Date;
}

/**
 * Check if AI summary feature is enabled
 */
export function isAISummaryEnabled(): boolean {
  const enabled = process.env.AI_ADMIN_SUMMARY_ENABLED;
  return enabled === 'true' || enabled === '1';
}

/**
 * Check if OpenAI API key is configured
 */
function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Generate AI summary for an entity
 * 
 * This function:
 * - Only runs server-side
 * - Requires AI_ADMIN_SUMMARY_ENABLED=true
 * - Requires OPENAI_API_KEY env var
 * - Returns safe, factual summaries
 * - Fails gracefully (logs errors, never blocks UI)
 */
export async function generateAISummary(
  options: GenerateSummaryOptions
): Promise<SummaryResult | null> {
  // Feature flag check
  if (!isAISummaryEnabled()) {
    console.log('[AI Summary] Feature disabled via AI_ADMIN_SUMMARY_ENABLED');
    return null;
  }

  // API key check
  if (!hasOpenAIKey()) {
    console.warn('[AI Summary] OPENAI_API_KEY not configured');
    return null;
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return null;
    }

    // Prepare structured data for the prompt
    const dataForPrompt = prepareDataForPrompt(options.entityType, options.entityData);

    // Conservative prompt - neutral, factual, no speculation
    const prompt = `Summarize the following information for an internal admin reviewer.
Focus on important facts, patterns, or issues.
Be neutral, factual, and concise.
Do not speculate or accuse.

${dataForPrompt}`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Cost-effective, fast model
        messages: [
          {
            role: 'system',
            content: 'You are an assistant that provides neutral, factual summaries for internal admin review. Focus on facts, patterns, and important information. Do not make judgments or accusations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 200, // Keep summaries short (3-6 sentences)
        temperature: 0.3, // Lower temperature for more factual output
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[AI Summary] OpenAI API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const summaryText = data.choices?.[0]?.message?.content?.trim();

    if (!summaryText) {
      console.warn('[AI Summary] No summary text in OpenAI response');
      return null;
    }

    return {
      summary: summaryText,
      model: 'gpt-4o-mini',
      generatedAt: new Date(),
    };
  } catch (error) {
    // Fail safely - log error but don't throw
    console.error('[AI Summary] Error generating summary:', error);
    return null;
  }
}

/**
 * Prepare entity data for prompt (sanitize and structure)
 */
function prepareDataForPrompt(entityType: EntityType, entityData: Record<string, any>): string {
  // Remove sensitive fields that shouldn't be sent to OpenAI
  const sensitiveFields = [
    'password',
    'passwordHash',
    'privateKey',
    'secret',
    'token',
    'apiKey',
    'stripeSecretKey',
    'stripeAccountId', // Keep for context but don't expose full details
  ];

  const sanitized = { ...entityData };
  sensitiveFields.forEach((field) => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  // Structure data based on entity type
  switch (entityType) {
    case 'user':
      return formatUserData(sanitized);
    case 'listing':
      return formatListingData(sanitized);
    case 'order':
      return formatOrderData(sanitized);
    case 'support_ticket':
      return formatSupportTicketData(sanitized);
    default:
      return JSON.stringify(sanitized, null, 2);
  }
}

function formatUserData(data: any): string {
  const parts: string[] = [];
  
  parts.push(`User ID: ${data.uid || data.id || 'N/A'}`);
  parts.push(`Email: ${data.email || 'N/A'}`);
  parts.push(`Display Name: ${data.displayName || 'N/A'}`);
  parts.push(`Role: ${data.role || 'user'}`);
  parts.push(`Status: ${data.status || 'active'}`);
  
  if (data.createdAt) {
    parts.push(`Created: ${new Date(data.createdAt).toISOString()}`);
  }
  
  if (data.summary) {
    parts.push(`Summary Stats: ${JSON.stringify(data.summary)}`);
  }
  
  if (data.riskLabel) {
    parts.push(`Risk Label: ${data.riskLabel}`);
  }
  
  if (data.verification) {
    parts.push(`Verification: ${JSON.stringify(data.verification)}`);
  }
  
  if (data.counts) {
    parts.push(`Counts: ${JSON.stringify(data.counts)}`);
  }
  
  if (Array.isArray(data.notes) && data.notes.length > 0) {
    parts.push(`Recent Notes: ${data.notes.slice(0, 3).map((n: any) => n.note).join('; ')}`);
  }
  
  if (Array.isArray(data.audits) && data.audits.length > 0) {
    parts.push(`Recent Audit Actions: ${data.audits.slice(0, 5).map((a: any) => a.actionType).join(', ')}`);
  }
  
  return parts.join('\n');
}

function formatListingData(data: any): string {
  const parts: string[] = [];
  
  parts.push(`Listing ID: ${data.id || 'N/A'}`);
  parts.push(`Title: ${data.title || 'N/A'}`);
  parts.push(`Category: ${data.category || 'N/A'}`);
  parts.push(`Type: ${data.type || 'N/A'}`);
  parts.push(`Status: ${data.status || 'N/A'}`);
  parts.push(`Compliance Status: ${data.complianceStatus || 'none'}`);
  parts.push(`Price: ${data.price || data.startingBid || 'N/A'}`);
  parts.push(`Location: ${data.location?.city || ''}, ${data.location?.state || ''}`);
  
  if (data.sellerId) {
    parts.push(`Seller ID: ${data.sellerId}`);
  }
  
  if (data.createdAt) {
    parts.push(`Created: ${new Date(data.createdAt).toISOString()}`);
  }
  
  if (data.description) {
    parts.push(`Description: ${data.description.substring(0, 200)}...`);
  }
  
  if (data.attributes) {
    parts.push(`Attributes: ${JSON.stringify(data.attributes)}`);
  }
  
  return parts.join('\n');
}

function formatOrderData(data: any): string {
  const parts: string[] = [];
  
  parts.push(`Order ID: ${data.id || 'N/A'}`);
  parts.push(`Status: ${data.status || 'N/A'}`);
  parts.push(`Amount: $${data.amount || 0}`);
  parts.push(`Buyer ID: ${data.buyerId || 'N/A'}`);
  parts.push(`Seller ID: ${data.sellerId || 'N/A'}`);
  parts.push(`Listing ID: ${data.listingId || 'N/A'}`);
  
  if (data.disputeStatus) {
    parts.push(`Dispute Status: ${data.disputeStatus}`);
  }
  
  if (data.disputeReasonV2) {
    parts.push(`Dispute Reason: ${data.disputeReasonV2}`);
  }
  
  if (data.payoutHoldReason) {
    parts.push(`Payout Hold Reason: ${data.payoutHoldReason}`);
  }
  
  if (data.protectedTransactionDaysSnapshot) {
    parts.push(`Protected Transaction Days: ${data.protectedTransactionDaysSnapshot}`);
  }
  
  if (data.createdAt) {
    parts.push(`Created: ${new Date(data.createdAt).toISOString()}`);
  }
  
  if (data.paidAt) {
    parts.push(`Paid: ${new Date(data.paidAt).toISOString()}`);
  }
  
  if (data.deliveredAt) {
    parts.push(`Delivered: ${new Date(data.deliveredAt).toISOString()}`);
  }
  
  return parts.join('\n');
}

function formatSupportTicketData(data: any): string {
  const parts: string[] = [];
  
  parts.push(`Ticket ID: ${data.ticketId || data.id || 'N/A'}`);
  parts.push(`Status: ${data.status || 'N/A'}`);
  parts.push(`Source: ${data.source || 'N/A'}`);
  parts.push(`Name: ${data.name || 'N/A'}`);
  parts.push(`Email: ${data.email || 'N/A'}`);
  parts.push(`Subject: ${data.subject || 'N/A'}`);
  parts.push(`Message: ${data.message || data.messagePreview || 'N/A'}`);
  
  if (data.userId) {
    parts.push(`User ID: ${data.userId}`);
  }
  
  if (data.listingId) {
    parts.push(`Listing ID: ${data.listingId}`);
  }
  
  if (data.orderId) {
    parts.push(`Order ID: ${data.orderId}`);
  }
  
  if (data.createdAt) {
    parts.push(`Created: ${new Date(data.createdAt).toISOString()}`);
  }
  
  return parts.join('\n');
}
