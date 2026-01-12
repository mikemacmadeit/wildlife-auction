'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Package, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ListingCard } from '@/components/listings/ListingCard';
import { Listing } from '@/lib/types';
import { cn } from '@/lib/utils';

interface RelatedListingsProps {
  currentListing: Listing;
  allListings: Listing[];
  maxItems?: number;
  className?: string;
}

export function RelatedListings({ 
  currentListing, 
  allListings, 
  maxItems = 4,
  className 
}: RelatedListingsProps) {
  // Find related listings (same category, different listing, excluding current)
  // TODO: Use sellerId comparison when RelatedListings is re-implemented with Firestore in Phase 2
  const related = allListings
    .filter(l => 
      l.id !== currentListing.id && 
      l.category === currentListing.category
    )
    .slice(0, maxItems);

  if (related.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className={cn('space-y-4', className)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-extrabold text-foreground">
            Related Listings
          </h2>
        </div>
        <Badge variant="secondary" className="font-semibold">
          {related.length} available
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {related.map((listing, index) => (
          <ListingCard 
            key={listing.id} 
            listing={listing}
          />
        ))}
      </div>

      {/* View More Link */}
      <div className="text-center pt-4">
        <Link 
          href={`/browse?category=${currentListing.category}`}
          className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
        >
          View all {currentListing.category} listings
          <Sparkles className="h-4 w-4" />
        </Link>
      </div>
    </motion.div>
  );
}
