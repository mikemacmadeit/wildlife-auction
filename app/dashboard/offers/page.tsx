'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Handshake, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getMyOffers } from '@/lib/offers/api';
import { subscribeToUnreadCountByTypes, markNotificationsAsReadByTypes } from '@/lib/firebase/notifications';
import type { NotificationType } from '@/lib/types';
import { BuyerOfferDetailModal } from '@/components/offers/BuyerOfferDetailModal';
import { cn } from '@/lib/utils';
import Image from 'next/image';

type OfferRow = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string };
  listingImageUrl?: string;
  status: string;
  currentAmount: number;
  acceptedAmount?: number;
  lastActorRole?: 'buyer' | 'seller' | 'system';
  expiresAt?: number | null;
};

function formatTimeLeft(expiresAtMs?: number | null): string {
  if (!expiresAtMs) return '—';
  const diff = expiresAtMs - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / (60 * 1000));
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ${hrs % 24}h`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function MyOffersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [unreadOfferActivity, setUnreadOfferActivity] = useState<number>(0);

  const [tab, setTab] = useState<'open' | 'countered' | 'accepted' | 'declined' | 'expired'>('open');
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await getMyOffers({ status: tab, limit: 100 });
      setOffers((res?.offers || []) as OfferRow[]);
    } catch (e: any) {
      toast({ title: 'Failed to load offers', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [tab, toast, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    load();
  }, [authLoading, load, user]);

  // Lightweight "new activity" indicator powered by notifications (received/countered/accepted/declined/expired).
  useEffect(() => {
    if (!user?.uid) {
      setUnreadOfferActivity(0);
      return;
    }
    const types: NotificationType[] = ['offer_received', 'offer_countered', 'offer_accepted', 'offer_declined', 'offer_expired'];
    try {
      return subscribeToUnreadCountByTypes(user.uid, types, (count) => setUnreadOfferActivity(count || 0));
    } catch {
      setUnreadOfferActivity(0);
      return;
    }
  }, [user?.uid]);

  // UX: once the user visits this page, clear offer notification badges.
  useEffect(() => {
    if (!user?.uid) return;
    const types: NotificationType[] = ['offer_received', 'offer_countered', 'offer_accepted', 'offer_declined', 'offer_expired'];
    markNotificationsAsReadByTypes(user.uid, types).catch(() => {});
  }, [user?.uid]);

  const emptyCopy = useMemo(() => {
    if (tab === 'open') return 'No open offers right now.';
    if (tab === 'countered') return 'No countered offers right now.';
    if (tab === 'accepted') return 'No accepted offers right now.';
    if (tab === 'declined') return 'No declined offers right now.';
    return 'No expired offers right now.';
  }, [tab]);

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full rounded-xl border border-border/50 bg-card">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">You must be signed in to view your offers.</p>
            <Button asChild className="w-full">
              <Link href="/login">Go to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight">My Offers</h1>
            {unreadOfferActivity > 0 ? (
              <Badge variant="secondary" className="font-semibold">
                {unreadOfferActivity} new
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">Track offers you’ve made and respond to counters.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" className="min-h-[40px]">
            <Link href="/dashboard/bids-offers">Back to Bids &amp; Offers</Link>
          </Button>
          <Button variant="outline" onClick={load} disabled={loading} className="min-h-[40px]">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full sm:w-auto">
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="countered">Countered</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
          <TabsTrigger value="declined">Declined</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="rounded-xl border border-border/50 bg-card">
            <CardContent className="pt-6">
              {loading ? (
                <div className="py-10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : offers.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{emptyCopy}</div>
              ) : (
                <div className="divide-y">
                  {offers.map((o) => (
                    <button
                      key={o.offerId}
                      className={cn(
                        'w-full text-left py-4 hover:bg-muted/30 transition-colors px-2 rounded-lg',
                        (o.status === 'countered' && o.lastActorRole === 'seller') || o.status === 'accepted' ? 'bg-primary/5' : ''
                      )}
                      onClick={() => {
                        setSelectedOfferId(o.offerId);
                        setDetailOpen(true);
                      }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="relative h-12 w-12 overflow-hidden rounded-md border bg-muted/20 shrink-0">
                            {o.listingImageUrl ? <Image src={o.listingImageUrl} alt="" fill className="object-cover" /> : null}
                          </div>
                          <div className="font-semibold truncate">{o.listingSnapshot?.title || 'Listing'}</div>
                          <div className="text-xs text-muted-foreground">Offer #{o.offerId.slice(0, 8)}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                          <Badge variant="secondary" className="text-xs">
                            {o.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            ${Number(o.currentAmount).toLocaleString()}
                          </Badge>
                          <Badge variant="outline" className="text-xs flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimeLeft(o.expiresAt)}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BuyerOfferDetailModal
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedOfferId(null);
        }}
        offerId={selectedOfferId}
        onDidMutate={() => void load()}
      />
    </div>
  );
}

