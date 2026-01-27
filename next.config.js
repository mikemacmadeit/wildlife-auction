/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false, // Keep type checking enabled
  },
  async headers() {
    // Avoid noisy popup warnings (Firebase/Stripe auth flows) in Chrome:
    // "Cross-Origin-Opener-Policy policy would block the window.closed/window.close call."
    // This is safe for the app and keeps popups working as expected.
    return [
      // Auth pages are the ones that open third-party popups; be extra permissive here.
      // In some environments, Chrome can still warn even with `same-origin-allow-popups`;
      // `unsafe-none` avoids the warning spam without impacting app correctness.
      {
        source: '/login',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
        ],
      },
      {
        source: '/register',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'unsafe-none' },
        ],
      },
      // HTML and app routes: do NOT cache long. Long-lived cache on HTML causes stale chunk
      // URLs after deploy → ChunkLoadError (404 on old chunks). Only _next/static gets immutable.
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          {
            key: 'Cache-Control',
            value: process.env.NODE_ENV === 'development'
              ? 'no-store, must-revalidate'
              : 'public, max-age=0, must-revalidate',
          },
        ],
      },
      // Static assets: aggressive caching
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: process.env.NODE_ENV === 'development'
              ? 'no-store, must-revalidate'
              : 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  images: { 
    // Enable image optimization for better performance
    // Note: Netlify supports Next.js image optimization out of the box
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    // Some Next.js versions still validate remote image hosts against `images.domains`
    // even when using `remotePatterns` (especially during dev/HMR). Keep both to avoid
    // runtime crashes when rendering Firebase Storage URLs.
    domains: [
      'images.unsplash.com',
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'lh3.googleusercontent.com',
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Enable Fast Refresh for better hot reloading
  reactStrictMode: true,
  // Optimize for development hot reloading
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000, // Check for file changes every second
        aggregateTimeout: 300, // Delay before rebuilding
      };
    }
    return config;
  },
};

module.exports = nextConfig;
