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
      {
        source: '/:path*',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }],
      },
    ];
  },
  images: { 
    unoptimized: true,
    // Some Next.js versions still validate remote image hosts against `images.domains`
    // even when using `remotePatterns` (especially during dev/HMR). Keep both to avoid
    // runtime crashes when rendering Firebase Storage URLs.
    domains: [
      'images.unsplash.com',
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
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
