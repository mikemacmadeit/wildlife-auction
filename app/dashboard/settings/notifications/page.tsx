/**
 * /dashboard/settings/notifications
 * User Notification Preferences
 */

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

export default function NotificationSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  const [prefs, setPrefs] = useState(() => getDefaultNotificationPreferences());

  const ref = useMemo(() => {
    if (!user?.uid) return null;
    return doc(db, 'users', user.uid, 'notificationPreferences', 'default');
  }, [user?.uid]);

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
          setPrefs(notificationPreferencesSchema.parse(snap.data() || {}));
        } else {
          setPrefs(getDefaultNotificationPreferences());
        }
      } catch {
        setPrefs(getDefaultNotificationPreferences());
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
      toast({ title: 'Saved', description: 'Notification settings updated.' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    if (!user) return;
    setPushEnabling(true);
    try {
      const token = await user.getIdToken();
      const res = await enablePushForCurrentDevice({ idToken: token, platform: 'web' });
      if (!res.ok) {
        toast({ title: 'Push not enabled', description: res.error || 'Failed to enable push.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Push enabled', description: 'This device can now receive push notifications.' });
      setPrefs((p) => ({ ...p, channels: { ...p.channels, push: true } }));
    } catch (e: any) {
      toast({ title: 'Push not enabled', description: e?.message || 'Failed to enable push.', variant: 'destructive' });
    } finally {
      setPushEnabling(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-center min-h-[360px]">
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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
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
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Notification Settings</h1>
        <p className="text-sm text-muted-foreground">
          Tune your auction alerts, transactional updates, and marketing (opt-in only).
        </p>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Delivery rules
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
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Email</span>
                  </div>
                  <Switch
                    checked={prefs.channels.email}
                    onCheckedChange={(v) => setPrefs((p) => ({ ...p, channels: { ...p.channels, email: v } }))}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Push</span>
                  </div>
                  <Switch
                    checked={prefs.channels.push}
                    onCheckedChange={(v) => setPrefs((p) => ({ ...p, channels: { ...p.channels, push: v } }))}
                  />
                </div>
                <Button variant="outline" onClick={enablePush} disabled={pushEnabling}>
                  {pushEnabling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Enable push on this device
                </Button>
                <p className="text-xs text-muted-foreground">
                  Push requires browser permission. If enabled, we’ll send auction signals faster than email.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Categories</CardTitle>
          <CardDescription>Fine-grained controls per category (marketing is opt-in only).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Auctions */}
          <div className="space-y-3">
            <div className="text-sm font-semibold">Auctions</div>
            {[
              ['watchStarted', 'Watch started'],
              ['highBidder', 'You’re winning'],
              ['outbid', 'You were outbid'],
              ['endingSoon', 'Ending soon (24h/1h/10m/2m)'],
              ['wonLost', 'Won / Lost'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
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

          {/* Orders */}
          <div className="space-y-3">
            <div className="text-sm font-semibold">Orders & Payouts</div>
            {[
              ['confirmed', 'Order confirmed'],
              ['deliveryConfirmed', 'Delivery confirmed'],
              ['deliveryCheckIn', 'Delivery check-in'],
              ['payoutReleased', 'Payout released'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
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

          {/* Onboarding */}
          <div className="space-y-3">
            <div className="text-sm font-semibold">Onboarding</div>
            {[
              ['welcome', 'Welcome'],
              ['profileIncomplete', 'Profile incomplete reminders'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Switch
                  checked={(prefs.categories.onboarding as any)[key] === true}
                  onCheckedChange={(v) =>
                    setPrefs((p) => ({
                      ...p,
                      categories: { ...p.categories, onboarding: { ...p.categories.onboarding, [key]: v } as any },
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <Separator />

          {/* Marketing */}
          <div className="space-y-3">
            <div className="text-sm font-semibold">Marketing (opt-in)</div>
            {[
              ['weeklyDigest', 'Weekly digest'],
              ['savedSearchAlerts', 'Saved search alerts'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Switch
                  checked={(prefs.categories.marketing as any)[key] === true}
                  onCheckedChange={(v) =>
                    setPrefs((p) => ({ ...p, categories: { ...p.categories, marketing: { ...p.categories.marketing, [key]: v } as any } }))
                  }
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

