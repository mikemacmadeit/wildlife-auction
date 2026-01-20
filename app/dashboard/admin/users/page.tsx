'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Loader2, MoreHorizontal, Search, ShieldAlert, Copy, UserX, UserCheck, KeyRound, ExternalLink, RefreshCw } from 'lucide-react';

type AdminUserRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  phoneNumber: string | null;
  role: 'user' | 'admin' | 'super_admin' | null;
  subscriptionTier?: 'standard' | 'priority' | 'premier' | null;
  adminPlanOverride?: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  stripeAccountId?: string | null;
  status?: 'active' | 'disabled' | 'suspended' | 'banned' | null;
  risk?: { label?: 'low' | 'med' | 'high' | 'unknown' };
  verification?: { identityVerified?: boolean | null; sellerVerified?: boolean | null };
};

function roleBadge(role: AdminUserRow['role']) {
  if (role === 'super_admin') return <Badge className="bg-amber-500 text-amber-950">Super Admin</Badge>;
  if (role === 'admin') return <Badge className="bg-primary text-primary-foreground">Admin</Badge>;
  return <Badge variant="secondary">User</Badge>;
}

function tierBadge(tier: AdminUserRow['subscriptionTier'], override: string | null) {
  const label = tier === 'premier' ? 'Premier' : tier === 'priority' ? 'Priority' : 'Standard';
  return (
    <div className="flex items-center gap-2">
      <Badge variant={tier === 'premier' ? 'default' : tier === 'priority' ? 'secondary' : 'outline'} className="font-semibold">
        {label}
      </Badge>
      {override ? <Badge variant="outline" className="text-xs">Override</Badge> : null}
    </div>
  );
}

function initials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  const first = parts[0]?.[0] || 'U';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  return (first + last).toUpperCase();
}

function toDateSafe(v: string | null | undefined): Date | null {
  try {
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

function formatRelative(d: Date | null) {
  if (!d) return '—';
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

async function safeCopy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isSuperAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'any' | 'user' | 'admin' | 'super_admin'>('any');
  const [statusFilter, setStatusFilter] = useState<'any' | 'active' | 'disabled' | 'suspended' | 'banned'>('any');
  const [verificationFilter, setVerificationFilter] = useState<'any' | 'identityVerified' | 'sellerVerified'>('any');
  const [riskFilter, setRiskFilter] = useState<'any' | 'low' | 'med' | 'high' | 'unknown'>('any');
  const [activityFilter, setActivityFilter] = useState<'any' | '24h' | '7d' | '30d'>('any');
  const [sort, setSort] = useState<'newest' | 'last_activity'>('newest');

  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasDirectory, setHasDirectory] = useState(true);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastDiag, setLastDiag] = useState<null | {
    endpoint: 'directory' | 'lookup';
    status: number;
    requestId?: string | null;
    message?: string | null;
    url?: string | null;
  }>(null);

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminUserRow | null>(null);
  const [nextRole, setNextRole] = useState<'user' | 'admin' | 'super_admin'>('user');
  const [reason, setReason] = useState('');
  const [sendVerifyDialogOpen, setSendVerifyDialogOpen] = useState(false);
  const [sendVerifyTarget, setSendVerifyTarget] = useState<AdminUserRow | null>(null);
  const [sendVerifyReason, setSendVerifyReason] = useState('Support: resend verification email');

  const authHeader = useCallback(async (): Promise<HeadersInit> => {
    const token = await user?.getIdToken();
    return { authorization: `Bearer ${token}` };
  }, [user]);

  const load = useCallback(async (opts?: { query?: string }) => {
    if (!user) return;
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const q = String(opts?.query ?? query).trim();

      // Prefer new directory endpoint (userSummaries-backed). Fallback to legacy lookup if not available yet.
      if (hasDirectory) {
        const url = new URL('/api/admin/users/directory', window.location.origin);
        if (q) url.searchParams.set('q', q.toLowerCase());
        if (roleFilter !== 'any') url.searchParams.set('role', roleFilter);
        if (statusFilter !== 'any') url.searchParams.set('status', statusFilter);
        if (verificationFilter !== 'any') url.searchParams.set('verification', verificationFilter);
        if (riskFilter !== 'any') url.searchParams.set('risk', riskFilter);
        if (activityFilter !== 'any') url.searchParams.set('activity', activityFilter);
        url.searchParams.set('sort', sort);
        const pageSize = 25;
        url.searchParams.set('limit', String(pageSize));
        if (cursor) url.searchParams.set('cursor', cursor);

        const res = await fetch(url.toString(), { headers: await authHeader() });
        const data = await res.json().catch(() => ({}));
        const rid = res.headers.get('x-request-id');
        setLastDiag({
          endpoint: 'directory',
          status: res.status,
          requestId: rid,
          message: data?.message || data?.error || null,
          url: url.toString(),
        });
        if (!res.ok || data?.ok !== true) {
          // Log loudly (prod-safe) so admins can diagnose quickly.
          console.error('[AdminUsers] Directory request failed', {
            status: res.status,
            requestId: rid,
            message: data?.message || data?.error,
            url: url.toString(),
          });
          // If directory isn't ready/available, fall back to legacy lookup.
          setHasDirectory(false);
          throw new Error(
            `${data?.message || data?.error || 'Directory not available'}${rid ? ` (requestId: ${rid})` : ''}`
          );
        }
        const users = Array.isArray(data.users) ? data.users : [];
        const mapped: AdminUserRow[] = users.map((u: any) => ({
          uid: String(u.uid || u.id || ''),
          email: u.email || null,
          displayName: u.displayName || null,
          photoURL: u.photoURL ?? null,
          phoneNumber: u.phoneNumber || null,
          role: (u.role || null) as any,
          subscriptionTier: u.subscriptionTier ?? null,
          adminPlanOverride: u.adminPlanOverride ?? null,
          disabled: !!u.authDisabled,
          emailVerified: !!u.emailVerified,
          createdAt: u.createdAt?.toDate?.() ? u.createdAt.toDate().toISOString() : (u.createdAt ? String(u.createdAt) : null),
          lastSignInAt: u.lastLoginAt?.toDate?.() ? u.lastLoginAt.toDate().toISOString() : (u.lastLoginAt ? String(u.lastLoginAt) : null),
          stripeAccountId: u.stripe?.accountId ?? null,
          status: u.status ?? null,
          risk: u.risk ?? undefined,
          verification: u.verification ?? undefined,
        }));
        // If summaries are empty on a fresh env, auto-fallback to legacy lookup so the admin UI isn't blank.
        const noFilters =
          !q &&
          roleFilter === 'any' &&
          statusFilter === 'any' &&
          verificationFilter === 'any' &&
          riskFilter === 'any' &&
          activityFilter === 'any' &&
          !cursor;
        if (mapped.length === 0 && noFilters) {
          setHasDirectory(false);
          throw new Error('No user summaries found yet. Falling back to legacy lookup (run Backfill to populate summaries).');
        }

        // IMPORTANT: If the directory is only partially populated (common in small/prod environments),
        // admins can see an incomplete list (only users with userSummaries).
        // For the default view ONLY (no filters, first page), merge in legacy lookup results.
        // This also "warms" userSummaries because lookup writes summaries best-effort.
        if (noFilters && mapped.length > 0 && mapped.length < pageSize) {
          try {
            const fallbackUrl = new URL('/api/admin/users/lookup', window.location.origin);
            fallbackUrl.searchParams.set('query', '');
            fallbackUrl.searchParams.set('limit', String(pageSize));
            const r2 = await fetch(fallbackUrl.toString(), { headers: await authHeader() });
            const j2 = await r2.json().catch(() => ({}));
            if (r2.ok && j2?.ok === true && Array.isArray(j2?.users)) {
              const byUid = new Map<string, AdminUserRow>();
              for (const row of mapped) if (row?.uid) byUid.set(row.uid, row);
              for (const u of j2.users) {
                const uid = String(u?.uid || u?.id || '').trim();
                if (!uid || byUid.has(uid)) continue;
                byUid.set(uid, {
                  uid,
                  email: u?.email || null,
                  displayName: u?.displayName || null,
                  photoURL: u?.photoURL ?? null,
                  phoneNumber: u?.phoneNumber || null,
                  role: (u?.role || null) as any,
                  subscriptionTier: u?.subscriptionTier ?? null,
                  adminPlanOverride: u?.adminPlanOverride ?? null,
                  disabled: !!u?.disabled,
                  emailVerified: !!u?.emailVerified,
                  createdAt: u?.createdAt ? String(u.createdAt) : null,
                  lastSignInAt: u?.lastSignInAt ? String(u.lastSignInAt) : null,
                  stripeAccountId: u?.stripeAccountId ?? null,
                });
              }
              setRows(Array.from(byUid.values()));
              setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
              return;
            }
          } catch {
            // ignore
          }
        }

        setRows(mapped);
        setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
        return;
      }

      const url = new URL('/api/admin/users/lookup', window.location.origin);
      if (q) url.searchParams.set('query', q);
      url.searchParams.set('limit', '25');
      const res = await fetch(url.toString(), { headers: await authHeader() });
      const data = await res.json().catch(() => ({}));
      const rid = res.headers.get('x-request-id');
      setLastDiag({
        endpoint: 'lookup',
        status: res.status,
        requestId: rid,
        message: data?.message || data?.error || null,
        url: url.toString(),
      });
      if (!res.ok || data?.ok !== true) {
        console.error('[AdminUsers] Lookup request failed', {
          status: res.status,
          requestId: rid,
          message: data?.message || data?.error,
          url: url.toString(),
        });
        throw new Error(`${data?.message || data?.error || 'Failed to load users'}${rid ? ` (requestId: ${rid})` : ''}`);
      }
      setRows(Array.isArray(data.users) ? data.users : []);
      setNextCursor(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activityFilter, authHeader, cursor, hasDirectory, isAdmin, query, riskFilter, roleFilter, sort, statusFilter, user, verificationFilter]);

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!user || !isAdmin) return;
    // Support deep links like /dashboard/admin/users?uid=... or ?q=...
    try {
      const url = new URL(window.location.href);
      const uidParam = url.searchParams.get('uid');
      const qParam = url.searchParams.get('q');
      const initial = String(uidParam || qParam || '').trim();
      if (initial) {
        setQuery(initial);
        setCursor(null);
        setCursorStack([]);
        void load({ query: initial });
        return;
      }
    } catch {
      // ignore
    }
    void load({ query: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, adminLoading, user?.uid, isAdmin]);

  const handleOpenRole = useCallback((row: AdminUserRow) => {
    setRoleTarget(row);
    setNextRole((row.role || 'user') as any);
    setReason('');
    setRoleDialogOpen(true);
  }, []);

  const handleSetRole = useCallback(async () => {
    if (!user || !roleTarget) return;
    const r = reason.trim();
    if (!r) {
      toast({ title: 'Reason required', description: 'Please add a short reason for the role change.', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${roleTarget.uid}/set-role`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ role: nextRole, reason: r }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.message || data?.error || 'Failed to set role');
      }
      toast({ title: 'Role updated', description: `${roleTarget.email || roleTarget.uid} is now ${nextRole}.` });
      setRoleDialogOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Could not update role', variant: 'destructive' });
    }
  }, [authHeader, load, nextRole, reason, roleTarget, toast, user]);

  const setDisabled = useCallback(async (row: AdminUserRow, disabled: boolean) => {
    if (!user) return;
    const r = `Support action: ${disabled ? 'disable' : 'enable'} account`;
    try {
      const res = await fetch(`/api/admin/users/${row.uid}/set-disabled`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ disabled, reason: r }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.message || data?.error || 'Failed to update user');
      toast({ title: disabled ? 'User disabled' : 'User enabled', description: row.email || row.uid });
      await load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Could not update user', variant: 'destructive' });
    }
  }, [authHeader, load, toast, user]);

  const sendVerificationEmail = useCallback(async () => {
    if (!user || !sendVerifyTarget) return;
    const r = sendVerifyReason.trim();
    if (!r) {
      toast({ title: 'Reason required', description: 'Please add a short reason.', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${sendVerifyTarget.uid}/send-verification-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ reason: r }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.message || data?.error || 'Failed to send verification email');
      }
      toast({
        title: data?.alreadyVerified ? 'Already verified' : 'Verification email sent',
        description: data?.email ? `Sent to ${data.email}.` : 'Sent.',
      });
      setSendVerifyDialogOpen(false);
      setSendVerifyTarget(null);
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Could not send verification email', variant: 'destructive' });
    }
  }, [authHeader, sendVerifyReason, sendVerifyTarget, toast, user]);

  const passwordResetLink = useCallback(async (row: AdminUserRow) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/admin/users/${row.uid}/password-reset-link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ reason: 'Support: password reset link requested' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.message || data?.error || 'Failed to generate reset link');
      const link = String(data.link || '');
      if (!link) throw new Error('No link returned');
      const copied = await safeCopy(link);
      toast({
        title: 'Password reset link generated',
        description: copied ? 'Copied to clipboard.' : 'Copy it from the response.',
      });
      if (!copied) {
        void safeCopy(link);
      }
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message || 'Could not generate reset link', variant: 'destructive' });
    }
  }, [authHeader, toast, user]);

  const filtered = useMemo(() => rows, [rows]);
  const stats = useMemo(() => {
    const total = filtered.length;
    const admins = filtered.filter((r) => r.role === 'admin' || r.role === 'super_admin').length;
    const disabled = filtered.filter((r) => r.disabled).length;
    const highRisk = filtered.filter((r) => r.risk?.label === 'high').length;
    const stripeLinked = filtered.filter((r) => !!r.stripeAccountId).length;
    return { total, admins, disabled, highRisk, stripeLinked };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">User Management</h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Search, support, and manage user accounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => load()} disabled={loading || !isAdmin}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        </div>

        {!adminLoading && !isAdmin && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>Admin access required.</AlertDescription>
          </Alert>
        )}

        <Card className="border-2 border-border/50 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-lg">Lookup</CardTitle>
                <CardDescription>Search by email, uid, phone (token), or name token. Use filters for faster triage.</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <span className="rounded-full border bg-muted/30 px-2 py-1">Results: {stats.total}</span>
                <span className="rounded-full border bg-muted/30 px-2 py-1">Admins: {stats.admins}</span>
                <span className="rounded-full border bg-muted/30 px-2 py-1">Disabled: {stats.disabled}</span>
                <span className="rounded-full border bg-muted/30 px-2 py-1">Stripe linked: {stats.stripeLinked}</span>
                {stats.highRisk ? <span className="rounded-full border bg-destructive/10 text-destructive px-2 py-1">High risk: {stats.highRisk}</span> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by email, uid, phone, name…"
                  className="pl-9 min-h-[44px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void load();
                  }}
                />
              </div>
              <Button onClick={() => load()} disabled={loading || !isAdmin} className="min-h-[44px] font-semibold">
                Search
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setCursor(null);
                  setCursorStack([]);
                  void load({ query: '' });
                }}
                disabled={loading || !isAdmin}
                className="min-h-[44px] font-semibold"
              >
                Clear
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Role: Any</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="super_admin">Super admin</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Status: Any</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
              <Select value={verificationFilter} onValueChange={(v: any) => setVerificationFilter(v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Verification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Verification: Any</SelectItem>
                  <SelectItem value="identityVerified">Identity verified</SelectItem>
                  <SelectItem value="sellerVerified">Seller verified</SelectItem>
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={(v: any) => setRiskFilter(v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Risk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Risk: Any</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="med">Med</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v: any) => setSort(v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Sort: Newest</SelectItem>
                  <SelectItem value="last_activity">Sort: Last activity</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isSuperAdmin && (
              <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-muted/20 p-3">
                <div className="text-sm text-muted-foreground">
                  If results are empty, backfill <span className="font-mono">userSummaries</span> (batched).
                </div>
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/admin/users/summaries/backfill', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', ...(await authHeader()) },
                        body: JSON.stringify({ limit: 25 }),
                      });
                      const d = await res.json().catch(() => ({}));
                      if (!res.ok || d?.ok !== true) throw new Error(d?.message || d?.error || 'Backfill failed');
                      toast({ title: 'Backfill queued', description: `Updated ${d.updated || 0} summaries.` });
                      setHasDirectory(true);
                      setCursor(null);
                      setCursorStack([]);
                      void load({ query: query });
                    } catch (e: any) {
                      toast({ title: 'Backfill failed', description: e?.message || 'Please try again.', variant: 'destructive' });
                    }
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Backfill summaries (25)
                </Button>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="space-y-2">
                  <div>{error}</div>
                  {lastDiag ? (
                    <div className="text-xs text-muted-foreground">
                      Last request: <span className="font-mono">{lastDiag.endpoint}</span> · HTTP {lastDiag.status}
                      {lastDiag.requestId ? (
                        <>
                          {' '}
                          · requestId: <span className="font-mono">{lastDiag.requestId}</span>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Seller Tier</TableHead>
                    <TableHead className="hidden lg:table-cell">Stripe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden xl:table-cell">Last activity</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="py-10 flex items-center justify-center text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          Loading…
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="py-10 text-center text-muted-foreground">No users found.</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.uid}>
                        <TableCell className="min-w-[280px]">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 border">
                              <AvatarImage src={r.photoURL || ''} alt={r.displayName || r.email || r.uid} />
                              <AvatarFallback className="text-xs font-semibold">
                                {initials(r.displayName || r.email || r.uid)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="font-semibold text-foreground truncate">{r.displayName || '—'}</div>
                                {r.email ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={async () => {
                                      const ok = await safeCopy(r.email || '');
                                      toast({ title: ok ? 'Copied' : 'Copy failed', description: ok ? 'Email copied.' : 'Could not copy email.' });
                                    }}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                    <span className="sr-only">Copy email</span>
                                  </Button>
                                ) : null}
                              </div>
                              <div className="text-sm text-muted-foreground truncate">{r.email || r.uid}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                <span className="font-mono truncate">UID: {r.uid}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  onClick={async () => {
                                    const ok = await safeCopy(r.uid);
                                    toast({ title: ok ? 'Copied' : 'Copy failed', description: ok ? 'UID copied.' : 'Could not copy UID.' });
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  <span className="sr-only">Copy UID</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{roleBadge(r.role)}</TableCell>
                        <TableCell>{tierBadge((r.subscriptionTier || 'standard') as any, (r.adminPlanOverride || null) as any)}</TableCell>
                        <TableCell className="hidden lg:table-cell whitespace-nowrap">
                          {r.stripeAccountId ? (
                            <Badge className="bg-sky-500 text-sky-950 whitespace-nowrap">Stripe linked</Badge>
                          ) : (
                            <Badge variant="outline" className="whitespace-nowrap">Not linked</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            {r.disabled ? (
                              <Badge variant="destructive">Disabled</Badge>
                            ) : (
                              <Badge variant="outline">Active</Badge>
                            )}
                            {r.emailVerified ? (
                              <Badge className="bg-emerald-500 text-emerald-950">Email verified</Badge>
                            ) : (
                              <Badge variant="secondary">Email unverified</Badge>
                            )}
                            {r.risk?.label ? (
                              <Badge variant={r.risk.label === 'high' ? 'destructive' : r.risk.label === 'med' ? 'secondary' : 'outline'}>
                                Risk: {r.risk.label}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <div className="text-sm font-medium">{formatRelative(toDateSafe(r.lastSignInAt))}</div>
                          <div className="text-xs text-muted-foreground">Created {formatRelative(toDateSafe(r.createdAt))}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-9 w-9">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onSelect={async (e) => {
                                  e.preventDefault();
                                  const ok = await safeCopy(r.uid);
                                  toast({ title: ok ? 'Copied' : 'Copy failed', description: ok ? 'UID copied.' : 'Could not copy UID.' });
                                }}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Copy UID
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  if (!isSuperAdmin) {
                                    toast({ title: 'Super admin required', description: 'Role changes require super admin.', variant: 'destructive' });
                                    return;
                                  }
                                  handleOpenRole(r);
                                }}
                              >
                                <ShieldAlert className="h-4 w-4 mr-2" />
                                Set role…
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/admin/users/${r.uid}`}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  View dossier
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  void passwordResetLink(r);
                                }}
                              >
                                <KeyRound className="h-4 w-4 mr-2" />
                                Generate password reset link
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setSendVerifyTarget(r);
                                  setSendVerifyReason('Support: resend verification email');
                                  setSendVerifyDialogOpen(true);
                                }}
                                disabled={r.emailVerified === true}
                              >
                                <KeyRound className="h-4 w-4 mr-2" />
                                Send verification email
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {r.disabled ? (
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    void setDisabled(r, false);
                                  }}
                                >
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Enable user
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className={cn('text-destructive focus:text-destructive')}
                                  onSelect={(e) => {
                                    e.preventDefault();
                                    void setDisabled(r, true);
                                  }}
                                >
                                  <UserX className="h-4 w-4 mr-2" />
                                  Disable user
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem asChild>
                                <a href={`/pricing?plan=${r.subscriptionTier || 'standard'}`} target="_blank" rel="noreferrer">
                                  Open pricing (tiers)
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={`/dashboard/admin/users?uid=${r.uid}`} target="_self" rel="noreferrer">
                                  (Deep link) This user
                                </a>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {hasDirectory && (
              <div className="flex items-center justify-between gap-2 pt-4">
                <Button
                  variant="outline"
                  disabled={loading || cursorStack.length === 0}
                  onClick={() => {
                    const prev = cursorStack[cursorStack.length - 1];
                    setCursor(prev || null);
                    setCursorStack((s) => s.slice(0, -1));
                    void load();
                  }}
                >
                  Previous
                </Button>
                <div className="text-xs text-muted-foreground">Page size: 25</div>
                <Button
                  variant="outline"
                  disabled={loading || !nextCursor}
                  onClick={() => {
                    if (!nextCursor) return;
                    setCursorStack((s) => [...s, cursor || '']);
                    setCursor(nextCursor);
                    void load();
                  }}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Set role</DialogTitle>
              <DialogDescription>
                This updates both Firestore role and Firebase Auth custom claims.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-semibold text-foreground">{roleTarget?.email || roleTarget?.uid || 'User'}</div>
                <div className="text-xs text-muted-foreground">UID: {roleTarget?.uid}</div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</div>
                <Select value={nextRole} onValueChange={(v) => setNextRole(v as any)}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</div>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g., Support escalation" className="h-11" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSetRole} className="font-semibold">
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={sendVerifyDialogOpen} onOpenChange={setSendVerifyDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Send verification email</DialogTitle>
              <DialogDescription>
                Sends a verification link to the user’s email using the configured email provider (Brevo/Resend).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-semibold text-foreground">{sendVerifyTarget?.email || sendVerifyTarget?.uid || 'User'}</div>
                <div className="text-xs text-muted-foreground">UID: {sendVerifyTarget?.uid}</div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</div>
                <Input value={sendVerifyReason} onChange={(e) => setSendVerifyReason(e.target.value)} className="h-11" />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setSendVerifyDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void sendVerificationEmail()} className="font-semibold">
                Send email
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

