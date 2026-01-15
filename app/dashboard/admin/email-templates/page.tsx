/**
 * Admin: Email Template Preview
 *
 * IMPORTANT:
 * - Preview only (no email sending)
 * - Renders server-side via /api/admin/email-templates/render
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { useDebounce } from '@/hooks/use-debounce';
import { listEmailEvents, getSamplePayload, type EmailEventType } from '@/lib/email';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, RefreshCw, Mail, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type RenderResponseOk = { ok: true; subject: string; preheader: string; html: string };
type RenderResponseErr =
  | { ok: false; error: string; code?: string; message?: string; missing?: string[] }
  | { ok: false; error: string; code: 'INVALID_PAYLOAD'; issues: Array<{ path: (string | number)[]; message: string }> }
  | { ok: false; error: string; code: 'UNKNOWN_EVENT'; validEvents: string[] };

function prettyJson(v: any): string {
  return JSON.stringify(v, null, 2);
}

function safeCopy(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback
  return Promise.reject(new Error('Clipboard API not available'));
}

export default function AdminEmailTemplatesPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const events = useMemo(() => listEmailEvents(), []);
  const defaultEvent = (events[0]?.type || 'order_confirmation') as EmailEventType;

  const [eventType, setEventType] = useState<EmailEventType>(defaultEvent);
  const [payloadText, setPayloadText] = useState<string>(() => prettyJson(getSamplePayload(defaultEvent)));
  const debouncedPayloadText = useDebounce(payloadText, 450);
  const debouncedEventType = useDebounce(eventType, 150);

  const [parseError, setParseError] = useState<string | null>(null);
  const [schemaIssues, setSchemaIssues] = useState<Array<{ path: string; message: string }> | null>(null);
  const [unauthorized, setUnauthorized] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const [subject, setSubject] = useState<string>('');
  const [preheader, setPreheader] = useState<string>('');
  const [html, setHtml] = useState<string>('');

  const selectedMeta = useMemo(() => events.find((e) => e.type === eventType), [events, eventType]);

  const parsePayload = useCallback((txt: string) => {
    try {
      const obj = JSON.parse(txt);
      setParseError(null);
      return obj;
    } catch (e: any) {
      setParseError(e?.message || 'Invalid JSON');
      return null;
    }
  }, []);

  const renderNow = useCallback(
    async (opts?: { showToast?: boolean }) => {
      setUnauthorized(false);
      setSchemaIssues(null);

      const payloadObj = parsePayload(payloadText);
      if (!payloadObj) return;

      if (!user) {
        setUnauthorized(true);
        return;
      }

      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/email-templates/render', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ event: eventType, payload: payloadObj }),
        });

        const data = (await res.json().catch(() => ({}))) as RenderResponseOk | RenderResponseErr;
        if (!res.ok || !data || (data as any).ok !== true) {
          const err = data as RenderResponseErr;
          if (res.status === 403) {
            setUnauthorized(true);
          }
          if ((err as any)?.code === 'INVALID_PAYLOAD' && Array.isArray((err as any).issues)) {
            setSchemaIssues(
              (err as any).issues.map((i: any) => ({
                path: Array.isArray(i.path) ? i.path.join('.') : String(i.path || ''),
                message: i.message || 'Invalid',
              }))
            );
          } else {
            setSchemaIssues([{ path: '', message: (err as any)?.message || (err as any)?.error || 'Render failed' }]);
          }
          return;
        }

        const ok = data as RenderResponseOk;
        setSubject(ok.subject);
        setPreheader(ok.preheader);
        setHtml(ok.html);
        if (opts?.showToast) {
          toast({ title: 'Rendered', description: 'Template rendered successfully.' });
        }
      } catch (e: any) {
        setSchemaIssues([{ path: '', message: e?.message || 'Network error' }]);
      } finally {
        setLoading(false);
      }
    },
    [eventType, parsePayload, payloadText, toast, user]
  );

  // When template changes, reset to sample payload
  useEffect(() => {
    const sample = getSamplePayload(eventType);
    setPayloadText(prettyJson(sample));
    setParseError(null);
    setSchemaIssues(null);
    setSubject('');
    setPreheader('');
    setHtml('');
  }, [eventType]);

  // Auto-render on debounced edits
  useEffect(() => {
    // Skip while admin status is still loading; avoids confusing initial flashes.
    if (adminLoading) return;
    // If not admin, don't auto-render (but still show UI with friendly message).
    if (!isAdmin) return;
    // If JSON invalid, don't hit API.
    const obj = parsePayload(debouncedPayloadText);
    if (!obj) return;
    void renderNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPayloadText, debouncedEventType, adminLoading, isAdmin]);

  const canCopy = html && html.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Email Templates</h1>
            <Badge variant="secondary" className="font-semibold">Preview</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            This does <span className="font-semibold">NOT</span> send email. It only renders templates locally via the server renderer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const sample = getSamplePayload(eventType);
              void safeCopy(prettyJson(sample))
                .then(() => toast({ title: 'Copied', description: 'Sample payload copied.' }))
                .catch(() => toast({ title: 'Copy failed', description: 'Clipboard not available.', variant: 'destructive' }));
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy sample payload
          </Button>
          <Button
            variant="outline"
            disabled={!canCopy}
            onClick={() => {
              void safeCopy(html)
                .then(() => toast({ title: 'Copied', description: 'HTML copied to clipboard.' }))
                .catch(() => toast({ title: 'Copy failed', description: 'Clipboard not available.', variant: 'destructive' }));
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy HTML
          </Button>
        </div>
      </div>

      {!adminLoading && !isAdmin && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Admin access required. If you believe you should have access, ensure your account has the admin role/claims.
          </AlertDescription>
        </Alert>
      )}

      {unauthorized && (
        <Alert variant="destructive">
          <AlertDescription>Admin access required.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left panel */}
        <Card className="border-border/60">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Template + Data
            </CardTitle>
            <CardDescription>
              Pick an event, edit sample JSON, and render. Rendering is debounced (450ms) and also available via the button.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Template</div>
              <Select
                value={eventType}
                onValueChange={(v) => setEventType(v as EmailEventType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.type} value={e.type}>
                      {e.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMeta?.description && (
                <p className="text-xs text-muted-foreground">{selectedMeta.description}</p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Sample payload (JSON)</div>
                <Button
                  size="sm"
                  onClick={() => renderNow({ showToast: true })}
                  disabled={loading || adminLoading || !isAdmin}
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Render
                </Button>
              </div>
              <Textarea
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                className="min-h-[420px] font-mono text-xs leading-relaxed"
                spellCheck={false}
              />
              {parseError && (
                <p className="text-sm text-destructive">JSON parse error: {parseError}</p>
              )}
              {schemaIssues && schemaIssues.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-destructive">Validation errors</div>
                  <ul className="text-sm text-destructive space-y-1">
                    {schemaIssues.slice(0, 12).map((i, idx) => (
                      <li key={idx}>
                        {i.path ? <span className="font-mono">{i.path}</span> : <span className="font-mono">payload</span>}
                        : {i.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right panel */}
        <Card className="border-border/60 overflow-hidden">
          <CardHeader className="space-y-2">
            <CardTitle>Live preview</CardTitle>
            <CardDescription>
              Rendered inside an iframe (email-like). Max width 700px, centered on a soft background.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{subject || '—'}</div>
                  <div className="text-xs text-muted-foreground truncate">{preheader || '—'}</div>
                </div>
                {loading && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rendering…
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-gradient-to-b from-muted/40 to-background p-4">
              <div className="mx-auto w-full max-w-[700px] rounded-xl border bg-white shadow-2xl overflow-hidden">
                {html ? (
                  <iframe
                    title="Email preview"
                    className="w-full h-[760px]"
                    srcDoc={html}
                    sandbox=""
                  />
                ) : (
                  <div className="h-[420px] flex items-center justify-center text-sm text-muted-foreground">
                    Select a template and render to see the preview.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

