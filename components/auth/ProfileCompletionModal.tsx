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
import { useToast } from '@/hooks/use-toast';
import { User, Phone, MapPin, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateUserProfile } from '@/lib/firebase/users';

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
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: userDisplayName || '',
    phone: '',
    businessName: '',
    location: {
      city: '',
      state: 'TX',
      zip: '',
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update form data when userDisplayName changes
  useEffect(() => {
    if (userDisplayName && !formData.fullName) {
      setFormData(prev => ({ ...prev, fullName: userDisplayName }));
    }
  }, [userDisplayName]);

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
      // Build the update object, only including fields with values
      const updates: any = {
        profileComplete: true,
        phoneNumber: formData.phone,
        profile: {
          fullName: formData.fullName,
          location: formData.location,
        },
      };

      if (formData.businessName) {
        updates.profile.businessName = formData.businessName;
      }

      // Update user profile
      await updateUserProfile(userId, updates);
      
      toast({
        title: 'Profile updated successfully!',
        description: 'Your profile has been completed.',
      });

      onComplete();
    } catch (error: any) {
      console.error('Profile update failed:', error);
      toast({
        title: 'Profile update failed',
        description: error.message || 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold">
            Complete Your Profile
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
            We need a few more details to get you started on Wildlife Exchange.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
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
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="min-h-[48px] text-base bg-background"
                placeholder="Hill Country Exotics"
              />
            </div>
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
  );
}
