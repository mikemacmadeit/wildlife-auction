'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, User, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Bid } from '@/lib/types';
import { subscribeBidsForListing } from '@/lib/firebase/bids';

interface BidHistoryProps {
  listingId: string;
  currentBid?: number;
  startingBid?: number;
  className?: string;
}

export function BidHistory({ listingId, currentBid, startingBid, className }: BidHistoryProps) {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);

  const toDateSafe = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) return d;
      } catch {
        // ignore
      }
    }
    if (typeof value?.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
  };

  // Subscribe to real-time bids
  useEffect(() => {
    if (!listingId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeBidsForListing(listingId, (newBids) => {
      setBids(newBids);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [listingId]);

  // Loading state
  if (loading) {
    return (
      <Card className={cn('border-border/50', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Bid History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
            <p className="text-sm">Loading bid history...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (bids.length === 0) {
    return (
      <Card className={cn('border-border/50', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Bid History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <p className="font-semibold mb-2">No bids yet</p>
            <p className="text-sm">
              Starting bid: <span className="font-bold text-foreground">${(startingBid || 0).toLocaleString()}</span>
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort bids by amount (highest first)
  const sortedBids = [...bids].sort((a, b) => b.amount - a.amount);

  return (
    <Card className={cn('border-border/50', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Bid History
          </div>
          <Badge variant="secondary" className="font-semibold">
            {bids.length} bid{bids.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedBids.map((bid, index) => {
          const isHighestBid = index === 0 && bid.amount === currentBid;
          const bidDate = toDateSafe((bid as any).timestamp);
          const isRecent = bidDate ? Date.now() - bidDate.getTime() < 10 * 60 * 1000 : false; // Within last 10 minutes

          return (
            <motion.div
              key={bid.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border transition-all',
                isHighestBid && 'border-primary bg-primary/5 shadow-warm',
                !isHighestBid && 'border-border/50 bg-card/50',
                isRecent && !isHighestBid && 'border-accent/50 bg-accent/5'
              )}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 flex-shrink-0',
                  isHighestBid && 'bg-primary/10 border-primary/30',
                  !isHighestBid && 'bg-muted border-border/50'
                )}>
                  <User className={cn(
                    'h-5 w-5',
                    isHighestBid && 'text-primary',
                    !isHighestBid && 'text-muted-foreground'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'font-bold text-base',
                      isHighestBid && 'text-primary'
                    )}>
                      {bid.bidderName}
                    </span>
                    {isHighestBid && (
                      <Badge variant="default" className="text-xs">
                        Highest Bid
                      </Badge>
                    )}
                    {isRecent && !isHighestBid && (
                      <Badge variant="outline" className="text-xs border-accent/50 text-accent">
                        Recent
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Clock className="h-3 w-3" />
                    <span>{bidDate ? formatDistanceToNow(bidDate, { addSuffix: true }) : '—'}</span>
                  </div>
                </div>
              </div>
              <div className={cn(
                'text-xl font-extrabold ml-4 flex-shrink-0',
                isHighestBid && 'text-primary',
                !isHighestBid && 'text-foreground'
              )}>
                ${bid.amount.toLocaleString()}
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
