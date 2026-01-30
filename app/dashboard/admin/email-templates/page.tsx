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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Copy, RefreshCw, Mail, ShieldAlert, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type RenderResponseOk = { ok: true; subject: string; preheader: string; html: string };
type RenderResponseErr =
  | { ok: false; error: string; code?: string; message?: string; missing?: string[] }
  | { ok: false; error: string; code: 'INVALID_PAYLOAD'; issues: Array<{ path: (string | number)[]; message: string }> }
  | { ok: false; error: string; code: 'UNKNOWN_EVENT'; validEvents: string[] };

function prettyJson(v: any): string {
  return JSON.stringify(v, null, 2);
}

function getPreviewOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  const origin = window.location?.origin;
  if (!origin) return null;
  // If we're already on production (agchange.com), do not rewrite.
  if (origin.includes('agchange.com')) return null;
  return origin.replace(/\/$/, '');
}

function rewriteUrlsForPreview<T>(value: T): T {
  const origin = getPreviewOrigin();
  if (!origin) return value;

  const visit = (v: any): any => {
    if (typeof v === 'string') {
      // Only rewrite the canonical production origin in preview to avoid CORS failures in srcDoc iframes.
      if (v.startsWith('https://agchange.com')) return v.replace('https://agchange.com', origin);
      return v;
    }
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const out: any = {};
      for (const [k, child] of Object.entries(v)) out[k] = visit(child);
      return out;
    }
    return v;
  };

  return visit(value) as T;
}

function rewriteHtmlForPreview(html: string): string {
  const origin = getPreviewOrigin();
  if (!origin) return html;
  return html.replaceAll('https://agchange.com', origin);
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
  const [payloadText, setPayloadText] = useState<string>(() => prettyJson(rewriteUrlsForPreview(getSamplePayload(defaultEvent))));
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
        setHtml(rewriteHtmlForPreview(ok.html));
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
    setPayloadText(prettyJson(rewriteUrlsForPreview(sample)));
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

  const editorBlock = (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary shrink-0" />
          <div className="text-sm font-semibold">Template + data</div>
        </div>
        <Button
          size="sm"
          className="min-h-[40px] w-full sm:w-auto"
          onClick={() => renderNow({ showToast: true })}
          disabled={loading || adminLoading || !isAdmin}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Render
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Template</div>
        <Select value={eventType} onValueChange={(v) => setEventType(v as EmailEventType)}>
          <SelectTrigger className="h-11 min-h-[44px]">
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
          <p className="text-sm text-muted-foreground">{selectedMeta.description}</p>
        )}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sample payload (JSON)</div>
          <div className="text-xs text-muted-foreground">Auto-renders after you stop typing</div>
        </div>
        <Textarea
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          className="min-h-[280px] md:min-h-[520px] font-mono text-xs leading-relaxed"
          spellCheck={false}
        />
        {parseError && (
          <p className="text-sm text-destructive">JSON parse error: {parseError}</p>
        )}
        {schemaIssues && schemaIssues.length > 0 && (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 max-h-[200px] overflow-y-auto">
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
    </>
  );

  const previewBlock = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary shrink-0" />
          <div className="text-sm font-semibold">Live preview</div>
        </div>
        {loading && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Rendering…
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/60 bg-card/70 p-3 md:p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subject</div>
        <div className="mt-1 text-sm font-semibold break-words">{subject || '—'}</div>
        <div className="mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preheader</div>
        <div className="mt-1 text-xs text-muted-foreground break-words">{preheader || '—'}</div>
      </div>

      <div className="flex-1 min-h-[75vh] md:min-h-0 rounded-xl md:rounded-2xl border border-border/60 bg-background/60 p-3 md:p-4 overflow-hidden flex flex-col">
        <div className="mx-auto w-full max-w-[700px] rounded-xl border bg-white shadow-2xl overflow-hidden flex-1 min-h-[70vh]">
          {html ? (
            <iframe
              title="Email preview"
              className="w-full h-full min-h-[70vh]"
              srcDoc={html}
              sandbox="allow-same-origin"
            />
          ) : loading ? (
            <div className="p-4 md:p-6 space-y-3 h-full min-h-[70vh] flex flex-col justify-center">
              <Skeleton className="h-6 w-3/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="h-10 w-40 mt-4" />
              <div className="pt-6">
                <Skeleton className="h-64 w-full" />
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[70vh] flex items-center justify-center text-sm text-muted-foreground px-4 md:px-6 text-center">
              Select a template and render to see the preview.
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 max-w-7xl space-y-4 md:space-y-6">
        <div className="min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">Email Templates</h1>
                <Badge variant="secondary" className="font-semibold text-xs md:text-sm">Preview</Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                This does <span className="font-semibold">NOT</span> send email. It only renders templates in-browser via the server renderer.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                onClick={() => {
                  const sample = getSamplePayload(eventType);
                  void safeCopy(prettyJson(sample))
                    .then(() => toast({ title: 'Copied', description: 'Sample payload copied.' }))
                    .catch(() => toast({ title: 'Copy failed', description: 'Clipboard not available.', variant: 'destructive' }));
                }}
              >
                <Copy className="h-4 w-4 mr-2 shrink-0" />
                <span className="hidden sm:inline">Copy sample payload</span>
                <span className="sm:hidden">Sample</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                disabled={!canCopy}
                onClick={() => {
                  void safeCopy(html)
                    .then(() => toast({ title: 'Copied', description: 'HTML copied to clipboard.' }))
                    .catch(() => toast({ title: 'Copy failed', description: 'Clipboard not available.', variant: 'destructive' }));
                }}
              >
                <Copy className="h-4 w-4 mr-2 shrink-0" />
                <span className="hidden sm:inline">Copy HTML</span>
                <span className="sm:hidden">HTML</span>
              </Button>
            </div>
          </div>
        </div>

        {!adminLoading && !isAdmin && (
          <Alert className="rounded-xl border-border/60">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <AlertDescription>
              Admin access required. If you believe you should have access, ensure your account has the admin role/claims.
            </AlertDescription>
          </Alert>
        )}

        {unauthorized && (
          <Alert variant="destructive" className="rounded-xl">
            <AlertDescription>Admin access required.</AlertDescription>
          </Alert>
        )}

        {/* Mobile: stacked editor + preview cards */}
        <div className="md:hidden space-y-4">
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 overflow-hidden">
            <CardHeader className="pb-3 pt-4 px-3 sm:px-5">
              <CardTitle className="text-base">Editor</CardTitle>
              <CardDescription className="text-xs">
                Pick a template and edit sample JSON. Auto-renders when you stop typing.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-5 pb-4 space-y-4">
              {editorBlock}
            </CardContent>
          </Card>

          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 overflow-hidden">
            <CardHeader className="pb-3 pt-4 px-3 sm:px-5">
              <CardTitle className="text-base">Preview</CardTitle>
              <CardDescription className="text-xs">
                Subject, preheader, and rendered email.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-5 pb-4 flex flex-col gap-4">
              {previewBlock}
            </CardContent>
          </Card>
        </div>

        {/* Desktop: side-by-side resizable panels */}
        <Card className="hidden md:block border-2 border-border/60 overflow-hidden rounded-xl">
          <CardHeader className="pb-4 px-5">
            <CardTitle className="text-lg">Editor + Preview</CardTitle>
            <CardDescription>
              Left: pick a template + edit sample JSON. Right: live rendered HTML in an iframe (email-like).
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            <div className="h-[78vh] min-h-[640px]">
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={44} minSize={30}>
                  <ScrollArea className="h-full">
                    <div className="p-5 space-y-4">
                      {editorBlock}
                    </div>
                  </ScrollArea>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={56} minSize={35}>
                  <div className="h-full bg-gradient-to-b from-muted/30 to-background">
                    <div className="p-5 h-full flex flex-col gap-4">
                      {previewBlock}
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

