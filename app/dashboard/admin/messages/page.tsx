'use client';

import { useState, useEffect } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Flag, AlertTriangle, MessageSquare, Search } from 'lucide-react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MessageThread } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

export default function AdminMessagesPage() {
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

  const { isAdmin, loading: adminLoading } = useAdmin();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      loadFlaggedThreads();
    }
  }, [adminLoading, isAdmin]);

  const loadFlaggedThreads = async () => {
    try {
      setLoading(true);
      const threadsRef = collection(db, 'messageThreads');
      const flaggedQuery = query(
        threadsRef,
        where('flagged', '==', true),
        orderBy('updatedAt', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(flaggedQuery);
      const flaggedThreads = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: toDateSafe(data.createdAt) || new Date(),
          updatedAt: toDateSafe(data.updatedAt) || new Date(),
          lastMessageAt: toDateSafe(data.lastMessageAt),
        } as MessageThread;
      });

      setThreads(flaggedThreads);
    } catch (error) {
      console.error('Error loading flagged threads:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredThreads = threads.filter((thread) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      thread.id.toLowerCase().includes(query) ||
      thread.listingId.toLowerCase().includes(query) ||
      thread.buyerId.toLowerCase().includes(query) ||
      thread.sellerId.toLowerCase().includes(query)
    );
  });

  if (adminLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-sm text-muted-foreground">Admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
            Flagged Messages
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Review threads flagged for policy violations
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by thread ID, listing ID, or user ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {filteredThreads.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No flagged threads</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No threads match your search' : 'All clear!'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredThreads.map((thread) => (
              <Card key={thread.id} className="border-2 border-orange-200">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Flag className="h-5 w-5 text-orange-600" />
                        Thread {thread.id.slice(-8)}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Listing: {thread.listingId}
                      </p>
                    </div>
                    <Badge variant="destructive">
                      {thread.violationCount || 0} violations
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Buyer</p>
                      <p className="font-medium">{thread.buyerId}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Seller</p>
                      <p className="font-medium">{thread.sellerId}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Message</p>
                      <p className="font-medium">
                        {thread.lastMessageAt
                          ? formatDistanceToNow(toDateSafe(thread.lastMessageAt) || new Date(), { addSuffix: true })
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Updated</p>
                      <p className="font-medium">
                        {formatDistanceToNow(toDateSafe(thread.updatedAt) || new Date(), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {thread.lastMessagePreview && (
                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Last Message Preview</p>
                      <p className="text-sm">{thread.lastMessagePreview}</p>
                    </div>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/listing/${thread.listingId}`} target="_blank">
                        View Listing
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => loadFlaggedThreads()}>
                      Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
