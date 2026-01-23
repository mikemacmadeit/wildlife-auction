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
import { Loader2, ArrowLeft, ShieldAlert, UserX, UserCheck, Ban, Clock, RefreshCw, KeyRound, LogOut, MessageSquareOff, BadgeAlert } from 'lucide-react';
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

  // Early return for non-admin users
  if (!isAdmin && !adminLoading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4" />
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
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <Button variant="outline" onClick={() => router.push('/dashboard/admin/users')} className="min-h-[40px]">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">User dossier</h1>
              <div className="text-sm text-muted-foreground">UID: {uid}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </div>

        {!adminLoading && !isAdmin && (
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4" />
                <div className="font-semibold">Admin access required.</div>
              </div>
            </CardContent>
          </Card>
        )}

        {error ? (
          <Card className="border-2 border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {loading ? (
          <Card className="border-2">
            <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </CardContent>
          </Card>
        ) : data ? (
          <div className="space-y-6">
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
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card className="border-2">
                <CardHeader>
                  <CardTitle className="text-xl font-extrabold">{displayName}</CardTitle>
                  <CardDescription>
                    {email || '—'} {phone ? ` • ${phone}` : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    {statusBadge(status, authDisabled)}
                    {role ? <Badge variant="secondary">{role}</Badge> : <Badge variant="outline">role unknown</Badge>}
                    {data.authUser?.emailVerified ? (
                      <Badge className="bg-emerald-500 text-emerald-950">Email verified</Badge>
                    ) : (
                      <Badge variant="secondary">Email unverified</Badge>
                    )}
                    {verification?.identityVerified === true ? <Badge variant="secondary">Identity verified</Badge> : null}
                    {verification?.sellerVerified === true ? <Badge variant="secondary">Seller verified</Badge> : null}
                    {risk?.label ? <Badge variant={risk.label === 'high' ? 'destructive' : risk.label === 'med' ? 'secondary' : 'outline'}>Risk: {risk.label}</Badge> : null}
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Listings</div>
                      <div className="text-lg font-extrabold">{Number(counts.listingsCount || 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">Active: {Number(counts.activeListingsCount || 0).toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sold</div>
                      <div className="text-lg font-extrabold">{Number(counts.soldListingsCount || 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">GMV sell: ${(Number(counts.gmvSellCents || 0) / 100).toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Orders</div>
                      <div className="text-lg font-extrabold">{Number(counts.ordersBuyCount || 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">GMV buy: ${(Number(counts.gmvBuyCents || 0) / 100).toLocaleString()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2">
                <CardHeader>
                  <CardTitle>Internal notes</CardTitle>
                  <CardDescription>Only visible to admins. Timestamped and audited.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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
                      <div className="text-sm text-muted-foreground">No notes yet.</div>
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

              <Card className="border-2">
                <CardHeader>
                  <CardTitle>Audit trail</CardTitle>
                  <CardDescription>Admin actions on this user (requires Firestore index if empty).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(data.audits || []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No audit entries found.</div>
                  ) : (
                    data.audits.map((a) => (
                      <div key={a.auditId} className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-sm">{a.actionType}</div>
                          <div className="text-xs text-muted-foreground">{a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">Actor: {a.actorUid} ({a.actorRole})</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1 space-y-6">
              <Card className="border-2">
                <CardHeader>
                  <CardTitle>Seller tier</CardTitle>
                  <CardDescription>Admin override for exposure tier. Requires a reason and is audited.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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

              <Card className="border-2">
                <CardHeader>
                  <CardTitle>Admin actions</CardTitle>
                  <CardDescription>All actions require a reason and are audited.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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

                  <Separator />

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

              <Card className="border-2">
                <CardHeader>
                  <CardTitle>Risk label</CardTitle>
                  <CardDescription>Manual for now (audited).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
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

              <Card className="border-2">
                <CardHeader>
                  <CardTitle>Stripe</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>Account: <span className="font-semibold">{stripe.accountId || '—'}</span></div>
                  <div>Onboarding: <span className="font-semibold">{stripe.onboardingStatus || '—'}</span></div>
                  <div>Payouts enabled: <span className="font-semibold">{String(stripe.payoutsEnabled ?? '—')}</span></div>
                  <div>Charges enabled: <span className="font-semibold">{String(stripe.chargesEnabled ?? '—')}</span></div>
                </CardContent>
              </Card>

              {canEditRole ? (
                <Card className="border-2">
                  <CardHeader>
                    <CardTitle>Role</CardTitle>
                    <CardDescription>Super-admin only.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
        ) : null}

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{confirmTitle}</DialogTitle>
              <DialogDescription>{confirmDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</div>
              <Input value={confirmReason} onChange={(e) => setConfirmReason(e.target.value)} placeholder="Required" className="h-11" />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={confirmBusy}>
                Cancel
              </Button>
              <Button onClick={runConfirm} disabled={confirmBusy} className="font-semibold">
                {confirmBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

