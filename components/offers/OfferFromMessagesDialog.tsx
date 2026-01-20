'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Listing } from '@/lib/types';
import { createOffer } from '@/lib/offers/api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function isOfferableListing(l: any): boolean {
  const status = String(l?.status || '');
  const type = String(l?.type || '');
  if (status !== 'active') return false;
  if (type !== 'fixed' && type !== 'classified') return false;
  const enabled = Boolean(l?.bestOfferSettings?.enabled ?? l?.bestOfferEnabled);
  return enabled === true;
}

export function OfferFromMessagesDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerId: string;
  sellerName?: string;
}) {
  const { open, onOpenChange, sellerId, sellerName } = props;
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    if (!sellerId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Avoid composite-index requirements by querying a broad seller scope, then filtering client-side.
        const snap = await getDocs(query(collection(db, 'listings'), where('sellerId', '==', sellerId), limit(100)));
        const all: Listing[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any;
        const offerable = all.filter(isOfferableListing);
        if (cancelled) return;
        setListings(offerable);
        setSelectedListingId(offerable[0]?.id || '');
      } catch (e: any) {
        if (cancelled) return;
        setListings([]);
        setSelectedListingId('');
        toast({
          title: 'Could not load listings',
          description: e?.message || 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, sellerId, toast]);

  const selected = useMemo(() => listings.find((l) => l.id === selectedListingId) || null, [listings, selectedListingId]);

  const canSubmit = !!selectedListingId && Number(amount) > 0 && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Make an offer</DialogTitle>
          <DialogDescription>
            {sellerName ? (
              <>
                Choose a listing from <strong>{sellerName}</strong> where Best Offer is enabled.
              </>
            ) : (
              <>Choose a listing where Best Offer is enabled.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading listings…
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
            <div className="font-semibold">No offerable listings found</div>
            <div className="text-muted-foreground mt-1">
              This seller doesn’t have any active Fixed Price / Classified listings with Best Offer enabled right now.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Seller store (offerable listings)</div>
              <div className="grid gap-2 max-h-[260px] overflow-auto pr-1">
                {listings.map((l) => {
                  const isSelected = l.id === selectedListingId;
                  const price = typeof (l as any).price === 'number' ? (l as any).price : null;
                  const min = typeof (l as any).bestOfferMinPrice === 'number' ? (l as any).bestOfferMinPrice : (l as any)?.bestOfferSettings?.minPrice;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setSelectedListingId(l.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border/60 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{l.title || 'Listing'}</div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {String(l.type || '').toUpperCase()}
                            </Badge>
                            {typeof price === 'number' ? (
                              <span className="font-medium">${price.toLocaleString()}</span>
                            ) : (
                              <span className="text-muted-foreground">Contact</span>
                            )}
                            {typeof min === 'number' ? (
                              <span className="text-muted-foreground">Min offer ${Number(min).toLocaleString()}</span>
                            ) : null}
                          </div>
                        </div>
                        {isSelected ? <Badge className="bg-primary text-primary-foreground">Selected</Badge> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Offer amount (USD)</div>
                <Input
                  inputMode="decimal"
                  placeholder="e.g. 1500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold">Selected listing</div>
                <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                  <div className="font-semibold truncate">{selected?.title || '—'}</div>
                  <div className="text-xs text-muted-foreground mt-1">ID: {selectedListingId}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">Message (optional)</div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add context for the seller (optional)…"
                className="min-h-[90px]"
                maxLength={500}
              />
              <div className="text-xs text-muted-foreground">{note.length}/500</div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={async () => {
              if (!selectedListingId) return;
              const amt = Number(amount);
              if (!Number.isFinite(amt) || amt <= 0) return;
              try {
                setSubmitting(true);
                const res = await createOffer(selectedListingId, amt, note.trim() ? note.trim() : undefined);
                toast({ title: 'Offer sent', description: 'Your offer has been sent to the seller.' });
                onOpenChange(false);
                const offerId = String((res as any)?.offerId || (res as any)?.id || '');
                if (offerId) router.push(`/dashboard/offers/${encodeURIComponent(offerId)}`);
                else router.push('/dashboard/offers');
              } catch (e: any) {
                toast({
                  title: 'Could not send offer',
                  description: e?.message || 'Please try again.',
                  variant: 'destructive',
                });
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : (
              'Send offer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

