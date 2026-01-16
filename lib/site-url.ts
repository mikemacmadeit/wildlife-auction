export function getSiteUrl(): string {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NETLIFY_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';

  const url = raw.startsWith('http') ? raw : `https://${raw}`;
  return url.replace(/\/$/, '');
}

