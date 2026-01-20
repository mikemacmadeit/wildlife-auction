'use client';

import { useMemo, useState } from 'react';
import { z } from 'zod';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

const Schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Enter a valid email'),
  subject: z.string().trim().min(1, 'Subject is required'),
  message: z.string().trim().min(10, 'Message must be at least 10 characters'),
  listingId: z.string().trim().optional(),
  orderId: z.string().trim().optional(),
});

export function ContactForm() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [sentTicketId, setSentTicketId] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    listingId: '',
    orderId: '',
  });

  const canSubmit = useMemo(() => {
    const parsed = Schema.safeParse(form);
    return parsed.success && !submitting;
  }, [form, submitting]);

  const submit = async () => {
    const parsed = Schema.safeParse(form);
    if (!parsed.success) {
      toast({
        title: 'Check the form',
        description: parsed.error.issues[0]?.message || 'Please fix the highlighted fields.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const token = user ? await user.getIdToken() : null;
      const res = await fetch('/api/support/contact', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...parsed.data,
          listingId: parsed.data.listingId?.trim() ? parsed.data.listingId.trim() : undefined,
          orderId: parsed.data.orderId?.trim() ? parsed.data.orderId.trim() : undefined,
          website: honeypot || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) {
        throw new Error(body?.error || body?.message || 'Failed to submit');
      }
      setSentTicketId(body?.ticketId || null);
      toast({
        title: 'Sent',
        description: 'Your message was sent to support.',
      });
    } catch (e: any) {
      toast({
        title: 'Could not send',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTicketId) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle>Message received</CardTitle>
          <CardDescription>We’ll reply by email as soon as possible.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Reference ID: <span className="font-semibold text-foreground">{sentTicketId}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSentTicketId(null);
              setForm({ name: '', email: '', subject: '', message: '', listingId: '', orderId: '' });
            }}
          >
            Send another message
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle>Send a message</CardTitle>
        <CardDescription>
          For listing/order help, include the Listing ID or Order ID (optional). Do not include sensitive payment info.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Honeypot (hidden) */}
        <div className="hidden">
          <Label htmlFor="website">Website</Label>
          <Input id="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input
              id="contact-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="min-h-[48px]"
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="min-h-[48px]"
              placeholder="you@email.com"
              inputMode="email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-subject">Subject</Label>
          <Input
            id="contact-subject"
            value={form.subject}
            onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
            className="min-h-[48px]"
            placeholder="How can we help?"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contact-listing">Listing ID (optional)</Label>
            <Input
              id="contact-listing"
              value={form.listingId}
              onChange={(e) => setForm((p) => ({ ...p, listingId: e.target.value }))}
              className="min-h-[48px]"
              placeholder="e.g., abc123"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-order">Order ID (optional)</Label>
            <Input
              id="contact-order"
              value={form.orderId}
              onChange={(e) => setForm((p) => ({ ...p, orderId: e.target.value }))}
              className="min-h-[48px]"
              placeholder="e.g., order_abc123"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-message">Message</Label>
          <Textarea
            id="contact-message"
            value={form.message}
            onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
            placeholder="Tell us what happened and what you need."
            className="min-h-[160px]"
          />
        </div>

        <Button type="button" className="w-full min-h-[48px] font-semibold" disabled={!canSubmit} onClick={submit}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

