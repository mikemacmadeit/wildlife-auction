'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BottomNav } from '@/components/navigation/BottomNav';
import { 
  User, 
  Mail, 
  MapPin, 
  Phone, 
  Shield, 
  Bell, 
  CreditCard, 
  Settings, 
  Camera,
  CheckCircle2,
  Clock,
  TrendingUp,
  Package,
  FileText,
  Award
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function AccountPage() {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: 'John Doe',
    email: 'john.doe@example.com',
    phone: '(512) 555-1234',
    businessName: 'Hill Country Exotics',
    bio: 'Experienced breeder specializing in whitetail deer and exotic game. Based in Central Texas.',
    location: {
      city: 'Kerrville',
      state: 'TX',
      zip: '78028',
      address: '1234 Ranch Road'
    },
    notifications: {
      email: true,
      sms: false,
      bids: true,
      messages: true,
      promotions: false,
    },
    preferences: {
      verification: true,
      insurance: true,
      transport: true,
    }
  });

  const handleSave = () => {
    setIsEditing(false);
    toast({
      title: 'Profile updated',
      description: 'Your account information has been saved successfully.',
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    toast({
      title: 'Changes cancelled',
      description: 'Your changes have been discarded.',
    });
  };

  const stats = [
    { label: 'Total Listings', value: '12', icon: Package, color: 'text-primary' },
    { label: 'Active Sales', value: '5', icon: TrendingUp, color: 'text-primary' },
    { label: 'Total Revenue', value: '$45,000', icon: Award, color: 'text-primary' },
    { label: 'Response Rate', value: '92%', icon: CheckCircle2, color: 'text-primary' },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl space-y-6 md:space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-border/50"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
              Account & Settings
            </h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Manage your profile, preferences, and account security
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  className="min-h-[44px] font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  className="min-h-[44px] font-semibold"
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="min-h-[44px] font-semibold gap-2"
              >
                <Settings className="h-4 w-4" />
                Edit Profile
              </Button>
            )}
          </div>
        </motion.div>

        {/* Stats Cards - Quick Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className={cn(
                'border border-border/50 bg-card hover:border-border/70 transition-all',
                'hover:shadow-warm'
              )}>
                <CardContent className="pt-6 pb-4 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={cn('h-5 w-5', stat.color)} />
                    <Badge variant="secondary" className="text-xs font-semibold">
                      {stat.label.split(' ')[0]}
                    </Badge>
                  </div>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
                    {stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {stat.label}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </motion.div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-auto bg-card border border-border/50 p-1">
            <TabsTrigger value="profile" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              Profile
            </TabsTrigger>
            <TabsTrigger value="security" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              Security
            </TabsTrigger>
            <TabsTrigger value="notifications" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              Notifications
            </TabsTrigger>
            <TabsTrigger value="preferences" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              Preferences
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6 mt-6">
            {/* Profile Header Card */}
            <Card className="border-2 border-border/50 bg-card">
              <CardContent className="pt-8 pb-8 px-6">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                  {/* Avatar */}
                  <div className="relative group">
                    <Avatar className="h-24 w-24 md:h-32 md:w-32 border-4 border-border/50">
                      <AvatarImage src="/images/default-avatar.png" alt={formData.fullName} />
                      <AvatarFallback className="text-2xl md:text-3xl font-extrabold bg-primary/10 text-primary">
                        {formData.fullName.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="absolute bottom-0 right-0 h-10 w-10 rounded-full border-2 border-background bg-card shadow-lg hover:bg-background"
                      >
                        <Camera className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {/* Profile Info */}
                  <div className="flex-1 text-center md:text-left space-y-3">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
                        {formData.fullName}
                      </h2>
                      {formData.businessName && (
                        <p className="text-base text-muted-foreground font-medium">
                          {formData.businessName}
                        </p>
                      )}
                      <div className="flex items-center justify-center md:justify-start gap-2 mt-2">
                        <Badge variant="outline" className="font-semibold">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Verified Seller
                        </Badge>
                        <Badge variant="secondary" className="font-semibold">
                          Member since 2024
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                      {formData.bio}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Personal Information */}
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
                <CardDescription>
                  Update your personal details and contact information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-sm font-semibold flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Full Name
                    </Label>
                    <Input
                      id="fullName"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      disabled={!isEditing}
                      className="min-h-[48px] text-base bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessName" className="text-sm font-semibold">
                      Business / Ranch Name (Optional)
                    </Label>
                    <Input
                      id="businessName"
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      disabled={!isEditing}
                      className="min-h-[48px] text-base bg-background"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={!isEditing}
                      className="min-h-[48px] text-base bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-semibold flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      disabled={!isEditing}
                      className="min-h-[48px] text-base bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio" className="text-sm font-semibold">
                    Bio / Description
                  </Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    disabled={!isEditing}
                    className="min-h-[120px] text-base bg-background resize-none"
                    placeholder="Tell buyers about your experience, specialties, and credentials..."
                  />
                </div>
              </CardContent>
            </Card>

            {/* Location Information */}
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <MapPin className="h-5 w-5" />
                  Location
                </CardTitle>
                <CardDescription>
                  Your location helps buyers find nearby listings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-semibold">
                    Street Address (Optional)
                  </Label>
                  <Input
                    id="address"
                    value={formData.location.address}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      location: { ...formData.location, address: e.target.value }
                    })}
                    disabled={!isEditing}
                    className="min-h-[48px] text-base bg-background"
                    placeholder="1234 Ranch Road"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm font-semibold">City</Label>
                    <Input
                      id="city"
                      value={formData.location.city}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        location: { ...formData.location, city: e.target.value }
                      })}
                      disabled={!isEditing}
                      className="min-h-[48px] text-base bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-sm font-semibold">State</Label>
                    <Input
                      id="state"
                      value={formData.location.state}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        location: { ...formData.location, state: e.target.value }
                      })}
                      disabled={!isEditing}
                      maxLength={2}
                      className="min-h-[48px] text-base bg-background uppercase"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip" className="text-sm font-semibold">ZIP Code</Label>
                    <Input
                      id="zip"
                      value={formData.location.zip}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        location: { ...formData.location, zip: e.target.value }
                      })}
                      disabled={!isEditing}
                      className="min-h-[48px] text-base bg-background"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6 mt-6">
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Shield className="h-5 w-5" />
                  Password & Security
                </CardTitle>
                <CardDescription>
                  Manage your password and security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-sm font-semibold">
                    Current Password
                  </Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    className="min-h-[48px] text-base bg-background"
                    placeholder="Enter current password"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword" className="text-sm font-semibold">
                      New Password
                    </Label>
                    <Input
                      id="newPassword"
                      type="password"
                      className="min-h-[48px] text-base bg-background"
                      placeholder="Enter new password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-semibold">
                      Confirm New Password
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      className="min-h-[48px] text-base bg-background"
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <Button className="min-h-[48px] font-semibold">
                    Update Password
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="text-xl">Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">SMS Authentication</p>
                      <p className="text-sm text-muted-foreground">Use your phone number for two-factor authentication</p>
                    </div>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">Authenticator App</p>
                      <p className="text-sm text-muted-foreground">Use an authenticator app for two-factor authentication</p>
                    </div>
                  </div>
                  <Switch />
                </div>
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
                  Choose how you want to be notified about activity on your listings
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
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, email: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">SMS Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive notifications via text message</p>
                  </div>
                  <Switch 
                    checked={formData.notifications.sms}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, sms: checked }
                    })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">New Bids</p>
                    <p className="text-sm text-muted-foreground">Get notified when someone places a bid on your listings</p>
                  </div>
                  <Switch 
                    checked={formData.notifications.bids}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, bids: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">Messages</p>
                    <p className="text-sm text-muted-foreground">Get notified when you receive new messages</p>
                  </div>
                  <Switch 
                    checked={formData.notifications.messages}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, messages: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">Promotional Emails</p>
                    <p className="text-sm text-muted-foreground">Receive tips, updates, and special offers</p>
                  </div>
                  <Switch 
                    checked={formData.notifications.promotions}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      notifications: { ...formData.notifications, promotions: checked }
                    })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-6 mt-6">
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="text-xl">Listing Preferences</CardTitle>
                <CardDescription>
                  Default preferences for new listings (can be changed per listing)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">Seller Verification</p>
                    <p className="text-sm text-muted-foreground">Enable verification for your listings by default</p>
                  </div>
                  <Switch 
                    checked={formData.preferences.verification}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      preferences: { ...formData.preferences, verification: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">Insurance Available</p>
                    <p className="text-sm text-muted-foreground">Mark insurance as available by default</p>
                  </div>
                  <Switch 
                    checked={formData.preferences.insurance}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      preferences: { ...formData.preferences, insurance: checked }
                    })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50">
                  <div>
                    <p className="font-semibold text-foreground">Transport Ready</p>
                    <p className="text-sm text-muted-foreground">Mark transport as ready by default</p>
                  </div>
                  <Switch 
                    checked={formData.preferences.transport}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      preferences: { ...formData.preferences, transport: checked }
                    })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Quick Links */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <Card className="border-2 border-border/50 bg-card hover:border-primary/30 transition-all cursor-pointer group">
            <Link href="/dashboard">
              <CardContent className="pt-6 pb-6 px-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    My Listings
                  </p>
                  <p className="text-xs text-muted-foreground">View all listings</p>
                </div>
              </CardContent>
            </Link>
          </Card>
          <Card className="border-2 border-border/50 bg-card hover:border-primary/30 transition-all cursor-pointer group">
            <Link href="/dashboard/orders">
              <CardContent className="pt-6 pb-6 px-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    Orders
                  </p>
                  <p className="text-xs text-muted-foreground">View purchase history</p>
                </div>
              </CardContent>
            </Link>
          </Card>
          <Card className="border-2 border-border/50 bg-card hover:border-primary/30 transition-all cursor-pointer group">
            <Link href="/pricing">
              <CardContent className="pt-6 pb-6 px-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    Billing
                  </p>
                  <p className="text-xs text-muted-foreground">Manage subscription</p>
                </div>
              </CardContent>
            </Link>
          </Card>
        </motion.div>
      </div>

      <BottomNav />
    </div>
  );
}
