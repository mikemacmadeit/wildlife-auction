'use client';

import { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function SellerSettingsPage() {
  const { toast } = useToast();
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
      plan: 'Pro',
      status: 'Active',
      listingsLimit: 50,
      featuredIncluded: true,
    },
    payout: {
      method: 'bank_account',
      accountType: 'checking',
      bankName: 'Texas State Bank',
      lastFour: '1234',
    },
  });

  const handleSave = () => {
    toast({
      title: 'Settings saved',
      description: 'Your seller settings have been updated successfully.',
    });
  };

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
          <Button onClick={handleSave} className="min-h-[44px] font-semibold">
            Save Changes
          </Button>
        </div>

        <Tabs defaultValue="business" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-auto bg-card border border-border/50 p-1">
            <TabsTrigger value="business" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <Building2 className="h-4 w-4 mr-2" />
              Business
            </TabsTrigger>
            <TabsTrigger value="locations" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <MapPin className="h-4 w-4 mr-2" />
              Locations
            </TabsTrigger>
            <TabsTrigger value="notifications" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="payouts" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <CreditCard className="h-4 w-4 mr-2" />
              Payouts
            </TabsTrigger>
          </TabsList>

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

            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="text-xl">Subscription Plan</CardTitle>
                <CardDescription>
                  Current plan and features
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">{formData.subscription.plan} Plan</p>
                    <p className="text-sm text-muted-foreground">
                      {formData.subscription.listingsLimit} active listings • Featured placement included
                    </p>
                  </div>
                  <Badge variant="secondary" className="font-semibold">
                    {formData.subscription.status}
                  </Badge>
                </div>
                <Button variant="outline" className="w-full min-h-[44px] font-semibold gap-2" asChild>
                  <Link href="/pricing">
                    <CreditCard className="h-4 w-4" />
                    Manage Subscription
                  </Link>
                </Button>
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
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <CreditCard className="h-5 w-5" />
                  Payout Preferences
                </CardTitle>
                <CardDescription>
                  Manage how you receive payouts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-foreground">{formData.payout.bankName}</p>
                      <p className="text-sm text-muted-foreground">
                        {formData.payout.accountType} • •••• {formData.payout.lastFour}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="min-h-[36px] font-semibold text-xs">
                      Update
                    </Button>
                  </div>
                </div>
                <Button variant="outline" className="w-full min-h-[44px] font-semibold gap-2">
                  <CreditCard className="h-4 w-4" />
                  Add Payment Method
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
