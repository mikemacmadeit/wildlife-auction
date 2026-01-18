'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { notificationPreferencesSchema, getDefaultNotificationPreferences } from '@/lib/notifications/preferences';
import { enablePushForCurrentDevice } from '@/lib/firebase/push';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Loader2, Bell, Mail, Smartphone, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NotificationPreferencesPanel(props: { embedded?: boolean }) {
  const { embedded = false } = props;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  const [prefs, setPrefs] = useState(() => getDefaultNotificationPreferences());
  const [savedPrefs, setSavedPrefs] = useState(() => getDefaultNotificationPreferences());
  const [savedAtMs, setSavedAtMs] = useState<number | null>(null);

  const ref = useMemo(() => {
    if (!user?.uid) return null;
    return doc(db, 'users', user.uid, 'notificationPreferences', 'default');
  }, [user?.uid]);

  const toMillisSafe = (value: any): number | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime();
      } catch {
        // ignore
      }
    }
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    return null;
  };

  const dirty = useMemo(() => JSON.stringify(prefs) !== JSON.stringify(savedPrefs), [prefs, savedPrefs]);

  useEffect(() => {
    const load = async () => {
      if (authLoading) return;
      if (!ref) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() || {};
          const parsed = notificationPreferencesSchema.parse(data);
          setPrefs(parsed);
          setSavedPrefs(parsed);
          setSavedAtMs(toMillisSafe((data as any).updatedAt));
        } else {
          const next = getDefaultNotificationPreferences();
          setPrefs(next);
          setSavedPrefs(next);
          setSavedAtMs(null);
        }
      } catch {
        const next = getDefaultNotificationPreferences();
        setPrefs(next);
        setSavedPrefs(next);
        setSavedAtMs(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [ref, authLoading]);

  const save = async () => {
    if (!ref) return;
    setSaving(true);
    try {
      const parsed = notificationPreferencesSchema.parse(prefs);
      await setDoc(ref, { ...parsed, updatedAt: serverTimestamp() }, { merge: true });
      setSavedPrefs(parsed);
      toast({ title: 'Saved', description: 'Notification settings updated.' });
      // Optimistic local "saved at" (serverTimestamp will be authoritative on next load)
      setSavedAtMs(Date.now());
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async (): Promise<boolean> => {
    if (!user) return false;
    setPushEnabling(true);
    try {
      const token = await user.getIdToken();
      const res = await enablePushForCurrentDevice({ idToken: token, platform: 'web' });
      if (!res.ok) {
        toast({ title: 'Push not enabled', description: res.error || 'Failed to enable push.', variant: 'destructive' });
        return false;
      }
      toast({ title: 'Push enabled', description: 'This device can now receive push notifications.' });
      setPrefs((p) => ({ ...p, channels: { ...p.channels, push: true } }));
      return true;
    } catch (e: any) {
      toast({ title: 'Push not enabled', description: e?.message || 'Failed to enable push.', variant: 'destructive' });
      return false;
    } finally {
      setPushEnabling(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className={embedded ? 'w-full' : 'container mx-auto px-4 py-8 max-w-4xl'}>
        <div className="flex items-center justify-center min-h-[260px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <div className="text-sm text-muted-foreground">Loading settings…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={embedded ? 'w-full' : 'container mx-auto px-4 py-8 max-w-4xl'}>
        <Card className="border-border/60">
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold mb-2">Sign in to manage notifications</h2>
              <p className="text-muted-foreground mb-6">Control email and push notifications, plus quiet hours.</p>
              <Button asChild>
                <Link href="/login">Sign In</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-6' : 'container mx-auto px-4 py-6 md:py-8 max-w-4xl space-y-6'}>
      {!embedded ? (
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Notification Settings</h1>
          <p className="text-sm text-muted-foreground">
            Tune your auction alerts, transactional updates, and marketing (opt-in only).
          </p>
        </div>
      ) : null}

      <Card className={cn(embedded ? 'border-2 border-border/50 bg-card' : 'border-border/60')}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Delivery & schedule
          </CardTitle>
          <CardDescription>Channels and quiet hours apply across all notification types.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                value={prefs.timezone}
                onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
                placeholder="America/Chicago"
              />
              <p className="text-xs text-muted-foreground">Used for quiet hours and scheduling.</p>
            </div>
            <div className="space-y-2">
              <Label>Quiet hours</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={prefs.quietHours.enabled}
                  onCheckedChange={(v) => setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, enabled: v } }))}
                />
                <span className="text-sm text-muted-foreground">{prefs.quietHours.enabled ? 'On' : 'Off'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Start hour (0-23)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={prefs.quietHours.startHour}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, startHour: Number(e.target.value) } }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End hour (0-23)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={prefs.quietHours.endHour}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, endHour: Number(e.target.value) } }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Channels</Label>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Email</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Recommended for order updates and messages.</div>
                  </div>
                  <Switch
                    checked={prefs.channels.email}
                    onCheckedChange={(v) => setPrefs((p) => ({ ...p, channels: { ...p.channels, email: v } }))}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">Push</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">Fastest alerts. Requires browser permission.</div>
                  </div>
                  <Switch
                    checked={prefs.channels.push}
                    disabled={pushEnabling}
                    onCheckedChange={async (v) => {
                      if (!v) {
                        setPrefs((p) => ({ ...p, channels: { ...p.channels, push: false } }));
                        return;
                      }
                      const ok = await enablePush();
                      if (!ok) {
                        setPrefs((p) => ({ ...p, channels: { ...p.channels, push: false } }));
                      }
                    }}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  Tip: If your browser blocks notifications, enable them in browser settings and toggle Push back on.
                </p>
              </div>
            </div>
          </div>

          <Separator />
        </CardContent>
      </Card>

      <Card className={cn(embedded ? 'border-2 border-border/50 bg-card' : 'border-border/60')}>
        <CardHeader>
          <CardTitle className="text-base">Categories</CardTitle>
          <CardDescription>Fine-grained controls per category (marketing is opt-in only).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="text-sm font-semibold">Auctions</div>
            {[
              ['watchStarted', 'Watch started'],
              ['highBidder', 'You’re winning'],
              ['outbid', 'You were outbid'],
              ['endingSoon', 'Ending soon (24h/1h/10m/2m)'],
              ['wonLost', 'Won / Lost'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <Switch
                  checked={(prefs.categories.auctions as any)[key] === true}
                  onCheckedChange={(v) =>
                    setPrefs((p) => ({ ...p, categories: { ...p.categories, auctions: { ...p.categories.auctions, [key]: v } as any } }))
                  }
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-semibold">Orders</div>
            {[
              ['confirmed', 'Order confirmed'],
              ['deliveryConfirmed', 'Delivery confirmed'],
              ['deliveryCheckIn', 'Delivery check-in reminders'],
              ['payoutReleased', 'Payout released'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <Switch
                  checked={(prefs.categories.orders as any)[key] === true}
                  onCheckedChange={(v) =>
                    setPrefs((p) => ({ ...p, categories: { ...p.categories, orders: { ...p.categories.orders, [key]: v } as any } }))
                  }
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-semibold">Messages</div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
              <span className="text-sm font-medium text-foreground">New message received</span>
              <Switch
                checked={prefs.categories.messages.messageReceived === true}
                onCheckedChange={(v) =>
                  setPrefs((p) => ({ ...p, categories: { ...p.categories, messages: { messageReceived: v } } }))
                }
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="text-sm font-semibold">Marketing (opt-in)</div>
            {[
              ['weeklyDigest', 'Weekly digest'],
              ['savedSearchAlerts', 'Saved search alerts'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <Switch
                  checked={(prefs.categories.marketing as any)[key] === true}
                  onCheckedChange={(v) =>
                    setPrefs((p) => ({
                      ...p,
                      categories: { ...p.categories, marketing: { ...p.categories.marketing, [key]: v } as any },
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">
              {dirty ? 'You have unsaved changes.' : savedAtMs ? `Saved.` : 'No changes yet.'}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving || pushEnabling || !dirty}
                onClick={() => {
                  setPrefs(savedPrefs);
                  toast({ title: 'Reverted', description: 'Changes discarded.' });
                }}
              >
                Discard changes
              </Button>
              <Button onClick={save} disabled={saving || pushEnabling || !dirty}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

