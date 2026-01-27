'use client';

import { useState, useEffect } from 'react';
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
import { User, Phone, MapPin, Building2, Camera, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateUserProfile, getUserProfile } from '@/lib/firebase/users';
import { setCurrentUserAvatarUrl, uploadUserAvatar } from '@/lib/firebase/profile-media';
import { useAuth } from '@/hooks/use-auth';
import { reloadCurrentUser, resendVerificationEmail } from '@/lib/firebase/auth';
import { AvatarCropDialog, type AvatarCropResult } from '@/components/profile/AvatarCropDialog';

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
  const [formData, setFormData] = useState({
    fullName: userDisplayName || '',
    phone: '',
    businessName: '',
    displayNamePreference: 'personal' as 'personal' | 'business',
    location: {
      city: '',
      state: 'TX',
      zip: '',
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load existing profile data if available (for users with partial profiles)
  useEffect(() => {
    if (!open || !userId) return;
    
    const loadExistingProfile = async () => {
      try {
        const profile = await getUserProfile(userId);
        if (profile) {
          setFormData(prev => ({
            ...prev,
            fullName: profile.profile?.fullName || prev.fullName || userDisplayName || '',
            phone: profile.phoneNumber || prev.phone,
            businessName: profile.profile?.businessName || prev.businessName,
            displayNamePreference: profile.profile?.preferences?.displayNamePreference || 'personal',
            location: {
              city: profile.profile?.location?.city || prev.location.city,
              state: profile.profile?.location?.state || prev.location.state || 'TX',
              zip: profile.profile?.location?.zip || prev.location.zip,
            },
          }));
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

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    if (!formData.location.city.trim()) {
      newErrors.city = 'City is required';
    }

    if (!formData.location.state.trim()) {
      newErrors.state = 'State is required';
    }

    if (!formData.location.zip.trim()) {
      newErrors.zip = 'ZIP code is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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
      const existing = await getUserProfile(userId);
      const prevProfile = (existing?.profile || {}) as any;

      const profilePayload: any = {
        fullName: formData.fullName.trim(),
        location: formData.location,
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

      onComplete();
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
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold">
            Complete Your Profile
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            We need a few more details to get you started on Agchange.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Email verification */}
          {user?.emailVerified !== true ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
              <div className="font-semibold">Verify your email</div>
              <div className="text-sm text-muted-foreground">
                We’ve sent a verification email to <span className="font-semibold text-foreground/80">{userEmail}</span>. Please click the button in that email to verify.
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  type="button"
                  variant="default"
                  className="sm:flex-1"
                  disabled={isLoading || avatarUploading}
                  onClick={async () => {
                    try {
                      await resendVerificationEmail();
                      toast({ title: 'Verification email sent', description: 'Check your inbox (and spam folder).' });
                    } catch (e: any) {
                      toast({ title: 'Could not send email', description: e?.message || 'Please try again.', variant: 'destructive' });
                    }
                  }}
                >
                  Resend verification email
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="sm:flex-1"
                  disabled={isLoading || avatarUploading}
                  onClick={async () => {
                    try {
                      await reloadCurrentUser();
                      toast({ title: 'Account refreshed', description: 'If you verified, your status should update now.' });
                    } catch (e: any) {
                      toast({ title: 'Refresh failed', description: e?.message || 'Please try again.', variant: 'destructive' });
                    }
                  }}
                >
                  Refresh status
                </Button>
              </div>
            </div>
          ) : null}

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
              <div className="text-xs text-muted-foreground">
                Uploaded. You can change it later in <span className="font-semibold text-foreground/80">Account & Settings</span>.
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

          {/* Location */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm font-semibold">
                  City <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="city"
                  type="text"
                  value={formData.location.city}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      location: { ...formData.location, city: e.target.value }
                    });
                    if (errors.city) setErrors({ ...errors, city: '' });
                  }}
                  className={cn(
                    'min-h-[48px] text-base bg-background',
                    errors.city && 'border-destructive focus-visible:ring-destructive'
                  )}
                  placeholder="Kerrville"
                />
                {errors.city && (
                  <p className="text-sm text-destructive font-medium">{errors.city}</p>
                )}
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
                    setFormData({ 
                      ...formData, 
                      location: { ...formData.location, state: e.target.value.toUpperCase() }
                    });
                    if (errors.state) setErrors({ ...errors, state: '' });
                  }}
                  maxLength={2}
                  className={cn(
                    'min-h-[48px] text-base bg-background uppercase',
                    errors.state && 'border-destructive focus-visible:ring-destructive'
                  )}
                  placeholder="TX"
                />
                {errors.state && (
                  <p className="text-sm text-destructive font-medium">{errors.state}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip" className="text-sm font-semibold">
                  ZIP Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="zip"
                  type="text"
                  value={formData.location.zip}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      location: { ...formData.location, zip: e.target.value }
                    });
                    if (errors.zip) setErrors({ ...errors, zip: '' });
                  }}
                  className={cn(
                    'min-h-[48px] text-base bg-background',
                    errors.zip && 'border-destructive focus-visible:ring-destructive'
                  )}
                  placeholder="78028"
                />
                {errors.zip && (
                  <p className="text-sm text-destructive font-medium">{errors.zip}</p>
                )}
              </div>
            </div>
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
