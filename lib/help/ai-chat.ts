/**
 * AI Help Chat - KB-Grounded Response Generation
 * 
 * Server-side only. Generates AI responses strictly grounded in KB articles.
 */

import { retrieveKBArticles, formatKBArticlesForPrompt } from './kb-retrieval';

export interface GenerateChatResponseOptions {
  userMessage: string;
  audience?: 'buyer' | 'seller' | 'all';
  context?: {
    pathname?: string;
    listingId?: string;
    orderId?: string;
  };
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
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
        context: options.context,
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
      
      if (queryLower.includes('photo') || queryLower.includes('picture') || queryLower.includes('image')) {
        return {
          answer: "For listing photos: You need at least 1 photo (required), but 3-5 photos are recommended. Photos should be clear, well-lit, and show the item from multiple angles. Use natural daylight when possible, keep backgrounds simple, and make sure the item is in focus. For animals, include full body shots, head shots, and any unique markings. For equipment, show all sides and important features. First photo is most important as it's the thumbnail buyers see. Upload JPG or PNG files under 10MB each. Need more details? Check our 'Photo Requirements' guide!",
          sources: [],
          kbAvailable: true,
        };
      }
      
      if (queryLower.includes('refund') || queryLower.includes('money back') || queryLower.includes('return')) {
        return {
          answer: "To get a refund: 1) Contact the seller first to try to resolve the issue - most problems are solved this way. 2) If the seller won't help, go to 'My Orders', click on the order, and open a dispute. 3) Provide details about the issue and any evidence (photos, messages). 4) Admin will review your dispute (usually within a few business days). 5) If approved, refund is processed to your original payment method (5-10 business days). Valid reasons include: item not as described, item not received, item damaged, or seller unresponsive. Buyer's remorse or minor issues typically don't qualify. Need help? Contact support!",
          sources: [],
          kbAvailable: true,
        };
      }
      
      if (queryLower.includes('fee') || queryLower.includes('cost') || queryLower.includes('how much')) {
        return {
          answer: "Seller fees: You only pay fees when your item sells (no listing fees). Platform fee is typically 5-10% of the final sale price, depending on your seller tier. Payment processing fees (Stripe) are about 2.9% + $0.30 per transaction. So if you sell an item for $1,000, you might pay $80 platform fee + $29.30 processing = $109.30 total, and receive $890.70. Buyers don't pay any fees - they just pay the listing price. All fees are transparent and shown before you publish. Want more details? Check 'Seller Fees Explained' in our help articles!",
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
    
    // Add context about user's question type for better responses
    const queryLower = options.userMessage.toLowerCase();
    const isProblem = queryLower.includes('cant') || queryLower.includes("can't") || queryLower.includes('cannot') || queryLower.includes('problem') || queryLower.includes('issue') || queryLower.includes('error') || queryLower.includes('not working') || queryLower.includes('help');
    const isHowTo = queryLower.includes('how') || queryLower.includes('step') || queryLower.includes('guide');
    const isWhatWhy = queryLower.includes('what') || queryLower.includes('why') || queryLower.includes('explain') || queryLower.includes('tell me about');
    
    const questionContext = isProblem ? 'This is a PROBLEM/ISSUE question - the user needs troubleshooting help.' : 
                           isHowTo ? 'This is a HOW-TO question - the user needs step-by-step instructions.' :
                           isWhatWhy ? 'This is a WHAT/WHY question - the user needs explanation and context.' :
                           'This is a general question - provide comprehensive, helpful information.';

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
2. **Be comprehensive** - Don't just answer the question, provide helpful context, examples, and next steps
3. **Be practical** - Give actionable, step-by-step guidance when possible. Use numbered lists for clarity.
4. **Anticipate follow-up questions** - Address related concerns the user might have. Think ahead.
5. **For troubleshooting** - Walk through common solutions systematically. Start with quick fixes, then deeper solutions.
6. **For "how-to" questions** - Provide clear, detailed step-by-step instructions. Explain the "why" behind steps.
7. **Be encouraging** - If someone is frustrated, acknowledge it ("I understand that's frustrating") and help them through it
8. **Provide examples** - Use concrete examples when helpful. Show, don't just tell.
9. **Be proactive** - Don't just answer, suggest next steps, related topics, and ways to prevent issues
10. **Show expertise** - Demonstrate deep knowledge while remaining accessible and friendly

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
${kbContext}

QUESTION CONTEXT: ${questionContext}

    const userPrompt = `User Question: ${options.userMessage}

${questionContext}

Provide an incredibly helpful, friendly, and comprehensive answer. Use the knowledge base articles as your primary source, but be thorough and practical. 

SPECIFIC GUIDANCE BASED ON QUESTION TYPE:
${isProblem ? `- This is a PROBLEM/ISSUE question. Start with empathy ("I understand how frustrating that must be" or "That's really frustrating - let's get this sorted out"). Then provide step-by-step solutions in a clear, numbered format. Walk through each solution methodically, starting with quick fixes, then deeper solutions. Explain why each step helps. End with encouragement ("I'm here to help if you need anything else") and clear next steps.` : ''}

${isHowTo ? `- This is a HOW-TO question. Start enthusiastically ("Great question!" or "I'd be happy to walk you through that!"). Provide clear, detailed step-by-step instructions. Number each step. Explain not just what to do, but why each step matters. Include tips, best practices, and common mistakes to avoid. Make it actionable and easy to follow. End with encouragement and offer to help with any step.` : ''}

${isWhatWhy ? `- This is a WHAT/WHY question. Start warmly ("I'd be happy to explain!" or "Great question - let me break that down for you"). Provide comprehensive explanation with context. Explain the concept clearly, include relevant details, examples, and mention related information that might help. Be thorough but clear. Use examples when helpful. End by asking if they have other questions.` : ''}

${!isProblem && !isHowTo && !isWhatWhy ? `- This is a general question. Provide comprehensive, helpful information. Be thorough, include context, examples when helpful, and related information. Be friendly and encouraging. End with an offer to help further.` : ''}

GENERAL PRINCIPLES (apply to all):
- Be empathetic, encouraging, and proactive
- Anticipate follow-up questions the user might have
- Provide actionable, practical guidance
- Use numbered lists for steps
- Include "why" behind recommendations
- Mention related topics that might help
- Always end with encouragement and offer to help further`;

    // Build messages array with conversation history if available
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];
    
    // Add conversation history (last 5 messages for context)
    if (options.conversationHistory && options.conversationHistory.length > 0) {
      const recentHistory = options.conversationHistory.slice(-5);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      }
    }
    
    // Add current user message
    messages.push({
      role: 'user',
      content: userPrompt,
    });
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini', // Cost-effective, fast model
          messages,
          max_tokens: 700, // Allow very comprehensive, detailed answers
          temperature: 0.75, // Higher for more natural, empathetic, conversational, helpful tone
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[AI Help Chat] OpenAI API error:', response.status, errorText);
        
        // Better error messages based on status
        let errorMessage = "I'm having trouble processing your question right now.";
        if (response.status === 429) {
          errorMessage = "I'm receiving too many requests right now. Please wait a moment and try again.";
        } else if (response.status === 401 || response.status === 403) {
          errorMessage = "The AI chat service is not properly configured. Please contact support for help.";
        } else if (response.status >= 500) {
          errorMessage = "The AI service is temporarily unavailable. Please try again in a few moments or contact support.";
        }
        
        return {
          answer: errorMessage,
          sources: [],
          kbAvailable: true,
        };
      }

      const data = await response.json();
      let answer = data.choices?.[0]?.message?.content?.trim();

      if (!answer) {
        return {
          answer: "I couldn't generate a response. Please try rephrasing your question or contact support.",
          sources: [],
          kbAvailable: true,
        };
      }
      
      // Response quality validation
      if (answer.length < 30) {
        // Response is too short, might be incomplete
        console.warn('[AI Help Chat] Response too short, might be incomplete');
      }
      
      // Check for generic/unhelpful responses
      const genericPatterns = [
        /^I don't know/i,
        /^I can't help/i,
        /^I'm not sure/i,
        /^I don't have/i,
      ];
      
      if (genericPatterns.some(pattern => pattern.test(answer))) {
        // Response seems generic, try to enhance it
        answer = answer + " However, I'd be happy to help you find the information you need. Could you provide more details about what you're looking for?";
      }

    // Extract source article titles
    const sources = articles.map((a) => a.title);

    return {
      answer,
      sources,
      kbAvailable: true,
    };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Better error handling
      if (error.name === 'AbortError') {
        console.error('[AI Help Chat] Request timeout after 30 seconds');
        return {
          answer: "I'm taking longer than expected to respond. This might be due to high demand. Please try again in a moment or contact support for immediate help.",
          sources: [],
          kbAvailable: true,
        };
      }
      
      console.error('[AI Help Chat] Error generating response:', error);
      
      // Network errors
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        return {
          answer: "I'm having trouble connecting to the AI service. Please check your internet connection and try again, or contact support.",
          sources: [],
          kbAvailable: true,
        };
      }
      
      return {
        answer: "I encountered an error processing your question. Please try again or contact support.",
        sources: [],
        kbAvailable: true,
      };
    }
  }
}
