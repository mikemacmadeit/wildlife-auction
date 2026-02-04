'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Mail, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUBSCRIBED_KEY = 'we_email_capture_subscribed';

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function hasSubscribed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(SUBSCRIBED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function InlineEmailCapture(props: {
  source?: string;
  className?: string;
  title?: string;
  description?: string;
}) {
  const { source = 'field_notes_inline', className, title, description } = props;
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suppressed = useMemo(() => hasSubscribed(), []);
  if (suppressed) return null;

  const submit = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!isEmail(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/marketing/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Could not subscribe right now. Please try again.');
        return;
      }
      try {
        window.localStorage.setItem(SUBSCRIBED_KEY, 'true');
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.warn('[InlineEmailCapture] localStorage setItem failed', e);
      }
      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl sm:rounded-2xl border bg-gradient-to-br from-card via-card to-card/90 p-4 sm:p-5 md:p-6',
        'shadow-xl shadow-primary/5 border-border/60 w-full min-w-0',
        className
      )}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between min-w-0">
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
              {success ? <Sparkles className="h-5 w-5 text-primary" /> : <Mail className="h-5 w-5 text-primary" />}
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-extrabold tracking-tight">
                {title || (success ? 'You’re subscribed.' : 'Get Field Notes in your inbox')}
              </div>
              <div className="text-xs text-muted-foreground">
                {description || (success ? 'Weekly drops, new inventory, and trust-first guidance.' : 'Weekly drops, new ranch inventory, and market insights.')}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Texas-only</Badge>
            <Badge variant="outline">No spam</Badge>
            <Badge variant="outline">Unsubscribe anytime</Badge>
          </div>
        </div>

        {success ? null : (
          <div className="w-full md:max-w-sm space-y-2 min-w-0">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="min-h-[44px] w-full min-w-0"
                disabled={loading}
              />
              <Button onClick={submit} disabled={loading} className="min-h-[44px] px-5 font-semibold w-full sm:w-auto shrink-0">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subscribe'}
              </Button>
            </div>
            {error ? <div className="text-xs text-destructive">{error}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}

