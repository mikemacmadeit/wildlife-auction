'use client';

import { useState, useCallback, useMemo } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Send, CheckCircle2, AlertCircle } from 'lucide-react';

export function HelpTicketForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Auto-detect context from URL
  const autoContext = useMemo(() => {
    const listingId = searchParams?.get('listingId') || (pathname?.match(/\/listing\/([^/]+)/)?.[1]);
    const orderId = searchParams?.get('orderId') || (pathname?.match(/\/orders\/([^/]+)/)?.[1]);
    return {
      pathname: pathname || '',
      listingId: listingId || undefined,
      orderId: orderId || undefined,
    };
  }, [pathname, searchParams]);

  const [category, setCategory] = useState<string>('other');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [listingId, setListingId] = useState(autoContext.listingId || '');
  const [orderId, setOrderId] = useState(autoContext.orderId || '');
  const [submitting, setSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return !!user && subject.trim().length > 0 && message.trim().length >= 10 && !submitting;
  }, [user, subject, message, submitting]);

  const submitTicket = useCallback(async () => {
    if (!user || !canSubmit) return;

    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          category: category || 'other',
          listingId: listingId.trim() || undefined,
          orderId: orderId.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) {
        throw new Error(body?.error || body?.message || 'Failed to create ticket');
      }

      setTicketId(body.ticketId || null);
      toast({
        title: 'Ticket Created',
        description: 'Your support ticket has been created. We'll respond by email soon.',
      });

      // Reset form
      setSubject('');
      setMessage('');
      setListingId(autoContext.listingId || '');
      setOrderId(autoContext.orderId || '');
      setCategory('other');
    } catch (e: any) {
      toast({
        title: 'Failed to Create Ticket',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }, [user, canSubmit, subject, message, category, listingId, orderId, autoContext, toast]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-6">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold">Sign In Required</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Please sign in to create a support ticket.
          </p>
        </div>
        <Button onClick={() => router.push('/login')} className="mt-4">
          Sign In
        </Button>
      </div>
    );
  }

  if (ticketId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-6">
        <CheckCircle2 className="h-12 w-12 text-green-600" />
        <div>
          <h3 className="text-lg font-semibold">Ticket Created Successfully</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your ticket ID: <span className="font-mono font-semibold">{ticketId}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            We'll respond by email. You can also view your tickets in the Support section.
          </p>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={() => router.push('/dashboard/support')}>
            View My Tickets
          </Button>
          <Button onClick={() => setTicketId(null)}>
            Create Another Ticket
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Contact Support</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Create a support ticket and we'll get back to you as soon as possible.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ticket-category">Issue Type</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="ticket-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="orders">Orders</SelectItem>
              <SelectItem value="payments">Payments</SelectItem>
              <SelectItem value="listings">Listings</SelectItem>
              <SelectItem value="offers">Offers</SelectItem>
              <SelectItem value="messages">Messages</SelectItem>
              <SelectItem value="compliance">Compliance</SelectItem>
              <SelectItem value="technical">Technical Issue</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-subject">Subject</Label>
          <Input
            id="ticket-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief description of your issue"
            className="min-h-[48px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-message">Message</Label>
          <Textarea
            id="ticket-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your issue in detail..."
            className="min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground">Minimum 10 characters required.</p>
        </div>

        {(autoContext.listingId || autoContext.orderId) && (
          <Card className="border-2 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Auto-detected Context</CardTitle>
              <CardDescription className="text-xs">
                We've automatically detected context from the current page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {autoContext.pathname && (
                <div>
                  <span className="font-semibold">Page:</span> {autoContext.pathname}
                </div>
              )}
              {autoContext.listingId && (
                <div>
                  <span className="font-semibold">Listing ID:</span> {autoContext.listingId}
                </div>
              )}
              {autoContext.orderId && (
                <div>
                  <span className="font-semibold">Order ID:</span> {autoContext.orderId}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ticket-listing">Listing ID (optional)</Label>
            <Input
              id="ticket-listing"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              placeholder="e.g., abc123"
              className="min-h-[48px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ticket-order">Order ID (optional)</Label>
            <Input
              id="ticket-order"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="e.g., order_abc123"
              className="min-h-[48px]"
            />
          </div>
        </div>

        <Button
          onClick={submitTicket}
          disabled={!canSubmit}
          className="w-full min-h-[48px] font-semibold"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating Ticket...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Create Support Ticket
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          By submitting, you agree that we may contact you via email regarding this issue.
        </p>
      </div>
    </div>
  );
}
