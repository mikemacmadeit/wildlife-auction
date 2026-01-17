'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { setAutoBidServer, disableAutoBidServer } from '@/lib/api/autoBid';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Gavel, Shield, Zap } from 'lucide-react';

type AutoBidDoc = {
  userId: string;
  maxBidCents: number;
  enabled: boolean;
  createdAt?: any;
  updatedAt?: any;
};

function centsToUsd(cents: number): number {
  return Math.round(cents) / 100;
}

function usdToCents(usd: number): number {
  return Math.max(0, Math.round(usd * 100));
}

export function AutoBidPanel(props: {
  auctionId: string;
  currentBidUsd: number;
  currentHighBidderId?: string | null;
  className?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [docState, setDocState] = useState<AutoBidDoc | null>(null);
  const [maxUsd, setMaxUsd] = useState<string>('');

  const isWinning = Boolean(user?.uid && props.currentHighBidderId && user.uid === props.currentHighBidderId);

  useEffect(() => {
    if (!user?.uid) {
      setDocState(null);
      return;
    }
    const ref = doc(db, 'listings', props.auctionId, 'autoBids', user.uid);
    return onSnapshot(
      ref,
      (snap) => {
        setDocState(snap.exists() ? (snap.data() as AutoBidDoc) : null);
      },
      () => {
        setDocState(null);
      }
    );
  }, [user?.uid, props.auctionId]);

  useEffect(() => {
    if (!docState?.maxBidCents) return;
    setMaxUsd(String(centsToUsd(docState.maxBidCents)));
  }, [docState?.maxBidCents]);

  const hasEnabled = Boolean(docState?.enabled);
  const currentMaxUsd = docState?.maxBidCents ? centsToUsd(docState.maxBidCents) : null;

  const ctaLabel = useMemo(() => {
    if (!user) return 'Sign in to enable Auto‑Bid';
    if (!hasEnabled) return 'Enable Auto‑Bid';
    return 'Update Max';
  }, [user, hasEnabled]);

  async function onEnableOrUpdate() {
    if (!user?.uid) {
      toast({ title: 'Sign in required', description: 'Please sign in to enable Auto‑Bid.', variant: 'destructive' });
      return;
    }
    const parsed = Number(maxUsd);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: 'Invalid max bid', description: 'Enter a valid dollar amount.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const res = await setAutoBidServer({ auctionId: props.auctionId, maxBidCents: usdToCents(parsed) });
      if (!res.ok) throw new Error(res.error);
      toast({
        title: 'Auto‑Bid updated',
        description: `We’ll bid the minimum to keep you winning up to $${parsed.toLocaleString()}.`,
      });
    } catch (e: any) {
      toast({ title: 'Auto‑Bid failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function onDisable() {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const res = await disableAutoBidServer({ auctionId: props.auctionId });
      if (!res.ok) throw new Error(res.error);
      toast({ title: 'Auto‑Bid disabled' });
    } catch (e: any) {
      toast({ title: 'Disable failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={cn('border-2 border-border/60 bg-card', props.className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Auto‑Bid (Proxy Bidding)
          </span>
          {user?.uid ? (
            <Badge variant={isWinning ? 'default' : 'secondary'} className="font-semibold">
              {isWinning ? 'Winning' : 'Watching'}
            </Badge>
          ) : (
            <Badge variant="secondary" className="font-semibold">
              Signed out
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          We’ll bid the minimum to keep you winning up to your max. Your max isn’t shown publicly.
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Current price</span>
          <span className="font-semibold">${Number(props.currentBidUsd || 0).toLocaleString()}</span>
        </div>

        {currentMaxUsd != null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Your max</span>
            <span className="font-semibold">${currentMaxUsd.toLocaleString()}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor={`autobid-max-${props.auctionId}`} className="text-sm font-semibold">
            Set your max bid
          </Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                id={`autobid-max-${props.auctionId}`}
                inputMode="decimal"
                type="number"
                value={maxUsd}
                onChange={(e) => setMaxUsd(e.target.value)}
                placeholder="0.00"
                className="h-11"
                disabled={!user || loading}
              />
            </div>
            <Button onClick={onEnableOrUpdate} disabled={!user || loading} className="h-11">
              <Gavel className="h-4 w-4 mr-2" />
              {ctaLabel}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />
            Best-effort alerts: outbid / ending soon / winning.
          </div>
          <Button variant="outline" size="sm" onClick={onDisable} disabled={!user || loading || !hasEnabled}>
            Disable
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

