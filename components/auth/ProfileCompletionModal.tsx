'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { User, Phone, MapPin, Building2, Camera, Loader2, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { updateUserProfile, getUserProfile } from '@/lib/firebase/users';
import { setCurrentUserAvatarUrl, uploadUserAvatar } from '@/lib/firebase/profile-media';
import { saveAddress } from '@/lib/firebase/addresses';
import { useAuth } from '@/hooks/use-auth';
import { reloadCurrentUser, resendVerificationEmail, sendVerificationEmailFirebaseOnly } from '@/lib/firebase/auth';
import { AvatarCropDialog, type AvatarCropResult } from '@/components/profile/AvatarCropDialog';
import { AddressSearch } from '@/components/address/AddressSearch';
import { AddressMapConfirm } from '@/components/address/AddressMapConfirm';
import type { ParsedGoogleAddress } from '@/lib/address/parseGooglePlace';

interface ProfileCompletionModalProps {
  open: boolean;
  userId: string;
  userEmail: string;
  userDisplayName?: string;
  onComplete: () => void;
}

export function ProfileCompletionModal({
  open,
  userId,
  userEmail,
  userDisplayName,
  onComplete,
}: ProfileCompletionModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadPct, setAvatarUploadPct] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [showVerifyEmailStep, setShowVerifyEmailStep] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [formData, setFormData] = useState({
    fullName: userDisplayName || '',
    phone: '',
    businessName: '',
    displayNamePreference: 'personal' as 'personal' | 'business',
    location: {
      address: '',
      city: '',
      state: 'TX',
      zip: '',
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isMapsAvailable, setIsMapsAvailable] = useState<boolean | null>(null);
  const [primaryPlace, setPrimaryPlace] = useState<ParsedGoogleAddress | null>(null);
  const [primaryMapResult, setPrimaryMapResult] = useState<{ lat: number; lng: number; formattedAddress: string } | null>(null);
  const [useManualLocation, setUseManualLocation] = useState(false);
  const [additionalAddresses, setAdditionalAddresses] = useState<(ParsedGoogleAddress | { line1: string; city: string; state: string; zip: string })[]>([]);
  const [addingAdditional, setAddingAdditional] = useState(false);

  // Check if Google Maps/Places is available (env key set)
  useEffect(() => {
    if (!open) return;
    const key =
      typeof process !== 'undefined' &&
      (process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() || process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim());
    if (key) {
      import('@/lib/google-maps/loader')
        .then((m) => m.getGoogleMapsApi())
        .then(() => setIsMapsAvailable(true))
        .catch(() => setIsMapsAvailable(false));
    } else {
      setIsMapsAvailable(false);
    }
  }, [open]);

  // Load existing profile data if available (for users with partial profiles)
  useEffect(() => {
    if (!open || !userId) return;
    
    const loadExistingProfile = async () => {
      try {
        const profile = await getUserProfile(userId);
        if (profile) {
          const loc = profile.profile?.location;
          setFormData(prev => ({
            ...prev,
            fullName: profile.profile?.fullName || prev.fullName || userDisplayName || '',
            phone: profile.phoneNumber || prev.phone,
            businessName: profile.profile?.businessName || prev.businessName,
            displayNamePreference: profile.profile?.preferences?.displayNamePreference || 'personal',
            location: {
              address: loc?.address ?? prev.location.address ?? '',
              city: loc?.city ?? prev.location.city ?? '',
              state: loc?.state ?? prev.location.state ?? 'TX',
              zip: loc?.zip ?? prev.location.zip ?? '',
            },
          }));
          if (loc?.city || loc?.state || loc?.zip) {
            setUseManualLocation(true);
          }
        }
      } catch (error) {
        // Silently fail - user can still complete profile
        console.error('Failed to load existing profile:', error);
      }
    };

    loadExistingProfile();
  }, [open, userId, userDisplayName]);

  // Update form data when userDisplayName changes
  useEffect(() => {
    if (userDisplayName && !formData.fullName) {
      setFormData(prev => ({ ...prev, fullName: userDisplayName }));
    }
  }, [userDisplayName, formData.fullName]);

  // Reset verify-email step when modal opens so we show the form first
  useEffect(() => {
    if (open) {
      setShowVerifyEmailStep(false);
      setVerificationEmailSent(false);
    }
  }, [open]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    const hasPrimaryFromPlaces = primaryPlace?.city && primaryPlace?.state && primaryPlace?.postalCode;
    const hasPrimaryManual =
      useManualLocation &&
      formData.location.city.trim() &&
      formData.location.state.trim() &&
      formData.location.zip.trim();
    if (!hasPrimaryFromPlaces && !hasPrimaryManual) {
      if (useManualLocation) {
        if (!formData.location.city.trim()) newErrors.city = 'City is required';
        if (!formData.location.state.trim()) newErrors.state = 'State is required';
        if (!formData.location.zip.trim()) newErrors.zip = 'ZIP code is required';
      } else {
        newErrors.location = 'Please select or enter your primary address';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const primaryLocationForSubmit = useCallback((): { address: string; city: string; state: string; zip: string } => {
    if (primaryPlace?.city && primaryPlace?.state && primaryPlace?.postalCode) {
      return {
        address: primaryPlace.line1 || '',
        city: primaryPlace.city,
        state: primaryPlace.state,
        zip: primaryPlace.postalCode,
      };
    }
    return {
      address: formData.location.address?.trim() || '',
      city: formData.location.city.trim(),
      state: formData.location.state.trim(),
      zip: formData.location.zip.trim(),
    };
  }, [primaryPlace, formData.location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast({
        title: 'Please fix the errors',
        description: 'Please review and correct the form errors before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const primary = primaryLocationForSubmit();
      const existing = await getUserProfile(userId);
      const prevProfile = (existing?.profile || {}) as any;

      const profilePayload: any = {
        fullName: formData.fullName.trim(),
        location: {
          address: primary.address || undefined,
          city: primary.city,
          state: primary.state,
          zip: primary.zip,
        },
        preferences: {
          ...(prevProfile?.preferences ?? { verification: true, transport: true }),
          verification: true,
          transport: true,
          displayNamePreference: formData.displayNamePreference,
        },
        notifications: prevProfile?.notifications ?? {
          email: true,
          sms: false,
          bids: true,
          messages: true,
          promotions: false,
        },
      };
      if (formData.businessName?.trim()) {
        profilePayload.businessName = formData.businessName.trim();
      }

      const updates: any = {
        profileComplete: true,
        displayName: formData.fullName.trim(),
        phoneNumber: formData.phone.trim(),
        profile: profilePayload,
      };

      await updateUserProfile(userId, updates);

      // Save primary location as default address (for checkout and consistency)
      const primaryPlaceToSave = primaryPlace?.city && primaryPlace?.state && primaryPlace?.postalCode ? primaryPlace : null;
      const mapResult = primaryMapResult;
      await saveAddress(
        userId,
        {
          label: 'Primary',
          isDefault: true,
          formattedAddress:
            mapResult?.formattedAddress ||
            primaryPlaceToSave?.formattedAddress ||
            [primary.address, [primary.city, primary.state].filter(Boolean).join(', '), primary.zip].filter(Boolean).join(', '),
          line1: primary.address || primaryPlaceToSave?.line1 || 'Address',
          line2: primaryPlaceToSave?.line2,
          city: primary.city,
          state: primary.state,
          postalCode: primary.zip,
          country: primaryPlaceToSave?.country || 'US',
          lat: mapResult?.lat ?? primaryPlaceToSave?.lat ?? 0,
          lng: mapResult?.lng ?? primaryPlaceToSave?.lng ?? 0,
          provider: primaryPlaceToSave ? 'google' : 'manual',
          placeId: primaryPlaceToSave?.placeId ?? '',
        },
        { makeDefault: true }
      );

      for (let i = 0; i < additionalAddresses.length; i++) {
        const addr = additionalAddresses[i];
        const isPlaces = 'placeId' in addr && addr.placeId;
        await saveAddress(
          userId,
          isPlaces
            ? {
                label: `Address ${i + 2}`,
                isDefault: false,
                formattedAddress: addr.formattedAddress,
                line1: addr.line1,
                line2: addr.line2,
                city: addr.city,
                state: addr.state,
                postalCode: addr.postalCode,
                country: addr.country,
                lat: addr.lat,
                lng: addr.lng,
                provider: 'google',
                placeId: addr.placeId,
              }
            : {
                label: `Address ${i + 2}`,
                isDefault: false,
                formattedAddress: [addr.line1, [addr.city, addr.state].filter(Boolean).join(', '), 'zip' in addr ? addr.zip : addr.postalCode].filter(Boolean).join(', '),
                line1: addr.line1 || 'Address',
                city: addr.city,
                state: addr.state,
                postalCode: 'zip' in addr ? addr.zip : addr.postalCode,
                country: 'US',
                lat: 0,
                lng: 0,
                provider: 'manual',
                placeId: '',
              },
          { makeDefault: false }
        );
      }

      const verify = await getUserProfile(userId);
      const v = verify?.profile;
      const ok =
        !!verify?.phoneNumber?.trim() &&
        !!v?.fullName?.trim() &&
        !!v?.location?.city?.trim() &&
        !!v?.location?.state?.trim() &&
        !!v?.location?.zip?.trim();
      if (!ok) {
        throw new Error('We couldn\'t verify your profile was saved. Please try again.');
      }

      if (avatarUrl) {
        await setCurrentUserAvatarUrl(avatarUrl);
      }

      toast({
        title: 'Profile updated successfully!',
        description: 'Your profile has been completed.',
      });

      // Show verify-email step instead of closing (smoother flow: send email then continue)
      setShowVerifyEmailStep(true);
    } catch (error: any) {
      console.error('Profile update failed:', error);
      toast({
        title: 'Profile update failed',
        description: error?.message || 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[500px]">
        {showVerifyEmailStep ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-extrabold">
                {verificationEmailSent ? 'Check your email' : 'Thanks for completing your profile'}
              </DialogTitle>
              <DialogDescription className="text-base pt-2">
                {verificationEmailSent ? (
                  <>
                    We sent a verification link to <span className="font-semibold text-foreground">{userEmail}</span>.
                    Check your inbox and spam folder. Click the link in the email to verify. You can send again below if you didn&apos;t get it.
                  </>
                ) : (
                  <>
                    Next we need to verify your email address. We&apos;ll send a link to{' '}
                    <span className="font-semibold text-foreground">{userEmail}</span>. Click the button below to send the email, then check your inbox (and spam folder).
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-6">
              {!verificationEmailSent ? (
                <Button
                  type="button"
                  variant="default"
                  className="w-full min-h-[48px] font-semibold"
                  disabled={sendingVerification}
                  onClick={async () => {
                    setSendingVerification(true);
                    try {
                      await resendVerificationEmail();
                      setVerificationEmailSent(true);
                      toast({
                        title: 'Verification email sent',
                        description: 'Check your inbox and spam folder. Click the link to verify.',
                      });
                      onComplete();
                    } catch (e: any) {
                      toast({
                        title: 'Could not send email',
                        description: e?.message || 'Please try again or use "Try Firebase email" below.',
                        variant: 'destructive',
                      });
                    } finally {
                      setSendingVerification(false);
                    }
                  }}
                >
                  {sendingVerification ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Send verification email
                </Button>
              ) : null}
              {verificationEmailSent && (
                <>
                  <Button
                    type="button"
                    variant="default"
                    className="w-full min-h-[48px] font-semibold"
                    disabled={sendingVerification}
                    onClick={async () => {
                      setSendingVerification(true);
                      try {
                        await resendVerificationEmail();
                        toast({ title: 'Sent again', description: 'Check your inbox and spam folder.' });
                      } catch (e: any) {
                        toast({ title: 'Could not send', description: e?.message || 'Try "Firebase email" below.', variant: 'destructive' });
                      } finally {
                        setSendingVerification(false);
                      }
                    }}
                  >
                    {sendingVerification ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Send again
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-[44px]"
                    disabled={sendingVerification}
                    onClick={async () => {
                      setSendingVerification(true);
                      try {
                        await sendVerificationEmailFirebaseOnly();
                        toast({ title: 'Firebase email sent', description: 'Check inbox and spam. Different sender than before.' });
                      } catch (e: any) {
                        toast({ title: 'Could not send', description: e?.message || 'Please try again.', variant: 'destructive' });
                      } finally {
                        setSendingVerification(false);
                      }
                    }}
                  >
                    Didn&apos;t get it? Try Firebase email
                  </Button>
                </>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    if (typeof window !== 'undefined') window.location.href = '/seller/overview';
                  }}
                >
                  Continue to dashboard
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  You can verify later from Account & Settings if needed.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold">
            Complete Your Profile
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            We need a few more details to get you started on Agchange.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Optional: profile photo / logo */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">Add a profile photo / company logo</div>
                <div className="text-sm text-muted-foreground">
                  Optional — helps buyers recognize you faster.
                </div>
              </div>
              <label
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-2 rounded-lg border font-semibold text-sm cursor-pointer',
                  'bg-background hover:bg-muted/30 transition-colors',
                  (avatarUploading || isLoading) && 'opacity-60 cursor-not-allowed'
                )}
              >
                {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {avatarUploading ? `${Math.round(avatarUploadPct)}%` : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={avatarUploading || isLoading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    
                    // Show crop dialog first
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const result = event.target?.result;
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
                    reader.readAsDataURL(f);
                  }}
                />
              </label>
            </div>

            {avatarUrl ? (
              <div className="flex items-center gap-4 pt-1">
                <div className="shrink-0">
                  <Avatar className="h-16 w-16 ring-2 ring-border">
                    <AvatarImage src={avatarUrl} alt="Profile preview" className="object-cover" />
                    <AvatarFallback className="text-lg font-semibold text-muted-foreground">
                      {formData.fullName?.trim()?.[0]?.toUpperCase() || userDisplayName?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-semibold text-foreground">How it looks on your profile</div>
                  <div className="text-xs text-muted-foreground">
                    You can change it later in <span className="font-semibold text-foreground/80">Account & Settings</span>.
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Personal Information */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fullName"
                type="text"
                value={formData.fullName}
                onChange={(e) => {
                  setFormData({ ...formData, fullName: e.target.value });
                  if (errors.fullName) setErrors({ ...errors, fullName: '' });
                }}
                className={cn(
                  'min-h-[48px] text-base bg-background',
                  errors.fullName && 'border-destructive focus-visible:ring-destructive'
                )}
                placeholder="John Doe"
              />
              {errors.fullName && (
                <p className="text-sm text-destructive font-medium">{errors.fullName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-sm font-semibold flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  setFormData({ ...formData, phone: e.target.value });
                  if (errors.phone) setErrors({ ...errors, phone: '' });
                }}
                className={cn(
                  'min-h-[48px] text-base bg-background',
                  errors.phone && 'border-destructive focus-visible:ring-destructive'
                )}
                placeholder="(512) 555-1234"
              />
              {errors.phone && (
                <p className="text-sm text-destructive font-medium">{errors.phone}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessName" className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Business / Ranch Name <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
              </Label>
              <Input
                id="businessName"
                type="text"
                value={formData.businessName}
                onChange={(e) => {
                  const newBusinessName = e.target.value;
                  setFormData({ 
                    ...formData, 
                    businessName: newBusinessName,
                    // Reset preference to personal if business name is cleared
                    displayNamePreference: newBusinessName.trim() ? formData.displayNamePreference : 'personal',
                  });
                }}
                className="min-h-[48px] text-base bg-background"
                placeholder="Hill Country Exotics"
              />
            </div>

            {/* Display Name Preference Toggle */}
            {formData.businessName.trim() && (
              <div className="mt-4 p-4 rounded-lg border border-border/50 bg-muted/20">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-foreground flex items-center gap-2 mb-1">
                      Show Business / Ranch Name on Listings & Profile
                    </div>
                    <div className="text-sm text-muted-foreground">
                      When enabled, &quot;{formData.businessName}&quot; will appear instead of &quot;{formData.fullName || 'your name'}&quot; on listing cards and your seller profile.
                    </div>
                  </div>
                  <Switch
                    checked={formData.displayNamePreference === 'business'}
                    onCheckedChange={(checked) => {
                      setFormData({
                        ...formData,
                        displayNamePreference: checked ? 'business' : 'personal',
                      });
                    }}
                    disabled={!formData.businessName.trim() || isLoading}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Location – primary with Maps/Places + optional additional */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Primary location
            </h3>
            <p className="text-xs text-muted-foreground">
              Used as your default address for profile and checkout. You can add more below or later in Account & Settings.
            </p>

            {errors.location && (
              <p className="text-sm text-destructive font-medium">{errors.location}</p>
            )}

            {isMapsAvailable === true && !useManualLocation && !primaryPlace && (
              <div className="space-y-2">
                <AddressSearch
                  onSelect={(addr) => setPrimaryPlace(addr)}
                  placeholder="Search for your address…"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setUseManualLocation(true)}
                >
                  Enter address manually instead
                </Button>
              </div>
            )}

            {isMapsAvailable === true && !useManualLocation && primaryPlace && !primaryMapResult && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">{primaryPlace.formattedAddress}</p>
                <AddressMapConfirm
                  lat={primaryPlace.lat}
                  lng={primaryPlace.lng}
                  formattedAddress={primaryPlace.formattedAddress}
                  onConfirm={(result) => setPrimaryMapResult(result)}
                  secondaryAction={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPrimaryMapResult({
                          lat: primaryPlace.lat,
                          lng: primaryPlace.lng,
                          formattedAddress: primaryPlace.formattedAddress,
                        });
                      }}
                    >
                      Use as-is
                    </Button>
                  }
                />
              </div>
            )}

            {isMapsAvailable === true && !useManualLocation && primaryPlace && primaryMapResult && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-sm font-medium text-foreground">{primaryMapResult.formattedAddress}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setPrimaryPlace(null);
                    setPrimaryMapResult(null);
                  }}
                >
                  Change address
                </Button>
              </div>
            )}

            {(isMapsAvailable === false || useManualLocation || isMapsAvailable === null) && (
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location-address" className="text-sm font-semibold">
                    Street address <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="location-address"
                    type="text"
                    value={formData.location.address}
                    onChange={(e) => {
                      setFormData({ ...formData, location: { ...formData.location, address: e.target.value } });
                      if (errors.city) setErrors({ ...errors, city: '' });
                    }}
                    className="min-h-[48px] text-base bg-background"
                    placeholder="123 Ranch Rd"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-sm font-semibold">
                      City <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="city"
                      type="text"
                      value={formData.location.city}
                      onChange={(e) => {
                        setFormData({ ...formData, location: { ...formData.location, city: e.target.value } });
                        if (errors.city) setErrors({ ...errors, city: '' });
                      }}
                      className={cn(
                        'min-h-[48px] text-base bg-background',
                        errors.city && 'border-destructive focus-visible:ring-destructive'
                      )}
                      placeholder="Kerrville"
                    />
                    {errors.city && <p className="text-sm text-destructive font-medium">{errors.city}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-sm font-semibold">
                      State <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="state"
                      type="text"
                      value={formData.location.state}
                      onChange={(e) => {
                        setFormData({ ...formData, location: { ...formData.location, state: e.target.value.toUpperCase() } });
                        if (errors.state) setErrors({ ...errors, state: '' });
                      }}
                      maxLength={2}
                      className={cn(
                        'min-h-[48px] text-base bg-background uppercase',
                        errors.state && 'border-destructive focus-visible:ring-destructive'
                      )}
                      placeholder="TX"
                    />
                    {errors.state && <p className="text-sm text-destructive font-medium">{errors.state}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip" className="text-sm font-semibold">
                      ZIP <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="zip"
                      type="text"
                      value={formData.location.zip}
                      onChange={(e) => {
                        setFormData({ ...formData, location: { ...formData.location, zip: e.target.value } });
                        if (errors.zip) setErrors({ ...errors, zip: '' });
                      }}
                      className={cn(
                        'min-h-[48px] text-base bg-background',
                        errors.zip && 'border-destructive focus-visible:ring-destructive'
                      )}
                      placeholder="78028"
                    />
                    {errors.zip && <p className="text-sm text-destructive font-medium">{errors.zip}</p>}
                  </div>
                </div>
              </div>
            )}

            {isMapsAvailable === true && !addingAdditional && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {!useManualLocation ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-2 border-border font-medium text-foreground hover:bg-muted/50"
                    onClick={() => setUseManualLocation(true)}
                  >
                    Enter address manually
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-2 border-border font-medium text-foreground hover:bg-muted/50"
                    onClick={() => setUseManualLocation(false)}
                  >
                    Search with address instead
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 border-2 border-border font-medium text-foreground hover:bg-muted/50"
                  onClick={() => setAddingAdditional(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add another address
                </Button>
              </div>
            )}

            {/* Additional addresses */}
            {additionalAddresses.length > 0 && (
              <div className="space-y-2 pt-6 mt-6 border-t border-border/60">
                <p className="text-sm font-semibold text-foreground">Additional addresses</p>
                {additionalAddresses.map((addr, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 p-2 text-sm">
                    <span className="text-foreground truncate">
                      {'formattedAddress' in addr ? addr.formattedAddress : [addr.line1, addr.city, addr.state, ('zip' in addr ? addr.zip : (addr as ParsedGoogleAddress).postalCode)].filter(Boolean).join(', ')}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setAdditionalAddresses((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {addingAdditional && isMapsAvailable === true && (
              <div className="rounded-lg border border-border/60 p-3 space-y-3 mt-6">
                <p className="text-sm font-semibold text-foreground">Add another address</p>
                <AddressSearch
                  onSelect={(addr) => {
                    setAdditionalAddresses((prev) => [...prev, addr]);
                    setAddingAdditional(false);
                  }}
                  placeholder="Search for another address…"
                  disabled={isLoading}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => setAddingAdditional(false)}>
                  Cancel
                </Button>
              </div>
            )}
            {isMapsAvailable === false && (
              <p className="text-xs text-muted-foreground mt-6">
                Add more addresses later in Account & Settings.
              </p>
            )}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full min-h-[52px] text-base font-semibold gap-2 shadow-lg hover:shadow-xl transition-shadow"
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Complete Profile'
            )}
          </Button>
        </form>
          </>
        )}
        </DialogContent>
      </Dialog>
      
      {/* Avatar Crop Dialog */}
      {cropImageSrc && (
        <AvatarCropDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageSrc={cropImageSrc}
        onSave={async (result: AvatarCropResult) => {
          setCropDialogOpen(false);
          try {
            setAvatarUploading(true);
            setAvatarUploadPct(0);
            const { downloadUrl } = await uploadUserAvatar(result.croppedImageBlob, (pct) => setAvatarUploadPct(pct));
            setAvatarUrl(downloadUrl);
            if (result.croppedImageUrl) {
              URL.revokeObjectURL(result.croppedImageUrl);
            }
            toast({ title: 'Photo ready', description: 'Looks good - we\'ll save it when you finish this step.' });
          } catch (err: any) {
            console.error('Avatar upload failed', err);
            toast({
              title: 'Upload failed',
              description: err?.message || 'Could not upload your photo. Please try again.',
              variant: 'destructive',
            });
          } finally {
            setAvatarUploading(false);
            setAvatarUploadPct(0);
            setCropImageSrc(null);
          }
        }}
        />
      )}
    </>
  );
}
