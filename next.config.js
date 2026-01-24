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
      // General pages - must come BEFORE specific auth routes
      {
        source: '/((?!login|register).*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          // Performance: Enable compression and caching
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
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
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  images: {
    // Enable image optimization for better performance
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
    // Configure remote patterns to allow Firebase Storage and other sources
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/v0/b/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'wildlife-exchange.firebasestorage.app',
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
