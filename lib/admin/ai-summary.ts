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

export interface DisputeSummaryResult {
  summary: string;
  facts: string[];
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
 * Check if AI dispute summary feature is enabled
 */
export function isAIDisputeSummaryEnabled(): boolean {
  const enabled = process.env.AI_DISPUTE_SUMMARY_ENABLED;
  return enabled === 'true' || enabled === '1';
}

/**
 * Check if AI admin draft feature is enabled
 */
export function isAIAdminDraftEnabled(): boolean {
  const enabled = process.env.AI_ADMIN_DRAFT_ENABLED;
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

/**
 * Generate AI dispute summary for an order
 * 
 * This function:
 * - Only runs server-side
 * - Requires AI_DISPUTE_SUMMARY_ENABLED=true
 * - Requires OPENAI_API_KEY env var
 * - Returns neutral, factual dispute summaries
 * - Extracts key facts and timeline
 * - Fails gracefully (logs errors, never blocks UI)
 */
export async function generateAIDisputeSummary(
  orderData: Record<string, any>
): Promise<DisputeSummaryResult | null> {
  // Feature flag check
  if (!isAIDisputeSummaryEnabled()) {
    console.log('[AI Dispute Summary] Feature disabled via AI_DISPUTE_SUMMARY_ENABLED');
    return null;
  }

  // API key check
  if (!hasOpenAIKey()) {
    console.warn('[AI Dispute Summary] OPENAI_API_KEY not configured');
    return null;
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return null;
    }

    // Prepare dispute data for the prompt
    const disputeDataForPrompt = prepareDisputeDataForPrompt(orderData);

    // Conservative prompt - neutral, factual, no conclusions
    const prompt = `Summarize the following dispute for an internal admin reviewer.
Extract a neutral timeline of events and key facts.
Avoid emotional language, accusations, or conclusions.
Do not suggest outcomes or policy enforcement.

${disputeDataForPrompt}

Provide:
1. A brief summary paragraph (3-6 sentences)
2. A bulleted list of key facts in chronological order`;

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
            content: 'You are an assistant that provides neutral, factual summaries of disputes for internal admin review. Focus on facts, timeline, and events. Do not make judgments, accusations, or suggest outcomes. Extract key facts in chronological order.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 400, // Allow for summary + facts list
        temperature: 0.3, // Lower temperature for more factual output
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[AI Dispute Summary] OpenAI API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const fullText = data.choices?.[0]?.message?.content?.trim();

    if (!fullText) {
      console.warn('[AI Dispute Summary] No summary text in OpenAI response');
      return null;
    }

    // Parse summary and facts from response
    // Expected format: Summary paragraph, then bullet points
    const lines = fullText.split('\n').filter(line => line.trim());
    let summary = '';
    const facts: string[] = [];

    let inFactsSection = false;
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect bullet points or numbered lists
      if (trimmed.match(/^[-•*]\s+/) || trimmed.match(/^\d+\.\s+/)) {
        inFactsSection = true;
        const fact = trimmed.replace(/^[-•*]\s+/, '').replace(/^\d+\.\s+/, '').trim();
        if (fact) {
          facts.push(fact);
        }
      } else if (inFactsSection) {
        // Continue adding to facts if we're in that section
        if (trimmed) {
          facts.push(trimmed);
        }
      } else {
        // Still in summary section
        if (summary) {
          summary += ' ';
        }
        summary += trimmed;
      }
    }

    // Fallback: if no facts extracted, try to split by common patterns
    if (facts.length === 0 && summary) {
      // Try to find facts in the text
      const factMatches = summary.match(/[•\-\*]\s*([^\n]+)/g);
      if (factMatches) {
        facts.push(...factMatches.map(m => m.replace(/^[•\-\*]\s*/, '').trim()));
      }
    }

    // Ensure we have at least a summary
    if (!summary && facts.length > 0) {
      summary = facts.join('. ');
      facts.length = 0; // Clear facts if we used them as summary
    }

    if (!summary) {
      summary = fullText; // Fallback to full text
    }

    return {
      summary: summary,
      facts: facts.length > 0 ? facts : [],
      model: 'gpt-4o-mini',
      generatedAt: new Date(),
    };
  } catch (error) {
    // Fail safely - log error but don't throw
    console.error('[AI Dispute Summary] Error generating summary:', error);
    return null;
  }
}

/**
 * Prepare dispute data for prompt (sanitize and structure)
 */
function prepareDisputeDataForPrompt(orderData: Record<string, any>): string {
  const parts: string[] = [];
  
  // Order context
  parts.push(`Order ID: ${orderData.id || 'N/A'}`);
  parts.push(`Order Amount: $${orderData.amount || 0}`);
  parts.push(`Order Status: ${orderData.status || 'N/A'}`);
  parts.push(`Buyer ID: ${orderData.buyerId || 'N/A'}`);
  parts.push(`Seller ID: ${orderData.sellerId || 'N/A'}`);
  parts.push(`Listing ID: ${orderData.listingId || 'N/A'}`);
  
  // Listing context (if available)
  if (orderData.listing) {
    parts.push(`Listing Title: ${orderData.listing.title || 'N/A'}`);
    parts.push(`Listing Category: ${orderData.listing.category || 'N/A'}`);
  }
  
  // Dispute context
  if (orderData.disputeStatus) {
    parts.push(`Dispute Status: ${orderData.disputeStatus}`);
  }
  
  if (orderData.disputeReasonV2) {
    parts.push(`Dispute Reason: ${orderData.disputeReasonV2}`);
  }
  
  if (orderData.disputeNotes) {
    parts.push(`Dispute Notes: ${orderData.disputeNotes}`);
  }
  
  if (orderData.disputeOpenedAt) {
    const openedDate = orderData.disputeOpenedAt instanceof Date 
      ? orderData.disputeOpenedAt 
      : new Date(orderData.disputeOpenedAt);
    parts.push(`Dispute Opened: ${openedDate.toISOString()}`);
  }
  
  // Evidence
  if (Array.isArray(orderData.disputeEvidence) && orderData.disputeEvidence.length > 0) {
    parts.push(`Evidence Items (${orderData.disputeEvidence.length}):`);
    orderData.disputeEvidence.forEach((evidence: any, idx: number) => {
      const uploadDate = evidence.uploadedAt instanceof Date
        ? evidence.uploadedAt
        : evidence.uploadedAt?.toDate
        ? evidence.uploadedAt.toDate()
        : new Date(evidence.uploadedAt || Date.now());
      parts.push(`  ${idx + 1}. Type: ${evidence.type}, Uploaded: ${uploadDate.toISOString()}`);
    });
  }
  
  // Timeline events (if available)
  if (Array.isArray(orderData.timeline) && orderData.timeline.length > 0) {
    parts.push(`Timeline Events:`);
    orderData.timeline.forEach((event: any) => {
      const eventDate = event.timestamp instanceof Date
        ? event.timestamp
        : event.timestamp?.toDate
        ? event.timestamp.toDate()
        : new Date(event.timestamp || Date.now());
      parts.push(`  - ${eventDate.toISOString()}: ${event.label || event.type || 'Event'}`);
      if (event.actor) {
        parts.push(`    Actor: ${event.actor}`);
      }
    });
  }
  
  // Key dates
  if (orderData.createdAt) {
    const createdDate = orderData.createdAt instanceof Date
      ? orderData.createdAt
      : new Date(orderData.createdAt);
    parts.push(`Order Created: ${createdDate.toISOString()}`);
  }
  
  if (orderData.paidAt) {
    const paidDate = orderData.paidAt instanceof Date
      ? orderData.paidAt
      : new Date(orderData.paidAt);
    parts.push(`Order Paid: ${paidDate.toISOString()}`);
  }
  
  if (orderData.deliveredAt) {
    const deliveredDate = orderData.deliveredAt instanceof Date
      ? orderData.deliveredAt
      : new Date(orderData.deliveredAt);
    parts.push(`Order Delivered: ${deliveredDate.toISOString()}`);
  }
  
  if (orderData.buyerAcceptedAt) {
    const acceptedDate = orderData.buyerAcceptedAt instanceof Date
      ? orderData.buyerAcceptedAt
      : new Date(orderData.buyerAcceptedAt);
    parts.push(`Buyer Accepted: ${acceptedDate.toISOString()}`);
  }
  
  // Protection window (if applicable)
  if (orderData.protectionStartAt && orderData.protectionEndsAt) {
    const startDate = orderData.protectionStartAt instanceof Date
      ? orderData.protectionStartAt
      : new Date(orderData.protectionStartAt);
    const endDate = orderData.protectionEndsAt instanceof Date
      ? orderData.protectionEndsAt
      : new Date(orderData.protectionEndsAt);
    parts.push(`Protection Window: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  }
  
  // Resolution context (if resolved)
  if (orderData.disputeStatus?.startsWith('resolved_')) {
    parts.push(`Resolution Status: ${orderData.disputeStatus}`);
    
    if (orderData.refundedAt) {
      const refundDate = orderData.refundedAt instanceof Date
        ? orderData.refundedAt
        : new Date(orderData.refundedAt);
      parts.push(`Refunded At: ${refundDate.toISOString()}`);
      parts.push(`Refunded By: ${orderData.refundedBy || 'N/A'}`);
      parts.push(`Refund Reason: ${orderData.refundReason || 'N/A'}`);
    }
    
    if (orderData.releasedAt) {
      const releaseDate = orderData.releasedAt instanceof Date
        ? orderData.releasedAt
        : new Date(orderData.releasedAt);
      parts.push(`Released At: ${releaseDate.toISOString()}`);
      parts.push(`Released By: ${orderData.releasedBy || 'N/A'}`);
    }
    
    if (orderData.adminNotes) {
      parts.push(`Admin Notes: ${orderData.adminNotes}`);
    }
  }
  
  return parts.join('\n');
}

/**
 * Generate AI draft response for admin to send to user
 * 
 * This function:
 * - Only runs server-side
 * - Requires AI_ADMIN_DRAFT_ENABLED=true
 * - Requires OPENAI_API_KEY env var
 * - Returns professional, neutral draft messages
 * - Fails gracefully (logs errors, never blocks UI)
 * 
 * @param ticketData Support ticket data (subject, message, user info, etc.)
 * @param context Optional additional context (related order, listing, etc.)
 * @returns Draft message text or null if generation fails
 */
export async function generateAIAdminDraft(
  ticketData: Record<string, any>,
  context?: Record<string, any>
): Promise<string | null> {
  // Feature flag check
  if (!isAIAdminDraftEnabled()) {
    console.log('[AI Admin Draft] Feature disabled via AI_ADMIN_DRAFT_ENABLED');
    return null;
  }

  // API key check
  if (!hasOpenAIKey()) {
    console.warn('[AI Admin Draft] OPENAI_API_KEY not configured');
    return null;
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return null;
    }

    // Prepare ticket data for the prompt
    const ticketDataForPrompt = prepareTicketDataForDraft(ticketData, context);

    // Conservative prompt - professional, neutral, no accusations
    const prompt = `Draft a professional, neutral response for an admin to send to a user.
Be polite, factual, and non-accusatory.
Do not imply decisions, outcomes, or enforcement.
Do not mention AI or automation.
Keep the tone helpful and professional.
Use 2-4 sentences, be concise.

Support Ticket Context:
${ticketDataForPrompt}

Draft a response that:
- Acknowledges the user's concern
- Provides helpful information or next steps
- Maintains a professional, neutral tone
- Does not make promises or guarantees
- Does not accuse or blame`;

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
            content: 'You are an assistant that drafts professional, neutral responses for admins to send to users. Be polite, factual, and helpful. Do not make accusations, promises, or mention AI.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 300, // Keep drafts concise (2-4 sentences)
        temperature: 0.4, // Slightly higher for more natural language, but still conservative
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[AI Admin Draft] OpenAI API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const draftText = data.choices?.[0]?.message?.content?.trim();

    if (!draftText) {
      console.warn('[AI Admin Draft] No draft text in OpenAI response');
      return null;
    }

    return draftText;
  } catch (error) {
    // Fail safely - log error but don't throw
    console.error('[AI Admin Draft] Error generating draft:', error);
    return null;
  }
}

/**
 * Prepare ticket data for draft prompt (sanitize and structure)
 */
function prepareTicketDataForDraft(
  ticketData: Record<string, any>,
  context?: Record<string, any>
): string {
  const parts: string[] = [];

  // Ticket core info
  parts.push(`Subject: ${ticketData.subject || 'N/A'}`);
  parts.push(`User Name: ${ticketData.name || 'N/A'}`);
  parts.push(`User Email: ${ticketData.email || 'N/A'}`);
  
  if (ticketData.message || ticketData.messagePreview) {
    parts.push(`User Message: ${ticketData.message || ticketData.messagePreview || 'N/A'}`);
  }

  if (ticketData.status) {
    parts.push(`Ticket Status: ${ticketData.status}`);
  }

  if (ticketData.category) {
    parts.push(`Category: ${ticketData.category}`);
  }

  // Related entities (if available)
  if (ticketData.orderId || context?.orderId) {
    parts.push(`Related Order ID: ${ticketData.orderId || context?.orderId}`);
    if (context?.order) {
      parts.push(`Order Amount: $${context.order.amount || 0}`);
      parts.push(`Order Status: ${context.order.status || 'N/A'}`);
    }
  }

  if (ticketData.listingId || context?.listingId) {
    parts.push(`Related Listing ID: ${ticketData.listingId || context?.listingId}`);
    if (context?.listing) {
      parts.push(`Listing Title: ${context.listing.title || 'N/A'}`);
    }
  }

  if (ticketData.userId || context?.userId) {
    parts.push(`User ID: ${ticketData.userId || context?.userId}`);
  }

  // Previous messages (if available) - last 2-3 for context
  if (Array.isArray(context?.messages) && context.messages.length > 0) {
    const recentMessages = context.messages.slice(-3);
    parts.push(`Previous Messages (${recentMessages.length}):`);
    recentMessages.forEach((msg: any, idx: number) => {
      const sender = msg.kind === 'admin' ? 'Admin' : 'User';
      const preview = (msg.body || '').substring(0, 100);
      parts.push(`  ${idx + 1}. ${sender}: ${preview}${preview.length >= 100 ? '...' : ''}`);
    });
  }

  // Ticket creation date
  if (ticketData.createdAt) {
    const createdDate = ticketData.createdAt instanceof Date
      ? ticketData.createdAt
      : ticketData.createdAt?.toDate
      ? ticketData.createdAt.toDate()
      : new Date(ticketData.createdAt);
    parts.push(`Ticket Created: ${createdDate.toISOString()}`);
  }

  return parts.join('\n');
}
