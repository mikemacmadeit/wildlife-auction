/**
 * Knowledge Base Retrieval for AI Help Chat
 * 
 * Server-side only. Retrieves relevant KB articles for AI chat responses.
 */

import { getAdminDb } from '@/lib/firebase/admin';
import { KnowledgeBaseArticle, KBArticleAudience } from '@/lib/types';

export interface KBRetrievalOptions {
  query: string;
  audience?: KBArticleAudience;
  limit?: number;
}

export interface KBRetrievalResult {
  articles: Array<{
    slug: string;
    title: string;
    content: string;
    category: string;
    tags: string[];
  }>;
  totalFound: number;
}

/**
 * Retrieve relevant KB articles for a user query
 * 
 * Strategy:
 * 1. Keyword search in title, content, and tags
 * 2. Filter by audience (buyer/seller/all)
 * 3. Filter by enabled status
 * 4. Return top N most relevant articles
 */
export async function retrieveKBArticles(
  options: KBRetrievalOptions
): Promise<KBRetrievalResult> {
  const { query, audience = 'all', limit = 8 } = options;

  try {
    const db = getAdminDb();
    const queryLower = query.toLowerCase().trim();
    
    // Expand query with comprehensive synonyms and variations
    const queryExpansions: string[] = [queryLower];
    
    // Authentication variations (very comprehensive)
    if (queryLower.includes('sign') || queryLower.includes('login') || queryLower.includes('auth')) {
      queryExpansions.push('sign in', 'signin', 'login', 'log in', 'authentication', 'account access', 'sign up', 'register', 'registration', 'account', 'access account');
    }
    if (queryLower.includes('cant') || queryLower.includes("can't") || queryLower.includes('cannot') || queryLower.includes('unable') || queryLower.includes('wont') || queryLower.includes("won't")) {
      queryExpansions.push('troubleshoot', 'help', 'problem', 'issue', 'error', 'fix', 'solution', 'not working', 'broken', 'failed');
    }
    if (queryLower.includes('password')) {
      queryExpansions.push('reset password', 'forgot password', 'password reset', 'change password', 'password help', 'lost password', 'password recovery');
    }
    if (queryLower.includes('email')) {
      queryExpansions.push('email verification', 'verify email', 'email confirm', 'email not working', 'email problems', 'email issues', 'verify account');
    }
    
    // Listing variations (comprehensive)
    if (queryLower.includes('list') || queryLower.includes('sell') || queryLower.includes('post')) {
      queryExpansions.push('create listing', 'post listing', 'sell', 'how to sell', 'listing animal', 'create listing', 'publish listing', 'add listing', 'new listing');
    }
    if (queryLower.includes('listing') && (queryLower.includes('not') || queryLower.includes('show') || queryLower.includes('appear') || queryLower.includes('visible'))) {
      queryExpansions.push('listing not showing', 'listing not appearing', 'listing visibility', 'listing search', 'listing hidden', 'listing missing');
    }
    
    // Contact/seller variations
    if (queryLower.includes('contact') || queryLower.includes('seller') || queryLower.includes('message') || queryLower.includes('reach')) {
      queryExpansions.push('contact seller', 'message seller', 'how to contact', 'seller communication', 'talk to seller', 'seller contact');
    }
    
    // Buy/purchase variations
    if (queryLower.includes('buy') || queryLower.includes('purchase') || queryLower.includes('order') || queryLower.includes('checkout')) {
      queryExpansions.push('how to buy', 'purchasing', 'checkout', 'making purchase', 'buying process', 'complete purchase', 'make purchase');
    }
    
    // Payment variations
    if (queryLower.includes('pay') || queryLower.includes('payment') || queryLower.includes('checkout') || queryLower.includes('card') || queryLower.includes('ach')) {
      queryExpansions.push('payment methods', 'how to pay', 'payment options', 'checkout process', 'payment processing', 'credit card', 'bank transfer');
    }
    
    // Delivery variations
    if (queryLower.includes('deliver') || queryLower.includes('ship') || queryLower.includes('receive') || queryLower.includes('pickup')) {
      queryExpansions.push('delivery', 'shipping', 'pickup', 'receive order', 'delivery time', 'when will I receive', 'delivery options');
    }
    
    // Account/profile variations
    if (queryLower.includes('account') || queryLower.includes('profile') || queryLower.includes('setup') || queryLower.includes('settings')) {
      queryExpansions.push('account setup', 'profile setup', 'account settings', 'complete profile', 'account configuration');
    }
    
    // Bidding variations
    if (queryLower.includes('bid') || queryLower.includes('auction') || queryLower.includes('win')) {
      queryExpansions.push('bidding', 'auctions', 'how to bid', 'place bid', 'winning auction', 'auction process');
    }
    
    // Fees variations
    if (queryLower.includes('fee') || queryLower.includes('cost') || queryLower.includes('price') || queryLower.includes('charge')) {
      queryExpansions.push('fees', 'costs', 'pricing', 'seller fees', 'transaction fees', 'how much does it cost');
    }
    
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2); // Ignore very short words
    const allQueryWords = new Set(queryWords);
    queryExpansions.forEach(exp => {
      exp.split(/\s+/).filter((w) => w.length > 2).forEach(word => allQueryWords.add(word));
    });
    const expandedQueryWords = Array.from(allQueryWords);

    // Start with enabled articles only
    // Note: Firestore doesn't support OR queries easily, so we fetch all enabled articles
    // and filter by audience client-side for better flexibility
    let q: any = db.collection('knowledgeBaseArticles').where('enabled', '==', true);

    // Get all enabled articles (we'll filter and rank client-side)
    const snap = await q.get();

    const articles = snap.docs
      .map((doc: any) => {
        const data = doc.data();
        return {
          slug: data.slug || doc.id,
          title: data.title || '',
          content: data.content || '',
          category: data.category || 'other',
          tags: Array.isArray(data.tags) ? data.tags : [],
          audience: Array.isArray(data.audience) ? data.audience : ['all'],
        };
      })
      .filter((article: any) => {
        // Filter by audience if not 'all'
        if (audience !== 'all') {
          return article.audience.includes(audience) || article.audience.includes('all');
        }
        return true;
      })
      .map((article: any) => {
        // Calculate relevance score
        let score = 0;
        const titleLower = article.title.toLowerCase();
        const contentLower = article.content.toLowerCase();
        const tagsLower = article.tags.map((t: string) => t.toLowerCase()).join(' ');

        // Exact phrase match in title (highest weight)
        if (titleLower.includes(queryLower)) {
          score += 10;
        }

        // Word matches in title (use expanded words)
        expandedQueryWords.forEach((word) => {
          if (titleLower.includes(word)) {
            score += 5;
          }
        });

        // Word matches in tags (use expanded words)
        expandedQueryWords.forEach((word) => {
          if (tagsLower.includes(word)) {
            score += 3;
          }
        });

        // Word matches in content (use expanded words)
        expandedQueryWords.forEach((word) => {
          const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
          score += Math.min(matches, 5); // Cap content matches at 5 points per word
        });
        
        // Boost score for troubleshooting category if query suggests a problem
        if (article.category === 'troubleshooting' && (queryLower.includes('cant') || queryLower.includes("can't") || queryLower.includes('cannot') || queryLower.includes('problem') || queryLower.includes('issue') || queryLower.includes('error') || queryLower.includes('help') || queryLower.includes('not working') || queryLower.includes('broken') || queryLower.includes('failed'))) {
          score += 4;
        }
        
        // Boost score for getting-started articles for "how/what/why" questions
        if (article.category === 'getting-started' && (queryLower.includes('how') || queryLower.includes('what') || queryLower.includes('why') || queryLower.includes('guide') || queryLower.includes('learn') || queryLower.includes('explain'))) {
          score += 3;
        }
        
        // Boost score for exact category matches (stronger boost)
        if (queryLower.includes('payment') && article.category === 'payments') score += 3;
        if (queryLower.includes('deliver') && article.category === 'delivery') score += 3;
        if (queryLower.includes('bid') && article.category === 'bidding') score += 3;
        if (queryLower.includes('listing') && article.category === 'listings') score += 3;
        if (queryLower.includes('account') && article.category === 'account') score += 3;
        if (queryLower.includes('safety') && article.category === 'safety') score += 3;
        if (queryLower.includes('dispute') && article.category === 'disputes') score += 3;
        
        // Boost for FAQ articles for general questions
        if (article.slug.includes('faq') || article.slug.includes('frequently-asked')) {
          score += 2;
        }

        return {
          ...article,
          score,
        };
      })
      .filter((article: any) => {
        // Return articles with relevance OR troubleshooting/getting-started for common questions
        if (article.score > 0) return true;
        if (article.category === 'troubleshooting') return true;
        // Include getting-started articles for "how/what/why" questions
        if (article.category === 'getting-started' && (queryLower.includes('how') || queryLower.includes('what') || queryLower.includes('why') || queryLower.includes('list') || queryLower.includes('sell'))) return true;
        return false;
      })
      .sort((a: any, b: any) => b.score - a.score) // Sort by relevance
      .slice(0, limit)
      .map((article: any) => ({
        slug: article.slug,
        title: article.title,
        content: article.content,
        category: article.category,
        tags: article.tags,
      }));

    return {
      articles,
      totalFound: articles.length,
    };
  } catch (error: any) {
    console.error('[KB Retrieval] Error retrieving articles:', error);
    return {
      articles: [],
      totalFound: 0,
    };
  }
}

/**
 * Format KB articles for AI prompt context
 */
export function formatKBArticlesForPrompt(articles: KBRetrievalResult['articles']): string {
  if (articles.length === 0) {
    return 'No relevant knowledge base articles found.';
  }

  const sections = articles.map((article, idx) => {
    return `Article ${idx + 1}: ${article.title}
Category: ${article.category}
Tags: ${article.tags.join(', ') || 'none'}
Content:
${article.content.slice(0, 2000)}${article.content.length > 2000 ? '...' : ''}
---`;
  });

  return sections.join('\n\n');
}
