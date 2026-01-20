'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Shield, TrendingUp, Users, ArrowRight, Gavel, Zap, LayoutGrid, List, FileCheck, BookOpen } from 'lucide-react';
import { FeaturedListingCard } from '@/components/listings/FeaturedListingCard';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';
import { ListingCard } from '@/components/listings/ListingCard';
import { ListItem } from '@/components/listings/ListItem';
import { listActiveListings, listEndingSoonAuctions, listMostWatchedListings } from '@/lib/firebase/listings';
import { Listing } from '@/lib/types';
import { cn } from '@/lib/utils';

type ViewMode = 'card' | 'list';

export default function HomePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [mostWatched, setMostWatched] = useState<Listing[]>([]);
  const [endingSoon, setEndingSoon] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fieldNotesLoading, setFieldNotesLoading] = useState(true);
  const [fieldNotesFeatured, setFieldNotesFeatured] = useState<any | null>(null);
  const [fieldNotesPicks, setFieldNotesPicks] = useState<any[]>([]);

  // View mode with localStorage persistence
  // Initialize to 'card' to ensure server/client consistency
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  // Load from localStorage after hydration (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('home-view-mode');
      if (saved === 'card' || saved === 'list') {
        setViewMode(saved);
      }
    }
  }, []);

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
        const results = await Promise.allSettled([
          listActiveListings({ limitCount: 12 }),
          listMostWatchedListings({ limitCount: 8 }),
          listEndingSoonAuctions({ limitCount: 8 }),
        ]);

        const [dataRes, mwRes, esRes] = results;

        if (dataRes.status === 'fulfilled') setListings(dataRes.value);
        if (mwRes.status === 'fulfilled') {
          // Hide the section unless there is actual watch activity.
          const filtered = (mwRes.value || []).filter((l: any) => {
            const watchers = typeof l?.watcherCount === 'number' ? l.watcherCount : Number(l?.metrics?.favorites || 0);
            return watchers > 0;
          });
          setMostWatched(filtered);
        }
        if (esRes.status === 'fulfilled') setEndingSoon(esRes.value);

        // Only surface an error if the *primary* listings query failed.
        if (dataRes.status === 'rejected') {
          const err = dataRes.reason;
          console.error('Error fetching listings:', err);
          setError(err instanceof Error ? err.message : 'Failed to load listings');
        } else {
          // Non-blocking: log secondary section failures but keep page usable.
          if (mwRes.status === 'rejected') console.warn('Most watched unavailable:', mwRes.reason);
          if (esRes.status === 'rejected') console.warn('Ending soon unavailable:', esRes.reason);
        }
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load listings');
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, []);

  // Fetch Field Notes (Featured + Editor picks) from server (client page cannot read filesystem)
  useEffect(() => {
    let cancelled = false;
    async function fetchFieldNotes() {
      try {
        setFieldNotesLoading(true);
        const res = await fetch('/api/field-notes/index');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to load Field Notes');
        if (cancelled) return;
        setFieldNotesFeatured(data.featured || null);
        setFieldNotesPicks(Array.isArray(data.editorPicks) ? data.editorPicks : []);
      } catch {
        if (!cancelled) {
          setFieldNotesFeatured(null);
          setFieldNotesPicks([]);
        }
      } finally {
        if (!cancelled) setFieldNotesLoading(false);
      }
    }
    fetchFieldNotes();
    return () => {
      cancelled = true;
    };
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
            className="object-cover object-[50%_20%]"
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
            <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4 sm:mb-6 flex-wrap sm:flex-nowrap px-4">
              <div className="hidden md:block relative h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 flex-shrink-0">
                <div className="h-full w-full mask-kudu bg-[hsl(37_27%_70%)]" />
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold font-barletta text-[hsl(37,27%,70%)] whitespace-nowrap">
                Wildlife Exchange
              </h1>
            </div>
            <p className="text-lg sm:text-xl md:text-2xl mb-6 sm:mb-8 text-white/90 font-medium px-4">
              Wildlife-first marketplace for Texas livestock, horses &amp; ranch assets
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
              <Button asChild size="lg" className="min-h-[48px] sm:min-h-[56px] w-full sm:min-w-[220px] text-base sm:text-lg font-semibold">
                <Link href="/browse">
                  Browse Listings
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <CreateListingGateButton
                href="/dashboard/listings/new?fresh=1"
                variant="outline"
                size="lg"
                className="min-h-[48px] sm:min-h-[56px] w-full sm:min-w-[220px] text-base sm:text-lg font-semibold bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
              >
                Create listing
              </CreateListingGateButton>
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
              { icon: FileCheck, text: 'TPWD Compliant', color: 'text-primary' },
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

      {/* Category Tiles */}
      <section className="py-12 md:py-16 bg-background border-b border-border/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">
              Browse by Category
            </h2>
            <p className="text-muted-foreground text-base md:text-lg">
              Explore our marketplace by category
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {/* Whitetail Breeder - First priority */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Link href="/browse?category=whitetail_breeder">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-whitetail-breeder flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Whitetail Breeder</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                      TPWD-permitted breeder deer with verified genetics and health records
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Wildlife & Exotics */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Link href="/browse?category=wildlife_exotics">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-fallow flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Wildlife &amp; Exotics</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Axis deer, blackbuck, fallow deer, and other exotic species
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Cattle & Livestock */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Link href="/browse?category=cattle_livestock">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-bull flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Cattle &amp; Livestock</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Cattle, bulls, cows, heifers, and registered livestock
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Ranch Equipment & Attachments */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Link href="/browse?category=ranch_equipment">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-tractor flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Ranch Equipment &amp; Attachments</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Tractors, skid steers, machinery, and attachments/implements (vehicles &amp; trailers listed separately)
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Ranch Vehicles & Trailers */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <Link href="/browse?category=ranch_vehicles">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-top-drive flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Ranch Vehicles &amp; Trailers</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Trucks, UTVs/ATVs, and trailers (stock, gooseneck, flatbed, utility)
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Horse & Equestrian */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Link href="/browse?category=horse_equestrian">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div
                        className="w-16 h-16 flex-shrink-0"
                        style={{
                          WebkitMaskImage: `url('/images/Horse.png')`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                          maskImage: `url('/images/Horse.png')`,
                          maskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          backgroundColor: 'hsl(var(--primary))',
                        }}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Horse &amp; Equestrian</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Horses, tack, and equestrian listings with required transfer paperwork
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Sporting & Working Dogs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <Link href="/browse?category=sporting_working_dogs">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-dog flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Sporting &amp; Working Dogs</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Bird dogs, hog dogs, tracking dogs, and other working/sporting dogs
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Hunting & Outfitter Assets */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Link href="/browse?category=hunting_outfitter_assets">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-hunting-blind flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Hunting &amp; Outfitter Assets</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Camera systems, blinds, and water/well systems
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
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
              <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">
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

      {/* Most Watched */}
      {!loading && mostWatched.length > 0 && (
        <section className="py-12 md:py-16 bg-background border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">Most Watched</h2>
                <p className="text-muted-foreground text-base md:text-lg">Social proof that drives liquidity.</p>
              </div>
              <Button variant="outline" asChild>
                <Link href="/browse">Browse</Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mostWatched.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Ending Soon */}
      {!loading && endingSoon.length > 0 && (
        <section className="py-12 md:py-16 bg-background border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">Ending Soon</h2>
                <p className="text-muted-foreground text-base md:text-lg">Auctions closing soon—act now.</p>
              </div>
              <Button variant="outline" asChild>
                <Link href="/browse">View all</Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {endingSoon.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Listings */}
      <section className="py-12 md:py-16 bg-background border-t border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">
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

      {/* Field Notes (Featured + Editor Picks) */}
      <section className="py-12 md:py-16 border-t border-border/50 bg-card/30">
        <div className="container mx-auto px-4 space-y-8">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                Field Notes
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight font-founders">
                Trust-first education for high-ticket deals
              </h2>
              <p className="text-muted-foreground max-w-2xl">
                Guides on payments, compliance, transport, and how to buy/sell with confidence.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-[44px]">
              <Link href="/field-notes">
                View all <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {fieldNotesLoading ? (
            <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
              Loading Field Notes…
            </div>
          ) : !fieldNotesFeatured ? (
            <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
              Field Notes is coming alive—check back soon.
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <Link href={`/field-notes/${fieldNotesFeatured.slug}`} className="group">
                <Card className="h-full border-2 overflow-hidden hover:border-primary/40 transition-colors">
                  <CardContent className="p-0">
                    <div className="relative h-56 sm:h-72 bg-muted">
                      {fieldNotesFeatured.coverImage ? (
                        <Image src={fieldNotesFeatured.coverImage} alt="" fill className="object-cover transition-transform group-hover:scale-[1.02]" />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white">
                            Featured
                          </span>
                          {fieldNotesFeatured.category ? (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white">
                              {fieldNotesFeatured.category}
                            </span>
                          ) : null}
                          <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white">
                            {fieldNotesFeatured.readingMinutes} min
                          </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                          {fieldNotesFeatured.title}
                        </div>
                        <div className="text-sm text-white/80 mt-1 line-clamp-2">
                          {fieldNotesFeatured.description}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <div className="space-y-3">
                <div className="text-sm font-extrabold tracking-tight">Editor picks</div>
                <div className="space-y-3">
                  {fieldNotesPicks.slice(0, 3).map((p) => (
                    <Link key={p.slug} href={`/field-notes/${p.slug}`} className="group block">
                      <Card className="border-2 hover:border-primary/40 transition-colors">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {p.category ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/15 text-primary">
                                {p.category}
                              </span>
                            ) : null}
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-muted/20">
                              {p.readingMinutes} min
                            </span>
                          </div>
                          <div className="font-extrabold tracking-tight leading-snug group-hover:underline underline-offset-4">
                            {p.title}
                          </div>
                          <div className="text-sm text-muted-foreground line-clamp-2">{p.description}</div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>

                <div className="pt-1 text-sm">
                  <Link href="/field-notes/tags" className="font-semibold text-primary hover:underline underline-offset-4">
                    Browse by tags →
                  </Link>
                  <span className="text-muted-foreground"> · </span>
                  <Link href="/field-notes/authors" className="font-semibold text-primary hover:underline underline-offset-4">
                    Browse by authors →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 border-t border-border/50 bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm"
          >
            {/* Decorative glows */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
            </div>

            <div className="relative p-6 sm:p-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/15 mb-5">
                <Zap className="h-7 w-7 text-primary" />
              </div>

              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3 font-founders">
                Ready to buy or sell?
              </h2>
              <p className="text-muted-foreground text-lg mb-6 max-w-2xl mx-auto">
                List whitetail breeder stock, Texas exotics, cattle, and ranch equipment—built for trust and compliance.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
                <span className="text-xs px-3 py-1 rounded-full border bg-muted/30">
                  Texas-only for animal transactions
                </span>
                <span className="text-xs px-3 py-1 rounded-full border bg-muted/30">
                  Escrow + payout gating
                </span>
                <span className="text-xs px-3 py-1 rounded-full border bg-muted/30">
                  Equipment can be multi-state
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild size="lg" className="min-h-[56px] min-w-[220px] text-base font-semibold">
                  <Link href="/browse">
                    Browse Listings
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>

                {/* IMPORTANT: Don't wrap CreateListingGateButton in another Button (it already renders a Button). */}
                <CreateListingGateButton
                  href="/dashboard/listings/new?fresh=1"
                  variant="outline"
                  size="lg"
                  className="min-h-[56px] min-w-[220px] text-base font-semibold"
                >
                  Create Listing
                </CreateListingGateButton>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
