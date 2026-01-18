'use client';

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
import { cn } from '@/lib/utils';
import { Loader2, MoreHorizontal, Search, ShieldAlert, Copy, UserX, UserCheck, KeyRound } from 'lucide-react';

type AdminUserRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  role: 'user' | 'admin' | 'super_admin' | null;
  subscriptionTier: 'standard' | 'priority' | 'premier' | null;
  adminPlanOverride: string | null;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  stripeAccountId: string | null;
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
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminUserRow | null>(null);
  const [nextRole, setNextRole] = useState<'user' | 'admin' | 'super_admin'>('user');
  const [reason, setReason] = useState('');

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
      const url = new URL('/api/admin/users/lookup', window.location.origin);
      if (q) url.searchParams.set('query', q);
      url.searchParams.set('limit', '25');
      const res = await fetch(url.toString(), { headers: await authHeader() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.message || data?.error || 'Failed to load users');
      }
      setRows(Array.isArray(data.users) ? data.users : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authHeader, isAdmin, query, user]);

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!user || !isAdmin) return;
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
            <CardTitle className="text-lg">Lookup</CardTitle>
            <CardDescription>Search by email (exact or prefix) or UID.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by email or uid…"
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
                  void load({ query: '' });
                }}
                disabled={loading || !isAdmin}
                className="min-h-[44px] font-semibold"
              >
                Clear
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-xl border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Seller Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="py-10 flex items-center justify-center text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                          Loading…
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="py-10 text-center text-muted-foreground">No users found.</div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.uid}>
                        <TableCell className="min-w-[280px]">
                          <div className="space-y-1">
                            <div className="font-semibold text-foreground">{r.displayName || '—'}</div>
                            <div className="text-sm text-muted-foreground">{r.email || r.uid}</div>
                            <div className="text-xs text-muted-foreground">UID: {r.uid}</div>
                          </div>
                        </TableCell>
                        <TableCell>{roleBadge(r.role)}</TableCell>
                        <TableCell>{tierBadge(r.subscriptionTier, r.adminPlanOverride)}</TableCell>
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
                          </div>
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
                                onSelect={(e) => {
                                  e.preventDefault();
                                  void safeCopy(r.uid);
                                  toast({ title: 'Copied', description: 'UID copied.' });
                                }}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Copy UID
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  handleOpenRole(r);
                                }}
                              >
                                <ShieldAlert className="h-4 w-4 mr-2" />
                                Set role…
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
      </div>
    </div>
  );
}

