'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterDialog } from '@/components/navigation/FilterDialog';
import type { FilterState } from '@/lib/types';
import {
  buildSavedSearchKeys,
  deleteSavedSearch,
  subscribeSavedSearches,
  upsertSavedSearch,
  type SavedSearch,
  type SavedSearchAlertFrequency,
} from '@/lib/firebase/savedSearches';
import {
  BadgeCheck,
  Bell,
  BellOff,
  BookmarkPlus,
  Copy,
  ExternalLink,
  Filter as FilterIcon,
  Mail,
  MoreHorizontal,
  Search as SearchIcon,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const defaultCriteria: FilterState = {};

type CriteriaChip = { label: string; tone?: 'strong' | 'muted' };

export function SavedSearchesPanel(props: { variant?: 'page' | 'tab' }) {
  const variant = props.variant || 'page';
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SavedSearch | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState<SavedSearch | null>(null);
  const [q, setQ] = useState('');

  // form state
  const [name, setName] = useState('');
  const [criteria, setCriteria] = useState<FilterState>(defaultCriteria);
  const [alertFrequency, setAlertFrequency] = useState<SavedSearchAlertFrequency>('instant');
  const [channels, setChannels] = useState({ inApp: true, push: true, email: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      return;
    }
    return subscribeSavedSearches(user.uid, setItems);
  }, [user?.uid]);

  const canUse = !authLoading && Boolean(user?.uid);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (criteria.type) parts.push(`Type: ${criteria.type}`);
    if (criteria.category) parts.push(`Category: ${criteria.category}`);
    if (criteria.location?.state) parts.push(`State: ${criteria.location.state}`);
    if (criteria.minPrice != null) parts.push(`Min: $${criteria.minPrice.toLocaleString()}`);
    if (criteria.maxPrice != null) parts.push(`Max: $${criteria.maxPrice.toLocaleString()}`);
    if (criteria.species?.length) parts.push(`Species: ${criteria.species.join(', ')}`);
    return parts.length ? parts.join(' • ') : 'All listings';
  }, [criteria]);

  const filteredItems = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((it) => {
      const name = String(it.name || '').toLowerCase();
      const crit = it.criteria || {};
      const critStr = [
        crit.type,
        crit.category,
        crit.location?.state,
        crit.location?.city,
        ...(crit.species || []),
        crit.minPrice != null ? `min:${crit.minPrice}` : null,
        crit.maxPrice != null ? `max:${crit.maxPrice}` : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return name.includes(qq) || critStr.includes(qq);
    });
  }, [items, q]);

  function buildBrowseUrl(c: FilterState | undefined): string {
    const params = new URLSearchParams();
    if (c?.type) params.set('type', c.type);
    if (c?.category) params.set('category', c.category);
    if (c?.location?.state) params.set('state', c.location.state);
    if (c?.location?.city) params.set('city', c.location.city);
    if (typeof c?.minPrice === 'number') params.set('minPrice', String(c.minPrice));
    if (typeof c?.maxPrice === 'number') params.set('maxPrice', String(c.maxPrice));
    if (c?.species?.length) params.set('species', c.species.join(','));
    if (c?.verifiedSeller) params.set('verifiedSeller', '1');
    if (c?.transportReady) params.set('transportReady', '1');
    if (c?.endingSoon) params.set('endingSoon', '1');
    if (c?.newlyListed) params.set('newlyListed', '1');
    if (c?.featured) params.set('featured', '1');
    const qs = params.toString();
    return `/browse${qs ? '?' + qs : ''}`;
  }

  function criteriaChips(c: FilterState | undefined): CriteriaChip[] {
    const out: CriteriaChip[] = [];
    if (!c) return [{ label: 'All listings', tone: 'muted' }];
    if (c.type) out.push({ label: c.type === 'auction' ? 'Auctions' : c.type === 'fixed' ? 'Fixed' : 'Classified', tone: 'strong' });
    if (c.category) out.push({ label: c.category.replaceAll('_', ' '), tone: 'muted' });
    if (c.location?.state) out.push({ label: c.location.state, tone: 'muted' });
    if (typeof c.minPrice === 'number' || typeof c.maxPrice === 'number') {
      const a = typeof c.minPrice === 'number' ? `$${c.minPrice.toLocaleString()}` : 'Any';
      const b = typeof c.maxPrice === 'number' ? `$${c.maxPrice.toLocaleString()}` : 'Any';
      out.push({ label: `${a}–${b}`, tone: 'muted' });
    }
    if (c.species?.length) {
      const extra = c.species.length > 2 ? ` +${c.species.length - 2}` : '';
      out.push({ label: `Species: ${c.species.slice(0, 2).join(', ')}${extra}`, tone: 'muted' });
    }
    if (c.verifiedSeller) out.push({ label: 'Verified sellers', tone: 'muted' });
    if (c.transportReady) out.push({ label: 'Transport ready', tone: 'muted' });
    if (c.endingSoon) out.push({ label: 'Ending soon', tone: 'muted' });
    if (c.newlyListed) out.push({ label: 'Newly listed', tone: 'muted' });
    if (c.featured) out.push({ label: 'Featured', tone: 'muted' });
    if (out.length === 0) out.push({ label: 'All listings', tone: 'muted' });
    return out;
  }

  function channelSummary(ch: SavedSearch['channels'] | undefined) {
    const on = { inApp: !!ch?.inApp, push: !!ch?.push, email: !!ch?.email };
    const enabled = on.inApp || on.push || on.email;
    return { enabled, on };
  }

  function openCreate() {
    setEditing(null);
    setName('My saved search');
    setCriteria(defaultCriteria);
    setAlertFrequency('instant');
    setChannels({ inApp: true, push: true, email: false });
    setOpen(true);
  }

  function openEdit(item: SavedSearch) {
    setEditing(item);
    setName(item.name || 'Saved search');
    setCriteria(item.criteria || defaultCriteria);
    setAlertFrequency(item.alertFrequency || 'instant');
    setChannels(item.channels || { inApp: true, push: true, email: false });
    setOpen(true);
  }

  async function onSave() {
    if (!user?.uid) return;
    if (!name.trim()) {
      toast({ title: 'Name required', description: 'Give your saved search a name.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await upsertSavedSearch(user.uid, {
        id: editing?.id,
        data: {
          name: name.trim(),
          criteria,
          alertFrequency,
          channels,
          lastNotifiedAt: null,
          keys: buildSavedSearchKeys(criteria),
        },
      });
      toast({ title: 'Saved', description: 'Your saved search has been updated.' });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(item: SavedSearch) {
    if (!user?.uid) return;
    try {
      await deleteSavedSearch(user.uid, item.id);
      toast({ title: 'Deleted', description: 'Saved search removed.' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
  }

  if (!canUse) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Searches</CardTitle>
          <CardDescription>Sign in to save searches and get alerts.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className={variant === 'page' ? 'container mx-auto px-4 py-6 md:py-8 max-w-5xl' : 'space-y-4'}>
      {variant === 'page' ? (
        <Card className="glass border-2 border-border/50 mb-6 overflow-hidden">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-start md:items-center justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
                    <FilterIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Saved Searches</h1>
                    <p className="text-muted-foreground">
                      Build “set-and-forget” alerts. When new listings match, we’ll notify you.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="secondary" className="font-semibold">
                    {items.length} {items.length === 1 ? 'alert' : 'alerts'}
                  </Badge>
                  <Badge variant="outline" className="font-semibold">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    On-platform notifications
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={openCreate} className="font-semibold min-h-[44px]">
                  <BookmarkPlus className="h-4 w-4 mr-2" />
                  Create alert
                </Button>
              </div>
            </div>

            <div className="mt-5 flex flex-col md:flex-row gap-3 md:items-center">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search your alerts… (name, category, state, etc.)"
                  className="pl-9 min-h-[44px]"
                />
              </div>
              <Button variant="outline" className="min-h-[44px] font-semibold" onClick={() => setQ('')} disabled={!q.trim()}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-extrabold tracking-tight">Saved Searches</div>
            <div className="text-sm text-muted-foreground">Alerts when new listings match.</div>
          </div>
          <Button size="sm" className="font-semibold" onClick={openCreate}>
            <BookmarkPlus className="h-4 w-4 mr-2" />
            New
          </Button>
        </div>
      )}

      <div className={variant === 'page' ? 'space-y-4' : 'space-y-3'}>
        {filteredItems.length === 0 && (
          <Card className="border-2 border-border/50 bg-card overflow-hidden">
            <CardContent className={cn('p-6', variant === 'tab' && 'p-5')}>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
                  <BadgeCheck className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="text-lg font-extrabold">No saved searches yet</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Create an alert with your favorite filters—then we’ll notify you when new listings match.
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Button onClick={openCreate} className="font-semibold">
                      <BookmarkPlus className="h-4 w-4 mr-2" />
                      Create alert
                    </Button>
                    <Button asChild variant="outline" className="font-semibold">
                      <Link href="/browse">Browse listings</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className={cn(variant === 'page' ? 'grid grid-cols-1 gap-4' : 'space-y-3')}>
          {filteredItems.map((item) => {
            const url = buildBrowseUrl(item.criteria);
            const chips = criteriaChips(item.criteria);
            const ch = channelSummary(item.channels);
            const paused = item.alertFrequency === 'off' || ch.enabled === false;
            return (
              <Card key={item.id} className="border-2 border-border/50 bg-card overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle className={cn('text-lg truncate', variant === 'tab' && 'text-base')}>
                        {item.name || 'Saved search'}
                      </CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">
                          Alerts: {item.alertFrequency === 'instant' ? 'Instant' : item.alertFrequency === 'daily' ? 'Daily' : item.alertFrequency === 'weekly' ? 'Weekly' : 'Off'}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">{paused ? 'Paused' : 'Active'}</span>
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" className="font-semibold">
                        <Link href={url}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-9 w-9">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              openEdit(item);
                            }}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={async (e) => {
                              e.preventDefault();
                              if (!user?.uid) return;
                              try {
                                const newId = await upsertSavedSearch(user.uid, {
                                  data: {
                                    name: `${item.name || 'Saved search'} (copy)`,
                                    criteria: item.criteria || {},
                                    alertFrequency: item.alertFrequency || 'instant',
                                    channels: item.channels || { inApp: true, push: true, email: false },
                                    lastNotifiedAt: null,
                                    keys: buildSavedSearchKeys(item.criteria || {}),
                                  },
                                });
                                toast({ title: 'Duplicated', description: `Created a copy (${newId}).` });
                              } catch (err: any) {
                                toast({ title: 'Duplicate failed', description: err?.message || 'Please try again.', variant: 'destructive' });
                              }
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={async (e) => {
                              e.preventDefault();
                              if (!user?.uid) return;
                              try {
                                await upsertSavedSearch(user.uid, {
                                  id: item.id,
                                  data: {
                                    name: item.name || 'Saved search',
                                    criteria: item.criteria || {},
                                    alertFrequency: paused ? 'instant' : 'off',
                                    channels: item.channels || { inApp: true, push: true, email: false },
                                    lastNotifiedAt: item.lastNotifiedAt || null,
                                    keys: buildSavedSearchKeys(item.criteria || {}),
                                  },
                                });
                                toast({ title: paused ? 'Resumed' : 'Paused', description: paused ? 'Alerts are back on.' : 'Alerts are paused.' });
                              } catch (err: any) {
                                toast({ title: 'Update failed', description: err?.message || 'Please try again.', variant: 'destructive' });
                              }
                            }}
                          >
                            {paused ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
                            {paused ? 'Resume alerts' : 'Pause alerts'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(e) => {
                              e.preventDefault();
                              setDeleting(item);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {chips.slice(0, variant === 'tab' ? 4 : 8).map((c, idx) => (
                      <Badge
                        key={`${c.label}-${idx}`}
                        variant={c.tone === 'strong' ? 'default' : c.tone === 'muted' ? 'outline' : 'secondary'}
                        className={cn(
                          'font-semibold',
                          c.tone === 'muted' && 'bg-background/70 backdrop-blur-sm'
                        )}
                      >
                        {c.label}
                      </Badge>
                    ))}
                    {chips.length > (variant === 'tab' ? 4 : 8) ? (
                      <Badge variant="secondary" className="font-semibold">
                        +{chips.length - (variant === 'tab' ? 4 : 8)} more
                      </Badge>
                    ) : null}
                  </div>

                  <div className="rounded-lg border border-border/50 bg-background/40 p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <FilterIcon className="h-4 w-4" />
                      <span className="line-clamp-1">{item.criteria ? 'Custom criteria' : 'All listings'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className={cn('flex items-center gap-1', item.channels?.inApp ? 'text-foreground' : 'text-muted-foreground')}>
                        <Bell className="h-4 w-4" /> In‑app
                      </div>
                      <div className={cn('flex items-center gap-1', item.channels?.push ? 'text-foreground' : 'text-muted-foreground')}>
                        <Smartphone className="h-4 w-4" /> Push
                      </div>
                      <div className={cn('flex items-center gap-1', item.channels?.email ? 'text-foreground' : 'text-muted-foreground')}>
                        <Mail className="h-4 w-4" /> Email
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit saved search' : 'Create saved search'}</DialogTitle>
            <DialogDescription>Alerts are subject to your notification preferences (Marketing is opt‑in).</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="ss-name">Name</Label>
              <Input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Criteria</Label>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="text-sm text-muted-foreground">{summary}</div>
                <FilterDialog filters={criteria} onFiltersChange={setCriteria} />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Alert frequency</Label>
                <Select value={alertFrequency} onValueChange={(v) => setAlertFrequency(v as SavedSearchAlertFrequency)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Channels</Label>
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">In‑app</span>
                    <Switch checked={channels.inApp} onCheckedChange={(c) => setChannels((p) => ({ ...p, inApp: c }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Push</span>
                    <Switch checked={channels.push} onCheckedChange={(c) => setChannels((p) => ({ ...p, push: c }))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Email</span>
                    <Switch checked={channels.email} onCheckedChange={(c) => setChannels((p) => ({ ...p, email: c }))} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving} className="font-semibold">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(v) => {
          setDeleteOpen(v);
          if (!v) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved search?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop alerts and remove the saved search permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const target = deleting;
                if (!target) return;
                await onDelete(target);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

