'use client';

import { motion } from 'framer-motion';
import { Clock, TrendingUp, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Bid } from '@/lib/types';

interface BidHistoryProps {
  bids?: Bid[];
  currentBid?: number;
  startingBid?: number;
  className?: string;
}

// Mock bid data - in real app, this would come from props or API
const mockBids: Bid[] = [
  {
    id: '1',
    listingId: '1',
    amount: 12500,
    bidderName: 'Ranch Co. Texas',
    timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
  },
  {
    id: '2',
    listingId: '1',
    amount: 12000,
    bidderName: 'Wildlife Pro',
    timestamp: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
  },
  {
    id: '3',
    listingId: '1',
    amount: 11500,
    bidderName: 'Breeder Select',
    timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
  },
  {
    id: '4',
    listingId: '1',
    amount: 11000,
    bidderName: 'Texas Exotics',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  },
];

export function BidHistory({ bids = mockBids, currentBid, startingBid, className }: BidHistoryProps) {
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
          const isRecent = Date.now() - bid.timestamp.getTime() < 10 * 60 * 1000; // Within last 10 minutes

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
                    <span>{formatDistanceToNow(bid.timestamp, { addSuffix: true })}</span>
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
