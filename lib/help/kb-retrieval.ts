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
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2); // Ignore very short words

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

        // Word matches in title
        queryWords.forEach((word) => {
          if (titleLower.includes(word)) {
            score += 5;
          }
        });

        // Word matches in tags
        queryWords.forEach((word) => {
          if (tagsLower.includes(word)) {
            score += 3;
          }
        });

        // Word matches in content
        queryWords.forEach((word) => {
          const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
          score += Math.min(matches, 5); // Cap content matches at 5 points per word
        });

        return {
          ...article,
          score,
        };
      })
      .filter((article: any) => article.score > 0) // Only return articles with some relevance
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
