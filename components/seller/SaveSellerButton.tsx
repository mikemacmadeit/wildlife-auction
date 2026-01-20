'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { followSeller, unfollowSeller } from '@/lib/firebase/following';
import { Bookmark } from 'lucide-react';

export function SaveSellerButton(props: {
  sellerId: string | null | undefined;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();

  const sellerId = props.sellerId ? String(props.sellerId) : '';
  const viewerUid = user?.uid || '';

  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const canUse = useMemo(() => Boolean(sellerId && viewerUid && sellerId !== viewerUid), [sellerId, viewerUid]);

  useEffect(() => {
    if (!sellerId || !viewerUid) {
      setSaved(false);
      return;
    }
    if (sellerId === viewerUid) {
      setSaved(false);
      return;
    }

    const ref = doc(db, 'users', viewerUid, 'following', sellerId);
    const unsub = onSnapshot(
      ref,
      (snap) => setSaved(snap.exists()),
      () => setSaved(false)
    );
    return () => unsub();
  }, [sellerId, viewerUid]);

  const onToggle = async () => {
    if (!sellerId) return;
    if (!user) {
      try {
        sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
      } catch {}
      router.push('/login');
      return;
    }
    if (sellerId === user.uid) return;

    setLoading(true);
    const next = !saved;
    setSaved(next); // optimistic
    try {
      if (next) {
        await followSeller(sellerId);
        toast({ title: 'Seller saved', description: 'You’ll find them in Watchlist → Saved sellers.' });
      } else {
        await unfollowSeller(sellerId);
        toast({ title: 'Removed', description: 'Seller removed from your saved sellers.' });
      }
    } catch (e: any) {
      setSaved(!next);
      toast({
        title: 'Action failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Hide for self
  if (!sellerId || (viewerUid && sellerId === viewerUid)) return null;

  return (
    <Button
      type="button"
      variant={saved ? 'secondary' : 'outline'}
      size={props.size || 'sm'}
      className={cn('gap-2 font-semibold', props.className)}
      disabled={loading || (user ? !canUse : false)}
      onClick={onToggle}
    >
      <Bookmark className={cn('h-4 w-4', saved ? 'fill-current' : '')} />
      {saved ? 'Saved' : 'Save Seller'}
    </Button>
  );
}

