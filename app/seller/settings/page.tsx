'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  Building2,
  MapPin,
  Bell,
  CreditCard,
  Settings as SettingsIcon,
  Shield,
  Mail,
  Phone,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import { listSellerListings } from '@/lib/firebase/listings';
import { UserProfile, Listing } from '@/lib/types';
import { PlanCard } from '@/components/seller/PlanCard';
import { PayoutReadinessCard } from '@/components/seller/PayoutReadinessCard';

export default function SellerSettingsPage() {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeListings, setActiveListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch user profile and listings
  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [profile, listings] = await Promise.all([
          getUserProfile(user.uid),
          listSellerListings(user.uid),
        ]);
        setUserProfile(profile);
        setActiveListings(listings.filter((l) => l.status === 'active'));
      } catch (error: any) {
        console.error('Error fetching seller data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load seller data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchData();
    }
  }, [user, authLoading, toast]);

  const handleRefresh = async () => {
    if (user) {
      try {
        const [profile, listings] = await Promise.all([
          getUserProfile(user.uid),
          listSellerListings(user.uid),
        ]);
        setUserProfile(profile);
        setActiveListings(listings.filter((l) => l.status === 'active'));
      } catch (error: any) {
        console.error('Error refreshing seller data:', error);
      }
    }
  };

  const [formData, setFormData] = useState({
    businessName: 'Hill Country Exotics',
    ranchName: 'Hill Country Ranch',
    locations: [
      { id: '1', name: 'Main Ranch', city: 'Kerrville', state: 'TX', zip: '78028', address: '1234 Ranch Road' },
      { id: '2', name: 'North Pasture', city: 'Fredericksburg', state: 'TX', zip: '78624', address: '5678 Range Road' },
    ],
    notifications: {
      email: true,
      sms: false,
      bids: true,
      messages: true,
      sales: true,
      promotions: false,
    },
    subscription: {
      plan: 'Free',
      status: 'Active',
      listingsLimit: 3,
      featuredIncluded: false,
    },
    payout: {
      method: 'bank_account',
      accountType: 'checking',
      bankName: 'Texas State Bank',
      lastFour: '1234',
    },
  });

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
              Seller Settings
            </h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Manage your business profile, locations, and preferences
            </p>
          </div>
        </div>

        <Tabs defaultValue="billing" className="space-y-6">
          {/* Responsive tab bar: scrolls on small screens so labels never get cramped */}
          <TabsList className="w-full h-auto bg-card border border-border/50 p-1 flex gap-1 overflow-x-auto">
            <TabsTrigger
              value="billing"
              className="min-h-[44px] font-semibold data-[state=active]:bg-background whitespace-nowrap min-w-[160px] justify-center"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Seller Tiers
            </TabsTrigger>
            <TabsTrigger
              value="business"
              className="min-h-[44px] font-semibold data-[state=active]:bg-background whitespace-nowrap min-w-[140px] justify-center"
            >
              <Building2 className="h-4 w-4 mr-2" />
              Business
            </TabsTrigger>
            <TabsTrigger
              value="locations"
              className="min-h-[44px] font-semibold data-[state=active]:bg-background whitespace-nowrap min-w-[140px] justify-center"
            >
              <MapPin className="h-4 w-4 mr-2" />
              Locations
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="min-h-[44px] font-semibold data-[state=active]:bg-background whitespace-nowrap min-w-[160px] justify-center"
            >
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger
              value="payouts"
              className="min-h-[44px] font-semibold data-[state=active]:bg-background whitespace-nowrap min-w-[140px] justify-center"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Payouts
            </TabsTrigger>
          </TabsList>

          {/* Billing & Plan Tab */}
          <TabsContent value="billing" className="space-y-6 mt-6">
            {loading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ) : userProfile ? (
              <PlanCard
                userProfile={userProfile}
                activeListingsCount={activeListings.length}
                onUpdate={handleRefresh}
              />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">Unable to load plan information</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Business Profile Tab */}
          <TabsContent value="business" className="space-y-6 mt-6">
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Building2 className="h-5 w-5" />
                  Business Profile
                </CardTitle>
                <CardDescription>
                  Your business information for listings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="businessName" className="text-sm font-semibold">
                    Business Name
                  </Label>
                  <Input
                    id="businessName"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className="min-h-[48px] text-base bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ranchName" className="text-sm font-semibold">
                    Ranch / Farm Name (Optional)
                  </Label>
                  <Input
                    id="ranchName"
                    value={formData.ranchName}
                    onChange={(e) => setFormData({ ...formData, ranchName: e.target.value })}
                    className="min-h-[48px] text-base bg-background"
                  />
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          {/* Locations Tab */}
          <TabsContent value="locations" className="space-y-6 mt-6">
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <MapPin className="h-5 w-5" />
                  Ranch Locations
                </CardTitle>
                <CardDescription>
                  Manage multiple ranch locations for listings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {formData.locations.map((location) => (
                  <Card key={location.id} className="border border-border/50 bg-background/50">
                    <CardContent className="pt-6 pb-6 px-4 md:px-6">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">{location.name}</h3>
                          <p className="text-sm text-muted-foreground">{location.address}</p>
                          <p className="text-sm text-muted-foreground">
                            {location.city}, {location.state} {location.zip}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" className="min-h-[36px] font-semibold text-xs">
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button variant="outline" className="w-full min-h-[44px] font-semibold gap-2">
                  <MapPin className="h-4 w-4" />
                  Add Location
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6 mt-6">
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Bell className="h-5 w-5" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>
                  Choose how you want to be notified
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                  </div>
                  <Switch
                    checked={formData.notifications.email}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        notifications: { ...formData.notifications, email: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">SMS Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive notifications via text message</p>
                  </div>
                  <Switch
                    checked={formData.notifications.sms}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        notifications: { ...formData.notifications, sms: checked },
                      })
                    }
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">New Bids</p>
                    <p className="text-sm text-muted-foreground">Get notified when someone places a bid</p>
                  </div>
                  <Switch
                    checked={formData.notifications.bids}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        notifications: { ...formData.notifications, bids: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">Messages</p>
                    <p className="text-sm text-muted-foreground">Get notified when you receive messages</p>
                  </div>
                  <Switch
                    checked={formData.notifications.messages}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        notifications: { ...formData.notifications, messages: checked },
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">Sales Completed</p>
                    <p className="text-sm text-muted-foreground">Get notified when a sale is completed</p>
                  </div>
                  <Switch
                    checked={formData.notifications.sales}
                    onCheckedChange={(checked) =>
                      setFormData({
                        ...formData,
                        notifications: { ...formData.notifications, sales: checked },
                      })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payouts Tab */}
          <TabsContent value="payouts" className="space-y-6 mt-6">
            {loading ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ) : userProfile ? (
              <PayoutReadinessCard 
                userProfile={userProfile} 
                onRefresh={handleRefresh}
              />
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground">Unable to load payout information</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
