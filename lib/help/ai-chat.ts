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
      answer: "I'm here to help, but the AI chat feature is currently disabled. Please use the 'Contact Support' option to get help from our team.",
      sources: [],
      kbAvailable: false,
    };
  }

  // API key check
  if (!hasOpenAIKey()) {
    console.warn('[AI Help Chat] OPENAI_API_KEY not configured');
    return {
      answer: "I'm here to help, but the AI chat feature is not fully configured yet. Please use the 'Contact Support' option to get help from our team.",
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

    // Strict prompt - answer ONLY from KB, no general knowledge
    const systemPrompt = `You are a helpful assistant for Wildlife Exchange. Your job is to answer user questions using ONLY the knowledge base articles provided below.

CRITICAL RULES:
1. Answer ONLY from the provided knowledge base articles
2. Do NOT use any general knowledge or information not in the articles
3. If the answer is not in the articles, say you're not sure and suggest contacting support
4. Keep answers concise (2-4 sentences max)
5. Be friendly, helpful, and professional
6. Do NOT mention AI, automation, or that you're an AI
7. Do NOT make up information
8. If asked about features not in the articles, say you're not sure and suggest contacting support

Knowledge Base Articles:
${kbContext}`;

    const userPrompt = `User Question: ${options.userMessage}

Answer the user's question using ONLY the information from the knowledge base articles above. If the answer is not in the articles, politely say you're not sure and suggest they contact support.`;

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
        max_tokens: 300, // Keep answers concise
        temperature: 0.3, // Low temperature for more factual, consistent responses
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
