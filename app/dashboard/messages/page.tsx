'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { MessageThreadComponent } from '@/components/messaging/MessageThread';
import { getOrCreateThread, getUserThreads } from '@/lib/firebase/messages';
import { getListingById } from '@/lib/firebase/listings';
import { getUserProfile } from '@/lib/firebase/users';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MessageThread, Listing } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingIdParam = searchParams.get('listingId');
  const sellerIdParam = searchParams.get('sellerId');

  const [thread, setThread] = useState<MessageThread | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [otherPartyName, setOtherPartyName] = useState('Seller');
  const [orderStatus, setOrderStatus] = useState<'pending' | 'paid' | 'completed' | undefined>();
  const [loading, setLoading] = useState(true);

  const initializeThread = useCallback(async () => {
    if (!user || !listingIdParam || !sellerIdParam) return;

    try {
      setLoading(true);

      // Get listing
      const listingData = await getListingById(listingIdParam);
      setListing(listingData);

      // Get or create thread
      const threadId = await getOrCreateThread(listingIdParam, user.uid, sellerIdParam);
      
      // Get thread data
      const threadsRef = collection(db, 'messageThreads');
      const threadQuery = query(threadsRef, where('__name__', '==', threadId));
      const threadSnapshot = await getDocs(threadQuery);
      
      if (!threadSnapshot.empty) {
        const threadData = threadSnapshot.docs[0].data();
        setThread({
          id: threadId,
          ...threadData,
          createdAt: threadData.createdAt?.toDate() || new Date(),
          updatedAt: threadData.updatedAt?.toDate() || new Date(),
          lastMessageAt: threadData.lastMessageAt?.toDate(),
        } as MessageThread);
      }

      // Get other party name
      const otherParty = await getUserProfile(sellerIdParam);
      setOtherPartyName(otherParty?.displayName || otherParty?.email?.split('@')[0] || 'Seller');

      // Check order status
      const ordersRef = collection(db, 'orders');
      const orderQuery = query(
        ordersRef,
        where('listingId', '==', listingIdParam),
        where('buyerId', '==', user.uid)
      );
      const orderSnapshot = await getDocs(orderQuery);
      
      if (!orderSnapshot.empty) {
        const orderData = orderSnapshot.docs[0].data();
        setOrderStatus(orderData.status as 'pending' | 'paid' | 'completed');
      }
    } catch (error: any) {
      console.error('Error initializing thread:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messaging. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [listingIdParam, sellerIdParam, toast, user]);

  useEffect(() => {
    if (!authLoading && user) {
      if (listingIdParam && sellerIdParam) {
        // Create or get thread for this listing
        initializeThread();
      } else {
        setLoading(false);
      }
    }
  }, [authLoading, user, listingIdParam, sellerIdParam, initializeThread]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Sign in required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You must be signed in to send messages
            </p>
            <Button asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!thread || !listing) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No conversation found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {listingIdParam ? 'Failed to load conversation' : 'Select a listing to start messaging'}
              </p>
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
        <div className="mb-4">
          <Button variant="ghost" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Messages</h1>
        </div>

        <Card className="h-[600px] flex flex-col">
          <MessageThreadComponent
            thread={thread}
            listingTitle={listing.title}
            otherPartyName={otherPartyName}
            orderStatus={orderStatus}
          />
        </Card>
      </div>
    </div>
  );
}
