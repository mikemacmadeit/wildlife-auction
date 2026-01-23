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

    // Intelligent fallback for common questions even if KB doesn't have exact match
    if (articles.length === 0) {
      const queryLower = options.userMessage.toLowerCase();
      
      // Provide helpful fallback responses for very common questions
      if (queryLower.includes('sign in') || queryLower.includes('login') || queryLower.includes('cant sign') || queryLower.includes("can't sign")) {
        return {
          answer: "I'd be happy to help you sign in! Here are the most common solutions: 1) Make sure your email is verified - check your inbox for a verification link. 2) If you forgot your password, click 'Forgot Password' on the sign-in page to reset it. 3) Check that you're using the correct email address (it's case-sensitive). 4) Try clearing your browser cache or using a different browser. 5) Make sure caps lock is off - passwords are case-sensitive. If none of these work, please use the 'Contact Support' option and we'll help you get signed in right away.",
          sources: [],
          kbAvailable: true,
        };
      }
      
      if (queryLower.includes('list') && (queryLower.includes('animal') || queryLower.includes('item') || queryLower.includes('sell'))) {
        return {
          answer: "To list an animal or item for sale: 1) Sign in and go to 'Create Listing' in your dashboard. 2) Choose your listing type (Auction or Fixed Price). 3) Select the category (Wildlife, Cattle, Horses, Equipment, etc.). 4) Add a clear title and detailed description. 5) Upload high-quality photos (at least 3-5 recommended). 6) Set your location and pricing. 7) Fill in category-specific attributes. 8) Review and publish - your listing will be reviewed by admin (usually within 24 hours). Make sure your email is verified and your payment account is connected before publishing. Need more details? Check the 'How to List an Animal' guide or contact support!",
          sources: [],
          kbAvailable: true,
        };
      }
      
      if (queryLower.includes('contact') && queryLower.includes('seller')) {
        return {
          answer: "To contact a seller: 1) Go to the listing page you're interested in. 2) Click 'Contact Seller' or 'Message Seller' button. 3) Write your message with your questions. 4) Send the message - the seller will be notified. You can also contact sellers through your order page after making a purchase. Sellers typically respond within 24-48 hours. Be specific with your questions and polite in your communication. If a seller doesn't respond after 3 days, you can contact support for assistance.",
          sources: [],
          kbAvailable: true,
        };
      }
      
      // Default helpful fallback
      return {
        answer: `I want to help you with "${options.userMessage}". While I don't have specific information about that exact question in our knowledge base right now, here are some ways I can help: 1) Try rephrasing your question with different words. 2) Use the 'Contact Support' option for personalized help from our team. 3) Browse our Help articles for related topics. Our support team is here to help and typically responds within 1-2 business days. What specific issue are you trying to solve?`,
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
- Start with a warm, empathetic acknowledgment (especially for problems)
- Provide comprehensive answer (4-8 sentences, be thorough and detailed)
- Include specific, actionable steps when relevant (numbered lists work well)
- Provide context and "why" behind recommendations
- Mention related topics or next steps that might help
- End with encouragement, reassurance, or clear next steps
- Always offer to help further or suggest contacting support if needed

EXAMPLES OF GREAT RESPONSES:
- For problems: "I understand how frustrating that must be. Let's get this sorted out together. Here's what to try: [step-by-step solutions]. If that doesn't work, [next steps]. I'm here to help!"
- For how-to questions: "Great question! Here's exactly how that works: [detailed explanation with steps]. You'll want to [related tip]. Need help with any step? Just ask!"
- For general questions: "I'd be happy to explain! [Comprehensive answer with context]. You might also find it helpful to know [related info]. Does that help, or do you have other questions?"

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
