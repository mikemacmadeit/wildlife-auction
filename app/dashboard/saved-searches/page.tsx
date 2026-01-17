'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  DialogTrigger,
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
import { BookmarkPlus, Trash2 } from 'lucide-react';

const defaultCriteria: FilterState = {};

export default function SavedSearchesPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SavedSearch | null>(null);

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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Saved Searches</CardTitle>
            <CardDescription>Sign in to save searches and get alerts.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Saved Searches</h1>
          <p className="text-muted-foreground">Get smart alerts when new listings match your criteria.</p>
        </div>
        <Button onClick={openCreate}>
          <BookmarkPlus className="h-4 w-4 mr-2" />
          New Saved Search
        </Button>
      </div>

      <div className="space-y-4">
        {items.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No saved searches yet</CardTitle>
              <CardDescription>Create one to get instant or weekly alerts.</CardDescription>
            </CardHeader>
          </Card>
        )}

        {items.map((item) => (
          <Card key={item.id} className="border-2 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">{item.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {(item.criteria ? 'Custom criteria' : 'All listings')}{' '}
                    {item.alertFrequency ? `• ${item.alertFrequency}` : ''}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Channels</span>
                <span className="font-medium text-foreground">
                  {(item.channels?.inApp ? 'In‑app' : null) ||
                    (item.channels?.push ? 'Push' : null) ||
                    (item.channels?.email ? 'Email' : null) ? (
                    [item.channels?.inApp ? 'In‑app' : null, item.channels?.push ? 'Push' : null, item.channels?.email ? 'Email' : null]
                      .filter(Boolean)
                      .join(', ')
                  ) : (
                    'Off'
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
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

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

