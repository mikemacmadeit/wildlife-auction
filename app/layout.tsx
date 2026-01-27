import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import { ConditionalNavbar } from '@/components/navigation/ConditionalNavbar';
import { ConditionalFooter } from '@/components/navigation/ConditionalFooter';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { Providers } from '@/components/providers';
import { FavoritesInitializer } from '@/components/favorites/FavoritesInitializer';
import { PublicEmailCaptureMount } from '@/components/marketing/PublicEmailCaptureMount';
import { HelpLauncher } from '@/components/help/HelpLauncher';
import { getSiteUrl } from '@/lib/site-url';
import { cookies } from 'next/headers';
import { SiteGateClient } from '@/components/site/SiteGateClient';
import { VisibilityDiagnostics } from '@/lib/dev/visibility-diagnostics';
import { SentryInit } from '@/components/sentry/SentryInit';
import { ChunkLoadRecovery } from '@/components/ChunkLoadRecovery';

const inter = Inter({ subsets: ['latin'] });

const foundersGrotesk = localFont({
  src: [
    {
      path: './fonts/FoundersGrotesk-Light.otf',
      weight: '300',
      style: 'normal',
    },
    {
      path: './fonts/FoundersGrotesk-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/FoundersGrotesk-Medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/FoundersGrotesk-Semibold.otf',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/FoundersGrotesk-Bold.otf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-founders',
  display: 'swap',
  fallback: ['sans-serif'],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: 'Agchange | Texas Livestock & Ranch Marketplace',
  description: 'Buy and sell registered livestock, breeder stock, and ranch essentials across Texas. Auctions, fixed price, and classifieds—built for serious buyers and sellers.',
  // Icons can be added when favicon files are placed in /public/logos/
  // icons: {
  //   icon: '/logos/favicon.ico',
  //   apple: '/logos/apple-touch-icon.png',
  // },
  openGraph: {
    title: 'Agchange | Texas Livestock & Ranch Marketplace',
    description: 'Texas-only marketplace for registered livestock and ranch animal sales. Verified sellers, transparent listings, secure transactions.',
    type: 'website',
    // Uncomment and update when OG image is added to /public/images/
    // images: [
    //   {
    //     url: '/images/og-image.jpg',
    //     width: 1200,
    //     height: 630,
    //     alt: 'Agchange - Texas Livestock & Ranch Marketplace',
    //   },
    // ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agchange | Texas Livestock & Ranch Marketplace',
    description: 'Texas-only marketplace for registered livestock and ranch animal sales. Verified sellers, transparent listings.',
    // Uncomment when Twitter image is added
    // images: ['/images/og-image.jpg'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gateEnabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.SITE_GATE_ENABLED || '').toLowerCase());

  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
      <body className={`${inter.className} ${foundersGrotesk.variable}`}>
        <SentryInit />
        <ChunkLoadRecovery />
        <Providers>
          <FavoritesInitializer />
          {gateEnabled ? (
            <SiteGateClient>
              <div className="min-h-screen flex flex-col bg-background relative">
            {/* Atmospheric overlay - subtle depth (light mode only) */}
            <div className="fixed inset-0 pointer-events-none z-0 dark:hidden">
              {/* Parchment micro-glow at top center (subtle highlight) */}
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full blur-3xl opacity-[0.06]"
                style={{
                  background: 'radial-gradient(circle, hsl(40, 30%, 93%) 0%, hsl(40, 30%, 93% / 0.3) 30%, transparent 70%)'
                }}
              />
              {/* Sage glow near bottom (subtle) */}
              <div 
                className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full blur-3xl opacity-[0.04]"
                style={{
                  background: 'radial-gradient(circle, hsl(90, 12%, 45%) 0%, hsl(90, 12%, 45% / 0.3) 30%, transparent 70%)'
                }}
              />
            </div>
            <ConditionalNavbar />
            <PublicEmailCaptureMount />
            <HelpLauncher />
            <main className="flex-1 relative z-10">
              {children}
            </main>
            <ConditionalFooter />
            <Toaster />
            <SonnerToaster />
            <VisibilityDiagnostics enabled={process.env.NODE_ENV === 'development'} />
              </div>
            </SiteGateClient>
          ) : (
            <div className="min-h-screen flex flex-col bg-background relative">
              <ConditionalNavbar />
              <PublicEmailCaptureMount />
              <HelpLauncher />
              <main className="flex-1 relative z-10">
                {children}
              </main>
              <ConditionalFooter />
              <Toaster />
              <SonnerToaster />
              <VisibilityDiagnostics enabled={process.env.NODE_ENV === 'development'} />
            </div>
          )}
        </Providers>
      </body>
    </html>
  );
}
