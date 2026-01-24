'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
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
  Award,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getPublicSellerTrust, getUserProfile, updateUserProfile } from '@/lib/firebase/users';
import { listSellerListings } from '@/lib/firebase/listings';
import { getOrdersForUser } from '@/lib/firebase/orders';
import { PublicSellerTrust, UserProfile } from '@/lib/types';
import { setCurrentUserAvatarUrl, uploadUserAvatar } from '@/lib/firebase/profile-media';
import { NotificationPreferencesPanel } from '@/components/settings/NotificationPreferencesPanel';
import { NotificationSettingsDialog } from '@/components/settings/NotificationSettingsDialog';
import { AvatarCropDialog, type AvatarCropResult } from '@/components/profile/AvatarCropDialog';
import { auth } from '@/lib/firebase/config';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { reloadCurrentUser, resendVerificationEmail, resetPassword } from '@/lib/firebase/auth';
import { SellerTrustBadges } from '@/components/seller/SellerTrustBadges';
import { computePublicSellerTrustFromUser } from '@/lib/seller/badges';

export default function AccountPage() {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'preferences'>('profile');
  const [saving, setSaving] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [publicTrust, setPublicTrust] = useState<PublicSellerTrust | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadPct, setAvatarUploadPct] = useState(0);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [stats, setStats] = useState({
    totalListings: 0,
    activeSales: 0,
    totalRevenue: 0,
    responseRate: 0,
  });

  // Initialize form data from user profile
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    businessName: '',
    bio: '',
    location: {
      city: '',
      state: '',
      zip: '',
      address: ''
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
      transport: true,
      displayNamePreference: 'personal' as 'personal' | 'business',
    }
  });

  // Fetch user profile and stats
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const profile = await getUserProfile(user.uid);
        setUserProfile(profile);
        // Public trust badges are server-authored; load them (best-effort).
        const trust = await getPublicSellerTrust(user.uid).catch(() => null);
        setPublicTrust(trust);

        if (profile) {
          // Initialize form data from profile
          setFormData({
            fullName: profile.profile?.fullName || profile.displayName || '',
            email: profile.email || '',
            phone: profile.phoneNumber || '',
            businessName: profile.profile?.businessName || '',
            bio: profile.profile?.bio || '',
            location: {
              city: profile.profile?.location?.city || '',
              state: profile.profile?.location?.state || '',
              zip: profile.profile?.location?.zip || '',
              address: profile.profile?.location?.address || '',
            },
            notifications: profile.profile?.notifications || {
              email: true,
              sms: false,
              bids: true,
              messages: true,
              promotions: false,
            },
            preferences: {
              verification: profile.profile?.preferences?.verification ?? true,
              transport: profile.profile?.preferences?.transport ?? true,
              displayNamePreference: profile.profile?.preferences?.displayNamePreference || 'personal',
            },
          });

          // Calculate stats
          const [listings, salesOrders] = await Promise.all([
            listSellerListings(user.uid),
            getOrdersForUser(user.uid, 'seller'),
          ]);

          const activeListings = listings.filter((l) => l.status === 'active').length;
          const activeSales = salesOrders.filter((o) => o.status === 'paid' || o.status === 'completed').length;
          const totalRevenue = salesOrders
            .filter((o) => o.status === 'paid' || o.status === 'completed')
            .reduce((sum, o) => sum + (o.sellerAmount || o.amount - o.platformFee), 0);

          setStats({
            totalListings: listings.length,
            activeSales,
            totalRevenue,
            responseRate: 0, // TODO: Calculate from message response times
          });
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
        toast({
          title: 'Error loading profile',
          description: err instanceof Error ? err.message : 'Failed to load your profile data.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchUserData();
    }
  }, [user, authLoading, toast]);

  const derivedBadgeIds = useMemo(() => {
    if (!user || !userProfile) return [];
    // If the server-authored trust doc exists, prefer it.
    if (publicTrust?.badgeIds?.length) return publicTrust.badgeIds;
    // Fallback: derive from your own profile fields (still useful during onboarding).
    const derived = computePublicSellerTrustFromUser({
      userId: user.uid,
      userDoc: userProfile,
      stripe: {
        onboardingStatus: userProfile.stripeOnboardingStatus || 'not_started',
        chargesEnabled: userProfile.chargesEnabled === true,
        payoutsEnabled: userProfile.payoutsEnabled === true,
        detailsSubmitted: userProfile.stripeDetailsSubmitted === true,
        // Unknown client-side; be conservative so we don't incorrectly show "Verified seller".
        hasPendingRequirements: true,
      },
      tpwdBreederPermit: publicTrust?.tpwdBreederPermit
        ? {
            status: publicTrust.tpwdBreederPermit.status,
            expiresAt: publicTrust.tpwdBreederPermit.expiresAt || null,
          }
        : undefined,
    });
    return derived.badgeIds;
  }, [publicTrust?.badgeIds, publicTrust?.tpwdBreederPermit, user, userProfile]);

  // If the user returns from a verification link with verified=1, refresh auth state and sync Firestore.
  useEffect(() => {
    const verified = searchParams?.get('verified');
    if (!user || authLoading) return;
    if (verified !== '1') return;

    (async () => {
      try {
        await reloadCurrentUser();
        // Best-effort: sync Firestore for dashboard gating and server checks.
        await updateUserProfile(user.uid, { emailVerified: auth.currentUser?.emailVerified === true } as any);
        toast({
          title: auth.currentUser?.emailVerified ? 'Email verified' : 'Verification pending',
          description: auth.currentUser?.emailVerified
            ? 'Thanks — your email is verified.'
            : 'If you just verified, wait a moment and refresh again.',
        });
      } catch (e: any) {
        toast({ title: 'Could not refresh account', description: e?.message || 'Please try again.', variant: 'destructive' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.uid, authLoading]);

  const hasPasswordProvider = useMemo(() => {
    const providers = user?.providerData || [];
    return providers.some((p) => p?.providerId === 'password');
  }, [user?.providerData]);

  const handleUpdatePassword = async () => {
    if (!user) return;

    // If user doesn't have password provider (Google, etc.), guide them to reset flow.
    if (!hasPasswordProvider) {
      try {
        if (!user.email) throw new Error('No email available for password reset.');
        await resetPassword(user.email);
        toast({
          title: 'Password reset email sent',
          description: 'Check your inbox for a link to set a password.',
        });
      } catch (e: any) {
        toast({
          title: 'Couldn’t send reset email',
          description: e?.message || 'Please try again.',
          variant: 'destructive',
        });
      }
      return;
    }

    // Validate inputs
    const current = String(pwCurrent || '');
    const next = String(pwNext || '');
    const confirm = String(pwConfirm || '');

    if (!current.trim()) {
      toast({ title: 'Current password required', description: 'Enter your current password to continue.', variant: 'destructive' });
      return;
    }
    if (next.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (next !== confirm) {
      toast({ title: 'Passwords do not match', description: 'Confirm password must match.', variant: 'destructive' });
      return;
    }

    setPwSaving(true);
    try {
      const u = auth.currentUser;
      if (!u || !u.email) throw new Error('No authenticated user found.');

      // Re-authenticate (security best practice; Firebase often requires it).
      const cred = EmailAuthProvider.credential(u.email, current);
      await reauthenticateWithCredential(u, cred);

      await updatePassword(u, next);

      setPwCurrent('');
      setPwNext('');
      setPwConfirm('');

      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
    } catch (e: any) {
      const code = String(e?.code || '');
      const msg = String(e?.message || '');

      if (code.includes('auth/wrong-password')) {
        toast({ title: 'Wrong password', description: 'Your current password is incorrect.', variant: 'destructive' });
      } else if (code.includes('auth/too-many-requests')) {
        toast({ title: 'Too many attempts', description: 'Please wait a bit and try again.', variant: 'destructive' });
      } else if (code.includes('auth/requires-recent-login')) {
        toast({
          title: 'Please re-authenticate',
          description: 'For security, please sign out and sign back in, then try again.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Update failed', description: msg || 'Could not update password.', variant: 'destructive' });
      }
    } finally {
      setPwSaving(false);
    }
  };

  const handleSave = async () => {
    if (!user || !userProfile) return;

    try {
      setSaving(true);
      
      // Check if displayNamePreference or businessName changed
      const oldPreference = userProfile.profile?.preferences?.displayNamePreference || 'personal';
      const newPreference = formData.preferences.displayNamePreference;
      const oldBusinessName = userProfile.profile?.businessName || '';
      const newBusinessName = formData.businessName || '';
      const displayNameChanged = oldPreference !== newPreference || oldBusinessName !== newBusinessName;

      // Only send the fields we intend to update (avoid spraying the full doc back into Firestore).
      await updateUserProfile(user.uid, {
        displayName: formData.fullName,
        phoneNumber: formData.phone,
        profile: {
          ...(userProfile.profile || {
            fullName: formData.fullName,
            location: formData.location,
            notifications: formData.notifications,
            preferences: formData.preferences,
          }),
          fullName: formData.fullName,
          ...(formData.businessName ? { businessName: formData.businessName } : {}),
          ...(formData.bio ? { bio: formData.bio } : {}),
          location: formData.location,
          notifications: formData.notifications,
          preferences: formData.preferences,
        },
      } as any);

      // If display name preference or business name changed, update existing listings
      if (displayNameChanged) {
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/listings/update-seller-snapshots', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });
          const result = await response.json();
          if (result.ok && result.updated > 0) {
            toast({
              title: 'Listings updated',
              description: `Updated ${result.updated} listing${result.updated !== 1 ? 's' : ''} with your ${formData.preferences.displayNamePreference === 'business' ? 'business' : 'personal'} name.`,
            });
          } else if (result.ok && result.updated === 0) {
            // No listings to update - this is fine, just don't show a toast
          }
        } catch (e) {
          // Non-blocking: log but don't fail the profile save
          console.warn('Failed to update listing snapshots:', e);
        }
      }

      setIsEditing(false);
      toast({
        title: 'Profile updated',
        description: 'Your account information has been saved successfully.',
      });
    } catch (err) {
      console.error('Error saving profile:', err);
      toast({
        title: 'Error saving profile',
        description: err instanceof Error ? err.message : 'Failed to save your profile.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset form data to user profile
    if (userProfile) {
      setFormData({
        fullName: userProfile.profile?.fullName || userProfile.displayName || '',
        email: userProfile.email || '',
        phone: userProfile.phoneNumber || '',
        businessName: userProfile.profile?.businessName || '',
        bio: userProfile.profile?.bio || '',
        location: {
          city: userProfile.profile?.location?.city || '',
          state: userProfile.profile?.location?.state || '',
          zip: userProfile.profile?.location?.zip || '',
          address: userProfile.profile?.location?.address || '',
        },
        notifications: userProfile.profile?.notifications || {
          email: true,
          sms: false,
          bids: true,
          messages: true,
          promotions: false,
        },
        preferences: {
          verification: userProfile.profile?.preferences?.verification ?? true,
          transport: userProfile.profile?.preferences?.transport ?? true,
          displayNamePreference: userProfile.profile?.preferences?.displayNamePreference || 'personal',
        },
      });
    }
    setIsEditing(false);
    toast({
      title: 'Changes cancelled',
      description: 'Your changes have been discarded.',
    });
  };

  const handlePickAvatar = async (file: File) => {
    if (!file) return;
    if (!user?.uid) return;

    // Show crop dialog first
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        setCropImageSrc(result);
        setCropDialogOpen(true);
      }
    };
    reader.onerror = () => {
      toast({
        title: 'Failed to read image',
        description: 'Could not load the selected image. Please try again.',
        variant: 'destructive',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCropSave = async (result: AvatarCropResult) => {
    if (!user?.uid) return;
    setCropDialogOpen(false);

    try {
      setAvatarUploading(true);
      setAvatarUploadPct(0);

      // Upload the cropped blob
      const { downloadUrl } = await uploadUserAvatar(result.croppedImageBlob, (pct) => setAvatarUploadPct(pct));
      await setCurrentUserAvatarUrl(downloadUrl);

      // Clean up the object URL
      if (result.croppedImageUrl) {
        URL.revokeObjectURL(result.croppedImageUrl);
      }

      // Refresh local UI state (avoid waiting for a full refetch).
      setUserProfile((prev) => (prev ? ({ ...prev, photoURL: downloadUrl } as any) : prev));

      toast({
        title: 'Photo updated',
        description: 'Your profile photo/logo has been updated.',
      });
    } catch (e: any) {
      console.error('Avatar upload failed', e);
      toast({
        title: 'Upload failed',
        description: e?.message || 'Could not upload your photo. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAvatarUploading(false);
      setAvatarUploadPct(0);
      setCropImageSrc(null);
    }
  };

  const statsData = [
    { label: 'Total Listings', value: stats.totalListings.toString(), icon: Package, color: 'text-primary' },
    { label: 'Active Sales', value: stats.activeSales.toString(), icon: TrendingUp, color: 'text-primary' },
    { label: 'Total Revenue', value: `$${stats.totalRevenue.toLocaleString()}`, icon: Award, color: 'text-primary' },
    { label: 'Response Rate', value: `${stats.responseRate}%`, icon: CheckCircle2, color: 'text-primary' },
  ];

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 w-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 w-full">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Please sign in</h3>
              <p className="text-sm text-muted-foreground">You must be signed in to view your account</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6 w-full">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
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
        </motion.div>

        {/* Email verification status (hide once verified) */}
        {!user?.emailVerified ? (
          <Card className={cn('border-2', 'border-border/50 bg-card')}>
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div className="font-bold">Email verification</div>
                    <Badge variant="destructive" className="font-semibold">
                      Not verified
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Please verify your email to unlock messaging, publishing, and checkout.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="default"
                    className="min-h-[40px] font-semibold"
                    onClick={async () => {
                      try {
                        await resendVerificationEmail();
                        toast({ title: 'Verification email sent', description: 'Check your inbox (and spam folder).' });
                      } catch (e: any) {
                        toast({
                          title: 'Could not send verification email',
                          description: e?.message || 'Please try again.',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    Resend Verification Email
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Stats Cards - Quick Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {statsData.map((stat, index) => {
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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-6">
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
                <div className="flex items-start justify-between gap-4 flex-col md:flex-row">
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-6 flex-1">
                  {/* Avatar */}
                  <div className="relative group">
                    <Avatar className="h-24 w-24 md:h-32 md:w-32 border-4 border-border/50">
                      <AvatarImage src={userProfile?.photoURL || user?.photoURL || ''} alt={formData.fullName || 'Profile'} />
                      <AvatarFallback className="text-2xl md:text-3xl font-extrabold bg-primary/10 text-primary">
                        {formData.fullName.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>

                    <input
                      id="account-avatar-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      aria-label="Upload profile photo"
                      disabled={!isEditing || avatarUploading}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) await handlePickAvatar(f);
                      }}
                    />

                    {isEditing && (
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        disabled={avatarUploading}
                        onClick={() => document.getElementById('account-avatar-input')?.click()}
                        className="absolute bottom-0 right-0 h-10 w-10 rounded-full border-2 border-background bg-card shadow-lg hover:bg-background"
                        aria-label="Upload profile photo / company logo"
                        title="Upload profile photo / company logo"
                      >
                        {avatarUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
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
                      <div className="flex items-center justify-center md:justify-start gap-2 mt-2 flex-wrap">
                        <SellerTrustBadges badgeIds={derivedBadgeIds as any} />
                        {userProfile?.createdAt && (
                          <Badge variant="secondary" className="font-semibold">
                            Member since {new Date(userProfile.createdAt).getFullYear()}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                      {formData.bio}
                    </p>
                    {isEditing && avatarUploading && (
                      <div className="text-xs text-muted-foreground font-medium">
                        Uploading photo… {Math.round(avatarUploadPct)}%
                      </div>
                    )}
                  </div>
                  </div>

                  {/* Actions (kept with profile card so it's obvious what you are editing) */}
                  <div className="w-full md:w-auto flex items-center justify-center md:justify-end gap-3">
                    {isEditing ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancel}
                          className="min-h-[44px] font-semibold w-full md:w-auto"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className="min-h-[44px] font-semibold w-full md:w-auto"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save Changes'
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                        className="min-h-[44px] font-semibold gap-2 w-full md:w-auto"
                      >
                        <Settings className="h-4 w-4" />
                        Edit Profile
                      </Button>
                    )}
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

                {/* Display Name Preference - Show in Profile tab for visibility */}
                <div className="mt-6 p-4 rounded-lg border border-border/50 bg-background/50">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold text-foreground flex items-center gap-2 mb-1">
                        Use Business Name on Listings & Profile
                        {!formData.businessName && (
                          <Badge variant="outline" className="text-xs">Set business name first</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formData.businessName 
                          ? `When enabled, "${formData.businessName}" will appear instead of "${formData.fullName || 'your name'}" on listing cards and your seller profile.`
                          : 'Add a business name above to use this option.'}
                      </div>
                    </div>
                    <Switch 
                      checked={formData.preferences.displayNamePreference === 'business'}
                      onCheckedChange={async (checked) => {
                        if (!formData.businessName && checked) {
                          toast({
                            title: 'Business name required',
                            description: 'Please add a business name first.',
                            variant: 'destructive',
                          });
                          return;
                        }
                        setFormData({
                          ...formData,
                          preferences: { 
                            ...formData.preferences, 
                            displayNamePreference: checked ? 'business' : 'personal' 
                          }
                        });
                        
                        // If editing, immediately update existing listings when toggle changes
                        if (isEditing && user) {
                          try {
                            const token = await user.getIdToken();
                            const response = await fetch('/api/listings/update-seller-snapshots', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                              },
                            });
                            const result = await response.json();
                            if (result.ok && result.updated > 0) {
                              toast({
                                title: 'Listings updated',
                                description: `Updated ${result.updated} listing${result.updated !== 1 ? 's' : ''} with ${checked ? 'business' : 'personal'} name.`,
                              });
                            }
                          } catch (e) {
                            // Non-blocking - will update on save anyway
                            console.warn('Failed to update listing snapshots:', e);
                          }
                        }
                      }}
                      disabled={!formData.businessName || !isEditing}
                    />
                  </div>
                  {isEditing && formData.businessName && (
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!user) return;
                          try {
                            const token = await user.getIdToken();
                            const response = await fetch('/api/listings/update-seller-snapshots', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                              },
                            });
                            const result = await response.json();
                            if (result.ok) {
                              if (result.updated > 0) {
                                toast({
                                  title: 'Listings updated',
                                  description: `Updated ${result.updated} listing${result.updated !== 1 ? 's' : ''} with your ${formData.preferences.displayNamePreference === 'business' ? 'business' : 'personal'} name.`,
                                });
                              } else {
                                toast({
                                  title: 'No updates needed',
                                  description: 'All your listings already have the correct name.',
                                });
                              }
                            } else {
                              throw new Error(result.error || 'Failed to update');
                            }
                          } catch (e) {
                            toast({
                              title: 'Update failed',
                              description: e instanceof Error ? e.message : 'Failed to update listings. Please try again.',
                              variant: 'destructive',
                            });
                          }
                        }}
                        className="text-xs"
                      >
                        Update existing listings
                      </Button>
                    </div>
                  )}
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
                      disabled={true}
                      className="min-h-[48px] text-base bg-background"
                    />
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
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
                {!hasPasswordProvider ? (
                  <div className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
                    <div className="font-semibold text-foreground">Password management</div>
                    <div className="text-sm text-muted-foreground">
                      You signed in with a provider (e.g. Google). To set/change a password, we’ll email you a secure reset link.
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button className="min-h-[44px] font-semibold" onClick={handleUpdatePassword} disabled={pwSaving}>
                        {pwSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Send password reset email
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword" className="text-sm font-semibold">
                        Current Password
                      </Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        value={pwCurrent}
                        onChange={(e) => setPwCurrent(e.target.value)}
                        className="min-h-[48px] text-base bg-background"
                        placeholder="Enter current password"
                        autoComplete="current-password"
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
                          value={pwNext}
                          onChange={(e) => setPwNext(e.target.value)}
                          className="min-h-[48px] text-base bg-background"
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-sm font-semibold">
                          Confirm New Password
                        </Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={pwConfirm}
                          onChange={(e) => setPwConfirm(e.target.value)}
                          className="min-h-[48px] text-base bg-background"
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    <div className="pt-4 border-t border-border/50 flex items-center justify-between gap-3 flex-wrap">
                      <Button
                        className="min-h-[48px] font-semibold"
                        onClick={handleUpdatePassword}
                        disabled={pwSaving}
                      >
                        {pwSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Update Password
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-[48px] font-semibold"
                        onClick={async () => {
                          try {
                            if (!user.email) throw new Error('No email available for password reset.');
                            await resetPassword(user.email);
                            toast({ title: 'Reset email sent', description: 'Check your inbox for a secure reset link.' });
                          } catch (e: any) {
                            toast({ title: 'Couldn’t send reset email', description: e?.message || 'Please try again.', variant: 'destructive' });
                          }
                        }}
                        disabled={pwSaving}
                      >
                        Send reset email instead
                      </Button>
                    </div>
                  </>
                )}
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
                <div className="rounded-lg border border-border/50 bg-background/50 p-4">
                  <div className="font-semibold text-foreground">Coming soon</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Two-factor authentication will be added after we ship the first production payment + compliance milestone.
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50 opacity-60">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">SMS Authentication</p>
                      <p className="text-sm text-muted-foreground">Use your phone number for two-factor authentication</p>
                    </div>
                  </div>
                  <Switch disabled />
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50 opacity-60">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">Authenticator App</p>
                      <p className="text-sm text-muted-foreground">Use an authenticator app for two-factor authentication</p>
                    </div>
                  </div>
                  <Switch disabled />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6 mt-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-foreground">Notifications</div>
                <div className="text-xs text-muted-foreground">Manage email, push, quiet hours, and category alerts.</div>
              </div>
              <NotificationSettingsDialog triggerLabel="Open in modal" triggerVariant="outline" triggerSize="sm" />
            </div>
            <NotificationPreferencesPanel embedded />
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

            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="text-xl">Display Name Preference</CardTitle>
                <CardDescription>
                  Choose which name appears on your listings and seller profile
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className={`flex items-center justify-between p-4 rounded-lg border border-border/50 bg-background/50 transition-colors ${!formData.businessName ? 'opacity-60' : ''}`}>
                  <div className="flex-1">
                    <div className="font-semibold text-foreground flex items-center gap-2 mb-1">
                      Show Business Name
                      {!formData.businessName && (
                        <Badge variant="outline" className="text-xs">Set business name first</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formData.businessName 
                        ? `When enabled, your business name "${formData.businessName}" will appear instead of your personal name "${formData.fullName || 'your name'}" on listings and seller profiles.`
                        : 'Add a business name in your profile to use this option.'}
                    </div>
                  </div>
                  <Switch 
                    checked={formData.preferences.displayNamePreference === 'business'}
                    onCheckedChange={(checked) => {
                      if (!formData.businessName && checked) {
                        toast({
                          title: 'Business name required',
                          description: 'Please add a business name in your profile first.',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setFormData({
                        ...formData,
                        preferences: { 
                          ...formData.preferences, 
                          displayNamePreference: checked ? 'business' : 'personal' 
                        }
                      });
                    }}
                    disabled={!formData.businessName}
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
      
      {/* Avatar Crop Dialog */}
      {cropImageSrc && (
        <AvatarCropDialog
          open={cropDialogOpen}
          onOpenChange={setCropDialogOpen}
          imageSrc={cropImageSrc}
          onSave={handleCropSave}
        />
      )}
    </div>
  );
}
