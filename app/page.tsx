'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Shield, TrendingUp, Users, ArrowRight, Gavel, Zap, LayoutGrid, List } from 'lucide-react';
import { FeaturedListingCard } from '@/components/listings/FeaturedListingCard';
import { ListingCard } from '@/components/listings/ListingCard';
import { ListItem } from '@/components/listings/ListItem';
import { listActiveListings } from '@/lib/firebase/listings';
import { Listing } from '@/lib/types';
import { cn } from '@/lib/utils';

type ViewMode = 'card' | 'list';

export default function HomePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('home-view-mode');
      return (saved === 'card' || saved === 'list') ? saved : 'card';
    }
    return 'card';
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('home-view-mode', mode);
    }
  };

  // Fetch listings from Firestore
  useEffect(() => {
    async function fetchListings() {
      try {
        setLoading(true);
        setError(null);
        const data = await listActiveListings({ limitCount: 12 });
        setListings(data);
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load listings');
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, []);

  const featuredListings = listings.filter(l => l.featured).slice(0, 3);
  const recentListings = listings.slice(0, 6);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section - Premium Design with Background Image */}
      <section className="relative overflow-hidden min-h-[50vh] md:min-h-[60vh] flex items-center justify-center">
        {/* Background Image with Dark Overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/Buck_1.webp"
            alt="Wildlife Exchange Hero Background"
            fill
            className="object-cover"
            style={{ objectPosition: '50% 20%' }}
            priority
            quality={90}
            sizes="100vw"
          />
          {/* Dark Overlay for Text Readability - Strong enough for contrast */}
          <div className="absolute inset-0 bg-black/60 z-0" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 container mx-auto px-4 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto"
          >
            <div className="flex items-center justify-center gap-4 mb-6 flex-nowrap">
              <div className="relative h-16 w-16 md:h-20 md:w-20 flex-shrink-0">
                <div
                  className="h-full w-full"
                  style={{
                    backgroundColor: 'hsl(37 27% 70%)',
                    maskImage: 'url(/images/Kudu.png)',
                    maskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskImage: 'url(/images/Kudu.png)',
                    WebkitMaskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                  }}
                />
              </div>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-barletta text-[hsl(37,27%,70%)] whitespace-nowrap">
                Wildlife Exchange
              </h1>
            </div>
            <p className="text-xl md:text-2xl mb-8 text-white/90 font-medium">
              Texas Exotic & Breeder Animal Marketplace
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="min-h-[56px] min-w-[220px] text-lg font-semibold">
                <Link href="/browse">
                  Browse Listings
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-[56px] min-w-[220px] text-lg font-semibold bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm">
                <Link href="/dashboard/listings/new">
                  List an Animal
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-8 md:py-12 border-b border-border/50 bg-card/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { icon: Shield, text: 'Verified Sellers', color: 'text-primary' },
              { icon: TrendingUp, text: 'Market Insights', color: 'text-primary' },
              { icon: Users, text: 'Trusted Community', color: 'text-primary' },
              { icon: Gavel, text: 'Secure Auctions', color: 'text-primary' },
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.1 }}
                className="flex flex-col items-center text-center"
              >
                <item.icon className={`h-8 w-8 md:h-10 md:w-10 mb-2 ${item.color}`} />
                <span className="text-sm md:text-base font-medium text-foreground">{item.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      {!loading && featuredListings.length > 0 && (
        <section className="py-12 md:py-16 bg-background">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-2" style={{ fontFamily: 'var(--font-founders), sans-serif' }}>
                Featured Listings
              </h2>
              <p className="text-muted-foreground text-base md:text-lg">
                Hand-picked listings with high visibility. New inventory added daily.
              </p>
            </motion.div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8"
            >
              <AnimatePresence>
                {featuredListings.map((listing) => (
                  <FeaturedListingCard key={listing.id} listing={listing} />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        </section>
      )}

      {/* Recent Listings */}
      <section className="py-12 md:py-16 bg-background border-t border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2" style={{ fontFamily: 'var(--font-founders), sans-serif' }}>
                Recent Listings
              </h2>
              <p className="text-muted-foreground text-base md:text-lg">
                Latest additions to the marketplace
              </p>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 border border-border rounded-lg p-1 bg-card">
              <Button
                variant={viewMode === 'card' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('card')}
                className="h-8 px-3"
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Cards
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('list')}
                className="h-8 px-3"
              >
                <List className="h-4 w-4 mr-2" />
                List
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-muted-foreground">Loading listings...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="text-center py-12">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          )}

          {/* Listings Grid/List */}
          {!loading && !error && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className={cn(
                viewMode === 'card'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8'
                  : 'space-y-4'
              )}
            >
              <AnimatePresence>
                {recentListings.length > 0 ? (
                  recentListings.map((listing) =>
                    viewMode === 'card' ? (
                      <ListingCard key={listing.id} listing={listing} />
                    ) : (
                      <ListItem key={listing.id} listing={listing} />
                    )
                  )
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-muted-foreground">No listings available yet.</p>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 bg-primary/5 border-t border-border/50">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Zap className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ fontFamily: 'var(--font-founders), sans-serif' }}>
              Ready to Buy or Sell?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
              Join Texas's premier marketplace for exotic animals and breeder stock. List your animals today or browse our curated selection.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="min-h-[56px] min-w-[220px] text-lg font-semibold">
                <Link href="/browse">
                  Browse Listings
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-[56px] min-w-[220px] text-lg font-semibold">
                <Link href="/dashboard/listings/new">
                  Create Listing
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
