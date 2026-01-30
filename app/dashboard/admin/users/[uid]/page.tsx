'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, ArrowLeft, ShieldAlert, UserX, UserCheck, Ban, Clock, RefreshCw, KeyRound, LogOut, MessageSquareOff, BadgeAlert, Copy, ExternalLink, FileText, History } from 'lucide-react';
import { getEffectiveSubscriptionTier, getTierLabel, type SubscriptionTier } from '@/lib/pricing/subscriptions';
import { AIAdminSummary } from '@/components/admin/AIAdminSummary';

type Dossier = {
  authUser: any | null;
  userDoc: any | null;
  summary: any | null;
  notes: Array<{ id: string; note: string; createdAt: string | null; createdBy: string }>;
  audits: Array<{ auditId: string; actionType: string; actorUid: string; actorRole: string; createdAt: string | null; beforeState: any; afterState: any; metadata: any }>;
};

function statusBadge(status: string | null | undefined, authDisabled?: boolean) {
  if (status === 'banned') return <Badge variant="destructive">Banned</Badge>;
  if (status === 'suspended') return <Badge className="bg-amber-500 text-amber-950">Suspended</Badge>;
  if (authDisabled) return <Badge variant="destructive">Disabled</Badge>;
  return <Badge variant="outline">Active</Badge>;
}

function auditActionLabel(actionType: string): string {
  const map: Record<string, string> = {
    admin_user_suspended: 'User suspended',
    admin_user_unsuspended: 'User unsuspended',
    admin_user_banned: 'User banned',
    admin_user_unbanned: 'User unbanned',
    admin_user_disabled: 'Account disabled',
    admin_user_enabled: 'Account enabled',
    admin_user_force_logout: 'Force logout',
    admin_user_messaging_muted: 'Messaging muted',
    admin_user_messaging_unmuted: 'Messaging unmuted',
    admin_user_selling_disabled: 'Selling disabled',
    admin_user_selling_enabled: 'Selling enabled',
    admin_user_risk_updated: 'Risk label updated',
    admin_user_note_added: 'Note added',
    admin_user_role_changed: 'Role changed',
    admin_user_password_reset_link_created: 'Password reset link created',
    admin_plan_override: 'Seller tier override',
  };
  return map[actionType] || actionType.replace(/_/g, ' ');
}

export default function AdminUserDossierPage() {
  const router = useRouter();
  const params = useParams<{ uid: string }>();
  const uid = params?.uid;
  const { user } = useAuth();
  const { isAdmin, isSuperAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Generic confirm dialog for destructive/admin actions
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<null | (() => Promise<void>)>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [riskLabel, setRiskLabel] = useState<'low' | 'med' | 'high' | 'unknown'>('unknown');
  const [riskReasons, setRiskReasons] = useState('');
  const [tierOverride, setTierOverride] = useState<SubscriptionTier>('standard');
  const [tierNotes, setTierNotes] = useState('');

  const authHeader = async (): Promise<HeadersInit> => {
    const token = await user?.getIdToken();
    return { authorization: `Bearer ${token}` };
  };

  const load = async () => {
    if (!user || !isAdmin || !uid) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/admin/users/${uid}/dossier`, { headers });
      const jsonData = await res.json().catch(() => ({}));
      if (!res.ok || jsonData?.ok !== true) throw new Error(jsonData?.message || jsonData?.error || 'Failed to load dossier');
      setData(jsonData as any);
      const existingRisk = jsonData?.userDoc?.riskLabel || jsonData?.summary?.risk?.label || 'unknown';
      setRiskLabel(['low', 'med', 'high', 'unknown'].includes(existingRisk) ? existingRisk : 'unknown');
      setRiskReasons(Array.isArray(jsonData?.userDoc?.riskReasons) ? jsonData.userDoc.riskReasons.join(', ') : '');

      // Initialize tier UI from user doc if present.
      const currentTier = getEffectiveSubscriptionTier(jsonData?.userDoc || null);
      setTierOverride(currentTier);
    } catch (e: any) {
      setError(e?.message || 'Failed to load dossier');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!uid) return;
    if (!user) return;
    if (adminLoading) return;
    if (!isAdmin) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, user?.uid, adminLoading, isAdmin]);

  const displayName = data?.authUser?.displayName || data?.summary?.displayName || data?.userDoc?.displayName || 'User';
  const email = data?.authUser?.email || data?.summary?.email || data?.userDoc?.email || null;
  const phone = data?.authUser?.phoneNumber || data?.summary?.phoneNumber || data?.userDoc?.phoneNumber || null;
  const role = data?.summary?.role || data?.userDoc?.role || null;
  const lastSignInAt = data?.authUser?.lastSignInAt ? new Date(data.authUser.lastSignInAt).toLocaleString() : null;
  const status = data?.summary?.status || null;
  const authDisabled = !!data?.authUser?.disabled || !!data?.summary?.authDisabled;

  const counts = data?.summary?.counts || {};
  const verification = data?.summary?.verification || {};
  const risk = data?.summary?.risk || {};
  const stripe = data?.summary?.stripe || {};
  const flags = {
    sellingDisabled: data?.userDoc?.adminFlags?.sellingDisabled === true || data?.summary?.sellerFlags?.sellingDisabled === true,
    messagingMuted: data?.userDoc?.adminFlags?.messagingMuted === true || data?.summary?.messagingFlags?.muted === true,
  };

  const tier = getEffectiveSubscriptionTier(data?.userDoc || null);
  const adminPlanOverride = (data?.userDoc?.adminPlanOverride ?? null) as string | null;
  const adminOverrideReason = (data?.userDoc?.adminOverrideReason ?? null) as string | null;
  const adminOverrideBy = (data?.userDoc?.adminOverrideBy ?? null) as string | null;
  const adminOverrideAtRaw = (data?.userDoc?.adminOverrideAt ?? null) as any;
  const adminOverrideAt =
    typeof adminOverrideAtRaw?.toDate === 'function' ? adminOverrideAtRaw.toDate() : adminOverrideAtRaw instanceof Date ? adminOverrideAtRaw : null;

  // Parse Firestore/JSON timestamps for status details (suspended/banned/disabled)
  const toDateSafe = (v: any): Date | null => {
    if (!v) return null;
    if (typeof v?.toDate === 'function') return v.toDate();
    if (v instanceof Date) return v;
    if (typeof v === 'string') {
      const d = new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    const sec = v?.seconds ?? v?._seconds;
    if (typeof sec === 'number') return new Date(sec * 1000);
    return null;
  };

  const userDoc = data?.userDoc;
  const suspendedAt = toDateSafe(userDoc?.suspendedAt);
  const suspendedUntil = toDateSafe(userDoc?.suspendedUntil);
  const bannedAt = toDateSafe(userDoc?.bannedAt);
  const suspendedBy = (userDoc?.suspendedBy as string) || null;
  const suspendedReason = (userDoc?.suspendedReason as string) || null;
  const bannedBy = (userDoc?.bannedBy as string) || null;
  const bannedReason = (userDoc?.bannedReason as string) || null;

  const openConfirm = (params: { title: string; description: string; action: () => Promise<void> }) => {
    setConfirmTitle(params.title);
    setConfirmDescription(params.description);
    setConfirmReason('');
    setConfirmAction(params.action);
    setConfirmOpen(true);
  };

  const runConfirm = async () => {
    if (!confirmAction) return;
    const r = confirmReason.trim();
    if (!r) {
      toast({ title: 'Reason required', description: 'Please enter a reason for this action.', variant: 'destructive' });
      return;
    }
    setConfirmBusy(true);
    try {
      await confirmAction();
      setConfirmOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setConfirmBusy(false);
    }
  };

  const postJson = async (path: string, body: any) => {
    const headers = await authHeader();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d?.ok !== true) {
      throw new Error(d?.message || d?.error || 'Request failed');
    }
    return d;
  };

  const canEditRole = isSuperAdmin;

  // Loading state
  if (adminLoading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 max-w-7xl">
          <Card className="rounded-xl border border-border/60 bg-card">
            <CardContent className="pt-6 px-4 sm:px-6">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <div className="font-semibold text-sm md:text-base">Loading...</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Early return for non-admin users
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 max-w-7xl">
          <Card className="rounded-xl border border-border/60 bg-card">
            <CardContent className="pt-6 px-4 sm:px-6">
              <div className="flex items-center gap-2 text-destructive text-sm md:text-base">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <div className="font-semibold">Admin access required.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 max-w-7xl space-y-4 md:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 flex-wrap">
          <div className="space-y-2 min-w-0">
            <Button variant="outline" size="sm" className="w-fit h-9 md:min-h-[40px] md:h-10" onClick={() => router.push('/dashboard/admin/users')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl md:text-3xl font-extrabold text-foreground truncate">User dossier</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs md:text-sm text-muted-foreground font-mono truncate">UID: {uid}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    if (!uid) return;
                    try {
                      await navigator.clipboard.writeText(uid);
                      toast({ title: 'UID copied' });
                    } catch {
                      toast({ title: 'Copy failed', variant: 'destructive' });
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                {email && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(email);
                        toast({ title: 'Email copied' });
                      } catch {
                        toast({ title: 'Copy failed', variant: 'destructive' });
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-9 md:h-10" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <Card className="rounded-xl border border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4 pb-4 px-3 sm:px-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {loading ? (
          <Card className="rounded-xl border border-border/60">
            <CardContent className="py-8 md:py-10 flex items-center justify-center text-muted-foreground text-sm md:text-base px-3 sm:px-6">
              <Loader2 className="h-5 w-5 animate-spin mr-2 shrink-0" />
              Loading…
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="space-y-4 md:space-y-6">
            {/* AI Summary - shown at top for quick context */}
            {uid && (
              <AIAdminSummary
                entityType="user"
                entityId={uid}
                existingSummary={data.userDoc?.aiAdminSummary || null}
                existingSummaryAt={data.userDoc?.aiAdminSummaryAt || null}
                existingSummaryModel={data.userDoc?.aiAdminSummaryModel || null}
                onSummaryUpdated={(summary, model, generatedAt) => {
                  // Update local state if needed
                  if (data.userDoc) {
                    data.userDoc.aiAdminSummary = summary;
                    data.userDoc.aiAdminSummaryAt = generatedAt;
                    data.userDoc.aiAdminSummaryModel = model;
                  }
                }}
              />
            )}
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              <div className="lg:col-span-2 space-y-4 md:space-y-6">
                <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:border-border/50 md:bg-card">
                <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
                  <CardTitle className="text-lg md:text-xl font-extrabold break-words">{displayName}</CardTitle>
                  <CardDescription className="text-xs md:text-sm break-all">
                    {email || '—'} {phone ? ` • ${phone}` : ''}
                  </CardDescription>
                  {lastSignInAt && (
                    <p className="text-xs text-muted-foreground mt-1">Last sign-in: {lastSignInAt}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4 px-3 sm:px-6 pb-4 md:pb-6">
                  <div className="flex flex-wrap gap-1.5 md:gap-2 items-center">
                    {statusBadge(status, authDisabled)}
                    {role ? (
                      <Badge variant={role === 'super_admin' || role === 'admin' ? 'default' : 'secondary'}>
                        {String(role).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Role unknown</Badge>
                    )}
                    {data.authUser?.emailVerified ? (
                      <Badge className="bg-emerald-500 text-emerald-950">Email verified</Badge>
                    ) : (
                      <Badge variant="secondary">Email unverified</Badge>
                    )}
                    {verification?.identityVerified === true ? <Badge variant="secondary">Identity verified</Badge> : null}
                    {verification?.sellerVerified === true ? <Badge variant="secondary">Seller verified</Badge> : null}
                    {risk?.label ? <Badge variant={risk.label === 'high' ? 'destructive' : risk.label === 'med' ? 'secondary' : 'outline'}>Risk: {risk.label}</Badge> : null}
                  </div>

                  {/* Status details: who/when/why for suspend, ban, or disable */}
                  {(status === 'suspended' || status === 'banned' || authDisabled) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-3 text-sm">
                      <div className="font-semibold text-foreground mb-1">Status details</div>
                      {status === 'suspended' && (
                        <>
                          {suspendedBy && <div className="text-muted-foreground">Suspended by: <span className="font-mono text-foreground">{suspendedBy}</span></div>}
                          {suspendedAt && <div className="text-muted-foreground">At: {suspendedAt.toLocaleString()}</div>}
                          {suspendedUntil && <div className="text-muted-foreground">Until: {suspendedUntil.toLocaleString()}</div>}
                          {suspendedReason && <div className="mt-1 text-foreground">Reason: {suspendedReason}</div>}
                        </>
                      )}
                      {status === 'banned' && (
                        <>
                          {bannedBy && <div className="text-muted-foreground">Banned by: <span className="font-mono text-foreground">{bannedBy}</span></div>}
                          {bannedAt && <div className="text-muted-foreground">At: {bannedAt.toLocaleString()}</div>}
                          {bannedReason && <div className="mt-1 text-foreground">Reason: {bannedReason}</div>}
                        </>
                      )}
                      {authDisabled && status !== 'suspended' && status !== 'banned' && (
                        <div className="text-muted-foreground">Account is disabled (no sign-in). Check audit trail for who/when/why.</div>
                      )}
                    </div>
                  )}

                  <Separator />

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 text-sm">
                    <div className="rounded-lg border bg-muted/20 p-2.5 md:p-3">
                      <div className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide">Listings</div>
                      <div className="text-base md:text-lg font-extrabold">{Number(counts.listingsCount || 0).toLocaleString()}</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Active: {Number(counts.activeListingsCount || 0).toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-2.5 md:p-3">
                      <div className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sold</div>
                      <div className="text-base md:text-lg font-extrabold">{Number(counts.soldListingsCount || 0).toLocaleString()}</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">GMV: ${(Number(counts.gmvSellCents || 0) / 100).toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-2.5 md:p-3">
                      <div className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide">Orders</div>
                      <div className="text-base md:text-lg font-extrabold">{Number(counts.ordersBuyCount || 0).toLocaleString()}</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">GMV: ${(Number(counts.gmvBuyCents || 0) / 100).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Link
                      href={uid ? `/dashboard/admin/listings?sellerId=${encodeURIComponent(uid)}` : '/dashboard/admin/listings'}
                      className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      View this user&apos;s listings
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:border-border/50 md:bg-card">
                <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
                  <CardTitle className="text-base md:text-lg">Internal notes</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Only visible to admins. Timestamped and audited.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" rows={3} />
                  <div className="flex gap-2">
                    <Button
                      disabled={noteSaving || !note.trim()}
                      onClick={async () => {
                        setNoteSaving(true);
                        try {
                          await postJson(`/api/admin/users/${uid}/notes/add`, { note: note.trim() });
                          setNote('');
                          toast({ title: 'Note added' });
                          await load();
                        } catch (e: any) {
                          toast({ title: 'Failed', description: e?.message || 'Could not add note', variant: 'destructive' });
                        } finally {
                          setNoteSaving(false);
                        }
                      }}
                      className="font-semibold"
                    >
                      {noteSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Add note
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {(data.notes || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-6 rounded-lg border border-dashed border-border bg-muted/10 text-center">
                        <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No notes yet.</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Add a note above to record internal context.</p>
                      </div>
                    ) : (
                      data.notes.map((n) => (
                        <div key={n.id} className="rounded-lg border bg-muted/20 p-3">
                          <div className="text-xs text-muted-foreground">
                            {n.createdAt ? new Date(n.createdAt).toLocaleString() : '—'} • {n.createdBy}
                          </div>
                          <div className="text-sm mt-1 whitespace-pre-wrap break-words">{n.note}</div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:border-border/50 md:bg-card">
                <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
                  <CardTitle className="text-base md:text-lg">Audit trail</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Chronological list of admin actions on this user (who, when, reason).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 px-3 sm:px-6 pb-4 md:pb-6">
                  {(data.audits || []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 rounded-lg border border-dashed border-border bg-muted/10 text-center">
                      <History className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No audit entries found.</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Admin actions will appear here.</p>
                      {typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_FIREBASE_PROJECT_ID && (
                        <a
                          href={`https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/firestore/indexes`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1"
                        >
                          Firestore indexes
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      )}
                    </div>
                  ) : (
                    data.audits.map((a) => (
                      <div key={a.auditId} className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-semibold text-sm">{auditActionLabel(a.actionType)}</div>
                          <div className="text-xs text-muted-foreground">{a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}</div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">By: {a.actorUid} ({a.actorRole})</div>
                        {(a.metadata as { reason?: string })?.reason && (
                          <div className="text-xs text-foreground mt-1.5 border-l-2 border-muted-foreground/30 pl-2">Reason: {(a.metadata as { reason: string }).reason}</div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1 space-y-4 md:space-y-6">
              <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:border-border/50 md:bg-card">
                <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
                  <CardTitle className="text-base md:text-lg">Seller tier</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Admin override for exposure tier. Requires a reason and is audited.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-muted-foreground">Effective tier</div>
                    <Badge variant={tier === 'premier' ? 'default' : tier === 'priority' ? 'secondary' : 'outline'}>
                      {getTierLabel(tier)}
                    </Badge>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>
                      <span className="font-semibold">Override:</span> {adminPlanOverride ? String(adminPlanOverride) : 'none'}
                    </div>
                    {adminOverrideReason ? (
                      <div>
                        <span className="font-semibold">Reason:</span> {adminOverrideReason}
                      </div>
                    ) : null}
                    {adminOverrideBy || adminOverrideAt ? (
                      <div>
                        <span className="font-semibold">Set by:</span> {adminOverrideBy || '—'}{' '}
                        {adminOverrideAt ? `• ${adminOverrideAt.toLocaleString()}` : ''}
                      </div>
                    ) : null}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Set override tier</div>
                    <Select value={tierOverride} onValueChange={(v) => setTierOverride(v as SubscriptionTier)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="priority">Priority</SelectItem>
                        <SelectItem value="premier">Premier</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={tierNotes}
                      onChange={(e) => setTierNotes(e.target.value)}
                      placeholder="Optional notes (internal)"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() =>
                          openConfirm({
                            title: `Set seller tier override to ${getTierLabel(tierOverride)}?`,
                            description:
                              'This sets an admin override for seller exposure tier. It does not create/cancel Stripe subscriptions.',
                            action: async () => {
                              await postJson(`/api/admin/users/${uid}/plan-override`, {
                                planOverride: tierOverride,
                                reason: confirmReason.trim(),
                                ...(tierNotes.trim() ? { notes: tierNotes.trim() } : {}),
                              });
                              toast({ title: 'Tier updated', description: `Override set to ${getTierLabel(tierOverride)}.` });
                            },
                          })
                        }
                      >
                        Set override
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          openConfirm({
                            title: 'Remove seller tier override?',
                            description: 'This removes the admin override and returns the user to their subscription-driven tier.',
                            action: async () => {
                              await postJson(`/api/admin/users/${uid}/plan-override`, {
                                planOverride: null,
                                reason: confirmReason.trim(),
                                ...(tierNotes.trim() ? { notes: tierNotes.trim() } : {}),
                              });
                              toast({ title: 'Override removed' });
                            },
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4 md:space-y-6">
              <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:border-border/50 md:bg-card">
                <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
                  <CardTitle className="text-base md:text-lg">Admin actions</CardTitle>
                  <CardDescription className="text-xs md:text-sm">All actions require a reason and are audited.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account status</p>
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() =>
                        openConfirm({
                          title: 'Force logout user?',
                          description: 'This revokes refresh tokens and forces sign-out across devices.',
                          action: async () => {
                            await postJson(`/api/admin/users/${uid}/force-logout`, { reason: confirmReason.trim() });
                            toast({ title: 'Force logout triggered' });
                          },
                        })
                      }
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Force logout
                    </Button>

                    <Button
                      variant={flags.messagingMuted ? 'secondary' : 'outline'}
                    className="w-full justify-start"
                    onClick={() =>
                      openConfirm({
                        title: flags.messagingMuted ? 'Unmute messaging?' : 'Mute messaging?',
                        description: flags.messagingMuted
                          ? 'This will allow the user to send messages again.'
                          : 'This blocks the user from sending messages (transparent enforcement).',
                        action: async () => {
                          await postJson(`/api/admin/users/${uid}/set-messaging-muted`, { muted: !flags.messagingMuted, reason: confirmReason.trim() });
                          toast({ title: flags.messagingMuted ? 'Messaging unmuted' : 'Messaging muted' });
                        },
                      })
                    }
                  >
                    <MessageSquareOff className="h-4 w-4 mr-2" />
                    {flags.messagingMuted ? 'Unmute messaging' : 'Mute messaging'}
                  </Button>

                  <Button
                    variant={flags.sellingDisabled ? 'secondary' : 'outline'}
                    className="w-full justify-start"
                    onClick={() =>
                      openConfirm({
                        title: flags.sellingDisabled ? 'Enable selling?' : 'Disable selling?',
                        description: flags.sellingDisabled
                          ? 'This will allow publishing listings again.'
                          : 'This blocks listing publish (server-side enforced).',
                        action: async () => {
                          await postJson(`/api/admin/users/${uid}/set-selling-disabled`, { disabled: !flags.sellingDisabled, reason: confirmReason.trim() });
                          toast({ title: flags.sellingDisabled ? 'Selling enabled' : 'Selling disabled' });
                        },
                      })
                    }
                  >
                    <BadgeAlert className="h-4 w-4 mr-2" />
                    {flags.sellingDisabled ? 'Enable selling' : 'Disable selling'}
                  </Button>

                  <Separator />

                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() =>
                      openConfirm({
                        title: 'Disable account?',
                        description: 'Disables the Firebase Auth user (cannot sign in).',
                        action: async () => {
                          await postJson(`/api/admin/users/${uid}/set-status`, { status: 'disabled', reason: confirmReason.trim() });
                          toast({ title: 'User disabled' });
                        },
                      })
                    }
                  >
                    <UserX className="h-4 w-4 mr-2" />
                    Disable account
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() =>
                      openConfirm({
                        title: 'Enable account?',
                        description: 'Re-enables sign in (clears suspension/ban flags).',
                        action: async () => {
                          await postJson(`/api/admin/users/${uid}/set-status`, { status: 'active', reason: confirmReason.trim() });
                          toast({ title: 'User enabled' });
                        },
                      })
                    }
                  >
                    <UserCheck className="h-4 w-4 mr-2" />
                    Enable account
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() =>
                      openConfirm({
                        title: 'Suspend user?',
                        description: 'Temporary disable. Defaults to 7 days if not specified server-side.',
                        action: async () => {
                          await postJson(`/api/admin/users/${uid}/set-status`, { status: 'suspended', reason: confirmReason.trim() });
                          toast({ title: 'User suspended' });
                        },
                      })
                    }
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Suspend
                  </Button>

                  <Button
                    variant="destructive"
                    className="w-full justify-start"
                    onClick={() =>
                      openConfirm({
                        title: 'Ban user?',
                        description: 'Permanent disable + ban marker in Firestore.',
                        action: async () => {
                          await postJson(`/api/admin/users/${uid}/set-status`, { status: 'banned', reason: confirmReason.trim() });
                          toast({ title: 'User banned' });
                        },
                      })
                    }
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Ban
                  </Button>
                  </div>

                  <Separator />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tools</p>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={async () => {
                      try {
                        const res = await postJson(`/api/admin/users/${uid}/password-reset-link`, { reason: 'Admin: password reset link' });
                        const link = String(res.link || '');
                        if (link) {
                          await navigator.clipboard.writeText(link);
                          toast({ title: 'Password reset link copied' });
                        } else {
                          toast({ title: 'Link created', description: 'No link returned.', variant: 'destructive' });
                        }
                      } catch (e: any) {
                        toast({ title: 'Failed', description: e?.message || 'Could not generate reset link', variant: 'destructive' });
                      }
                    }}
                  >
                    <KeyRound className="h-4 w-4 mr-2" />
                    Password reset link
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:border-border/50 md:bg-card">
                <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
                  <CardTitle className="text-base md:text-lg">Risk label</CardTitle>
                  <CardDescription className="text-xs md:text-sm">
                    {riskLabel === 'unknown'
                      ? 'Manual for now (audited). Set when you have enough signal (e.g. disputes, reports).'
                      : 'Manual for now (audited).'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
                  <Select value={riskLabel} onValueChange={(v) => setRiskLabel(v as any)}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="Select risk" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="med">Med</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={riskReasons}
                    onChange={(e) => setRiskReasons(e.target.value)}
                    placeholder="Reason codes (comma-separated)"
                    className="h-11"
                  />
                  <Button
                    className="w-full font-semibold"
                    onClick={() =>
                      openConfirm({
                        title: 'Update risk label?',
                        description: 'This updates Firestore user doc + userSummary.',
                        action: async () => {
                          const reasons = riskReasons
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .slice(0, 25);
                          await postJson(`/api/admin/users/${uid}/set-risk`, {
                            riskLabel,
                            reasons,
                            reason: confirmReason.trim(),
                          });
                          toast({ title: 'Risk updated' });
                        },
                      })
                    }
                  >
                    Save risk
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:border-border/50 md:bg-card">
                <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
                  <CardTitle className="text-base md:text-lg">Stripe</CardTitle>
                  <CardDescription className="text-xs md:text-sm">Connect account status.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
                  <div className="flex flex-wrap gap-2 text-xs md:text-sm">
                    <span className="font-mono font-semibold">{stripe.accountId || '—'}</span>
                    {stripe.accountId && (
                      <a
                        href={`https://dashboard.stripe.com/connect/accounts/${stripe.accountId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Open in Stripe
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={stripe.onboardingStatus === 'complete' ? 'default' : 'secondary'}>
                      Onboarding: {stripe.onboardingStatus || '—'}
                    </Badge>
                    <Badge variant={stripe.payoutsEnabled ? 'default' : 'outline'}>Payouts: {String(stripe.payoutsEnabled ?? '—')}</Badge>
                    <Badge variant={stripe.chargesEnabled ? 'default' : 'outline'}>Charges: {String(stripe.chargesEnabled ?? '—')}</Badge>
                  </div>
                </CardContent>
              </Card>

              {canEditRole ? (
                <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:border-border/50 md:bg-card">
                  <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
                    <CardTitle className="text-base md:text-lg">Role</CardTitle>
                    <CardDescription className="text-xs md:text-sm">Super-admin only.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() =>
                        openConfirm({
                          title: 'Set role to admin?',
                          description: 'Updates Firestore role + Firebase Auth custom claims.',
                          action: async () => {
                            await postJson(`/api/admin/users/${uid}/set-role`, { role: 'admin', reason: confirmReason.trim() });
                            toast({ title: 'Role updated' });
                          },
                        })
                      }
                    >
                      Make admin
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() =>
                        openConfirm({
                          title: 'Set role to user?',
                          description: 'Removes admin role. Updates Firestore role + Firebase Auth custom claims.',
                          action: async () => {
                            await postJson(`/api/admin/users/${uid}/set-role`, { role: 'user', reason: confirmReason.trim() });
                            toast({ title: 'Role updated' });
                          },
                        })
                      }
                    >
                      Make user
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base md:text-lg">{confirmTitle}</DialogTitle>
              <DialogDescription className="text-xs md:text-sm">{confirmDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</div>
              <Input value={confirmReason} onChange={(e) => setConfirmReason(e.target.value)} placeholder="Required" className="h-10 md:h-11 text-base" />
            </div>
            <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirmBusy} className="min-h-[40px] flex-1 sm:flex-initial">
                Cancel
              </Button>
              <Button onClick={runConfirm} disabled={confirmBusy} className="font-semibold min-h-[40px] flex-1 sm:flex-initial">
                {confirmBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </>
        ) : null}
      </div>
    </div>
  );
}

