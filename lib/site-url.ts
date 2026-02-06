export function getSiteUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    // Netlify provides these at runtime; prefer them over NETLIFY_URL.
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.NETLIFY_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';

  const url = raw.startsWith('http') ? raw : `https://${raw}`;
  return url.replace(/\/$/, '');
}

/**
 * Returns the site URL that should be used for email links and other outbound URLs.
 * If getSiteUrl() would return localhost (e.g. in serverless where env is unset), returns
 * APP_URL / NEXT_PUBLIC_APP_URL or the canonical production URL so emails never link to localhost.
 */
export function getCanonicalSiteUrl(): string {
  const u = getSiteUrl();
  if (u.includes('localhost')) {
    const raw =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.URL ||
      process.env.DEPLOY_PRIME_URL ||
      process.env.NETLIFY_URL ||
      process.env.VERCEL_URL ||
      'https://agchange.app';
    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    return url.replace(/\/$/, '');
  }
  return u;
}