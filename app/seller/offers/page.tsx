'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Handshake, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSellerOffers } from '@/lib/offers/api';
import { SellerOfferDetailModal } from '@/components/offers/SellerOfferDetailModal';
import { subscribeToUnreadCountByTypes, markNotificationsAsReadByTypes } from '@/lib/firebase/notifications';
import type { NotificationType } from '@/lib/types';
import Image from 'next/image';

type OfferRow = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string };
  listingImageUrl?: string;
  status: string;
  currentAmount: number;
  expiresAt?: number | null;
  updatedAt?: number | null;
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

export default function SellerOffersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [unreadOfferActivity, setUnreadOfferActivity] = useState<number>(0);

  const [tab, setTab] = useState<'open' | 'countered' | 'accepted' | 'declined' | 'expired'>('open');
  const [tabFading, setTabFading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load all offers so tab counts can be shown without extra requests.
      const res = await getSellerOffers({ limit: 250 });
      setOffers((res?.offers || []) as OfferRow[]);
    } catch (e: any) {
      toast({ title: 'Failed to load offers', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    load();
  }, [authLoading, load, user]);

  // "New activity" indicator (offer lifecycle notifications)
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

  // UX: visiting the seller offers inbox clears offer notification badges.
  useEffect(() => {
    if (!user?.uid) return;
    const types: NotificationType[] = ['offer_received', 'offer_countered', 'offer_accepted', 'offer_declined', 'offer_expired'];
    markNotificationsAsReadByTypes(user.uid, types).catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    setTabFading(true);
    const t = setTimeout(() => setTabFading(false), 140);
    return () => clearTimeout(t);
  }, [tab]);

  const counts = useMemo(() => {
    const out: Record<'open' | 'countered' | 'accepted' | 'declined' | 'expired', number> = {
      open: 0,
      countered: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
    };
    for (const o of offers) {
      const s = String((o as any)?.status || '').toLowerCase();
      if (s === 'open') out.open += 1;
      else if (s === 'countered') out.countered += 1;
      else if (s === 'accepted') out.accepted += 1;
      else if (s === 'declined') out.declined += 1;
      else if (s === 'expired') out.expired += 1;
    }
    return out;
  }, [offers]);

  const visibleOffers = useMemo(() => {
    return offers.filter((o) => String(o.status || '').toLowerCase() === tab);
  }, [offers, tab]);

  const emptyCopy = useMemo(() => {
    if (tab === 'open') return 'No open offers right now.';
    if (tab === 'countered') return 'No countered offers right now.';
    if (tab === 'accepted') return 'No accepted offers right now.';
    if (tab === 'declined') return 'No declined offers right now.';
    return 'No expired offers right now.';
  }, [tab]);

  if (authLoading) {
    return (
      <PageLoader title="Loading offers…" subtitle="Getting your offers ready." className="min-h-[60vh]" />
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">You must be signed in to view offers.</p>
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
            <h1 className="text-2xl font-extrabold tracking-tight">Offers</h1>
            {unreadOfferActivity > 0 ? (
              <Badge variant="secondary" className="font-semibold">
                {unreadOfferActivity} new
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">Review and respond to best offers on your listings.</p>
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
          <TabsTrigger value="open" className="gap-2">
            <span>Open</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {counts.open}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="countered" className="gap-2">
            <span>Countered</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {counts.countered}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="accepted" className="gap-2">
            <span>Accepted</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {counts.accepted}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="declined" className="gap-2">
            <span>Declined</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {counts.declined}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="expired" className="gap-2">
            <span>Expired</span>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {counts.expired}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className={`mt-4 transition-opacity duration-150 ${tabFading ? 'opacity-70' : 'opacity-100'}`}>
        <Card className="border-2">
          <CardContent className="pt-6">
            {loading ? (
              <div className="py-10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : visibleOffers.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{emptyCopy}</div>
            ) : (
              <div className="divide-y">
                {visibleOffers.map((o) => (
                  <button
                    key={o.offerId}
                    className="w-full text-left py-4 hover:bg-muted/30 transition-colors px-2 rounded-lg"
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
                        <div className="text-xs text-muted-foreground">
                          Buyer: <span className="font-medium">Verified Buyer</span> · Offer #{o.offerId.slice(0, 8)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
      </div>

      <SellerOfferDetailModal
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setSelectedOfferId(null);
        }}
        offerId={selectedOfferId}
      />
    </div>
  );
}

