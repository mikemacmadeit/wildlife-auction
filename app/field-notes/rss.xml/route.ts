import { getFieldNotesIndex } from '@/lib/content/field-notes';
import { getSiteUrl } from '@/lib/site-url';

export const runtime = 'nodejs';

function escapeXml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET() {
  const site = getSiteUrl();
  const posts = await getFieldNotesIndex();

  const items = posts.slice(0, 50).map((p) => {
    const url = `${site}/field-notes/${p.slug}`;
    return `
      <item>
        <title>${escapeXml(p.title)}</title>
        <link>${escapeXml(url)}</link>
        <guid>${escapeXml(url)}</guid>
        <pubDate>${new Date(p.date).toUTCString()}</pubDate>
        <description>${escapeXml(p.description)}</description>
      </item>
    `.trim();
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml('Agchange — Field Notes')}</title>
    <link>${escapeXml(`${site}/field-notes`)}</link>
    <description>${escapeXml('Guides, insights, and trust-first education for Agchange.')}</description>
    <language>en-us</language>
    ${items.join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600',
    },
  });
}

