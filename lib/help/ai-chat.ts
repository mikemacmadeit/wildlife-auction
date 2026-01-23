/**
 * AI Help Chat - KB-Grounded Response Generation
 * 
 * Server-side only. Generates AI responses strictly grounded in KB articles.
 */

import { retrieveKBArticles, formatKBArticlesForPrompt } from './kb-retrieval';

export interface GenerateChatResponseOptions {
  userMessage: string;
  audience?: 'buyer' | 'seller' | 'all';
  kbArticles?: Array<{
    slug: string;
    title: string;
    content: string;
    category: string;
    tags: string[];
  }>;
}

export interface ChatResponseResult {
  answer: string;
  sources: string[];
  kbAvailable: boolean;
}

/**
 * Check if AI help chat feature is enabled
 */
export function isAIHelpChatEnabled(): boolean {
  const enabled = process.env.AI_HELP_CHAT_ENABLED;
  return enabled === 'true' || enabled === '1';
}

/**
 * Check if OpenAI API key is configured
 */
function hasOpenAIKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Generate KB-grounded AI chat response
 * 
 * This function:
 * - Only runs server-side
 * - Requires AI_HELP_CHAT_ENABLED=true
 * - Requires OPENAI_API_KEY env var
 * - Answers ONLY from provided KB articles
 * - Returns empty answer if KB doesn't have the answer
 * - Fails gracefully (logs errors, never blocks UI)
 */
export async function generateKBGroundedChatResponse(
  options: GenerateChatResponseOptions
): Promise<ChatResponseResult> {
  // Feature flag check
  if (!isAIHelpChatEnabled()) {
    console.log('[AI Help Chat] Feature disabled via AI_HELP_CHAT_ENABLED');
    return {
      answer: "I'm here to help! However, the AI chat feature needs to be enabled by an administrator. In the meantime, please use the 'Contact Support' tab to get help from our team, or check the Help tab for quick guides.",
      sources: [],
      kbAvailable: false,
    };
  }

  // API key check
  if (!hasOpenAIKey()) {
    console.warn('[AI Help Chat] OPENAI_API_KEY not configured');
    return {
      answer: "I'm here to help! However, the AI chat feature needs to be configured by an administrator. In the meantime, please use the 'Contact Support' tab to get help from our team, or check the Help tab for quick guides.",
      sources: [],
      kbAvailable: false,
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        answer: "I'm unable to process your question right now. Please try again or contact support.",
        sources: [],
        kbAvailable: false,
      };
    }

    // Retrieve KB articles if not provided
    let articles = options.kbArticles;
    if (!articles || articles.length === 0) {
      const retrievalResult = await retrieveKBArticles({
        query: options.userMessage,
        audience: options.audience || 'all',
        limit: 8,
      });
      articles = retrievalResult.articles;
    }

    if (articles.length === 0) {
      return {
        answer:
          "I couldn't find specific information about that in our knowledge base. Please use the 'Contact Support' option to get help from our team, and we'll be happy to assist you.",
        sources: [],
        kbAvailable: true,
      };
    }

    // Format KB articles for prompt
    const kbContext = formatKBArticlesForPrompt(articles);

    // Helpful prompt - use KB articles but be more flexible and helpful
    const systemPrompt = `You are a helpful support assistant for Wildlife Exchange, a marketplace for buying and selling animals, livestock, and related items. Your job is to help users with their questions.

INSTRUCTIONS:
1. Use the knowledge base articles below as your primary source of information
2. If the articles contain relevant information, provide a helpful answer based on them
3. If the articles don't have the exact answer but are related, provide helpful guidance based on what you know from the articles
4. For common issues like sign-in problems, password issues, or account access, provide practical troubleshooting steps even if not explicitly in the articles
5. Be friendly, empathetic, and professional
6. Keep answers concise but complete (3-5 sentences)
7. Always end with an offer to help further or suggest contacting support if needed
8. Do NOT mention AI, automation, or that you're an AI
9. If you truly cannot help, politely suggest contacting support

Knowledge Base Articles:
${kbContext}`;

    const userPrompt = `User Question: ${options.userMessage}

Provide a helpful answer to the user's question. Use the knowledge base articles above as your guide. If the articles don't have the exact answer, provide helpful guidance based on what you know from the articles and common troubleshooting steps. Be empathetic and helpful.`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Cost-effective, fast model
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: 400, // Allow more detailed helpful answers
        temperature: 0.5, // Slightly higher for more natural, helpful responses
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[AI Help Chat] OpenAI API error:', response.status, errorText);
      return {
        answer: "I'm having trouble processing your question right now. Please try again or contact support.",
        sources: [],
        kbAvailable: true,
      };
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return {
        answer: "I couldn't generate a response. Please try rephrasing your question or contact support.",
        sources: [],
        kbAvailable: true,
      };
    }

    // Extract source article titles
    const sources = articles.map((a) => a.title);

    return {
      answer,
      sources,
      kbAvailable: true,
    };
  } catch (error: any) {
    console.error('[AI Help Chat] Error generating response:', error);
    return {
      answer: "I encountered an error processing your question. Please try again or contact support.",
      sources: [],
      kbAvailable: true,
    };
  }
}
