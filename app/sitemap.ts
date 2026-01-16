import type { MetadataRoute } from 'next';
import { getFieldNotesAuthors, getFieldNotesIndex, getFieldNotesTags } from '@/lib/content/field-notes';
import { getSiteUrl } from '@/lib/site-url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${site}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${site}/browse`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${site}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${site}/how-it-works/plans`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${site}/how-it-works/trust`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${site}/field-notes`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${site}/field-notes/authors`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${site}/field-notes/tags`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${site}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${site}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${site}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const posts = await getFieldNotesIndex();
  const postRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${site}/field-notes/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const authors = await getFieldNotesAuthors();
  const authorRoutes: MetadataRoute.Sitemap = authors.map((a) => ({
    url: `${site}/field-notes/authors/${a.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.4,
  }));

  const tags = await getFieldNotesTags();
  const tagRoutes: MetadataRoute.Sitemap = tags.map((t) => ({
    url: `${site}/field-notes/tags/${t.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.4,
  }));

  return [...staticRoutes, ...postRoutes, ...authorRoutes, ...tagRoutes];
}

