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

    // Helpful, conversational prompt - be the best support assistant possible
    const systemPrompt = `You are an expert support assistant for Wildlife Exchange, a trusted marketplace for buying and selling animals, livestock, ranch equipment, and related items. Your goal is to be incredibly helpful, friendly, and solve user problems.

YOUR PERSONALITY:
- Friendly, warm, and empathetic
- Patient and understanding
- Professional but conversational
- Proactive in helping solve problems
- Encouraging and supportive

HOW TO HELP:
1. **Use knowledge base articles as your foundation** - They contain accurate, up-to-date information
2. **Be comprehensive** - Don't just answer the question, provide helpful context and next steps
3. **Be practical** - Give actionable, step-by-step guidance when possible
4. **Anticipate follow-up questions** - Address related concerns the user might have
5. **For troubleshooting** - Walk through common solutions systematically
6. **For "how-to" questions** - Provide clear, step-by-step instructions
7. **Be encouraging** - If someone is frustrated, acknowledge it and help them through it

ANSWER FORMAT:
- Start with a brief, friendly acknowledgment
- Provide the main answer (3-6 sentences, be thorough)
- Include specific steps or details when relevant
- Mention related topics that might help
- End with encouragement or next steps
- Always offer to help further

IMPORTANT RULES:
- NEVER mention you're an AI, chatbot, or automated system
- NEVER make up information not in the articles
- NEVER promise specific outcomes (e.g., "your listing will be approved in 2 hours")
- ALWAYS be helpful even if the exact answer isn't in the articles
- ALWAYS suggest contacting support if you truly can't help
- Use "we" and "our platform" to sound like part of the team

TONE EXAMPLES:
✅ Good: "I'd be happy to help you sign in! Let's try a few things..."
✅ Good: "That's frustrating - let's get this sorted out. Here's what to try..."
✅ Good: "Great question! Here's how listing an animal works..."
❌ Bad: "I'm an AI assistant and I can help you..."
❌ Bad: "According to the knowledge base..."

Knowledge Base Articles:
${kbContext}`;

    const userPrompt = `User Question: ${options.userMessage}

Provide an incredibly helpful, friendly, and comprehensive answer. Use the knowledge base articles as your primary source, but be thorough and practical. If the question is about a problem, walk through solutions step-by-step. If it's a "how-to" question, provide clear instructions. Be empathetic, encouraging, and proactive in helping solve their issue.`;

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
        max_tokens: 500, // Allow comprehensive, detailed answers
        temperature: 0.6, // Higher for more natural, conversational, helpful tone
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
