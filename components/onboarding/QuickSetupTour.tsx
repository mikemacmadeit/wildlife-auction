'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile, isProfileComplete, updateUserProfile } from '@/lib/firebase/users';
import { reloadCurrentUser, resendVerificationEmail } from '@/lib/firebase/auth';
import { createStripeAccount, createAccountLink } from '@/lib/stripe/api';
import { 
  User, 
  Mail, 
  CreditCard, 
  Package, 
  CheckCircle2, 
  Loader2,
  X,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface QuickSetupTourProps {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

type TourStep = 'profile' | 'email' | 'stripe' | 'listing';

export function QuickSetupTour({ open, onClose, onComplete }: QuickSetupTourProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<TourStep>('profile');
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  
  // Profile form state
  const [formData, setFormData] = useState({
    fullName: user?.displayName || '',
    phone: '',
    businessName: '',
    location: {
      city: '',
      state: 'TX',
      zip: '',
    },
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  
  // Status tracking
  const [status, setStatus] = useState({
    profileComplete: false,
    emailVerified: false,
    stripeConnected: false,
  });
  const [userProfile, setUserProfile] = useState<any>(null);

  // Check completion status
  const checkStatus = useCallback(async () => {
    if (!user?.uid) return;
    setCheckingStatus(true);
    try {
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
      
      const profileOk = profile && isProfileComplete(profile);
      const emailOk = user.emailVerified === true;
      const stripeOk = profile?.stripeOnboardingStatus === 'complete' && 
                       profile?.payoutsEnabled === true && 
                       profile?.chargesEnabled === true;

      setStatus({
        profileComplete: profileOk,
        emailVerified: emailOk,
        stripeConnected: stripeOk,
      });

      // Auto-advance to next incomplete step
      if (profileOk && currentStep === 'profile') {
        setCurrentStep('email');
      }
      if (emailOk && currentStep === 'email') {
        setCurrentStep('stripe');
      }
      if (stripeOk && currentStep === 'stripe') {
        setCurrentStep('listing');
      }
    } catch (error) {
      console.error('Error checking status:', error);
    } finally {
      setCheckingStatus(false);
    }
  }, [user, currentStep]);

  // Initial status check and form data load
  useEffect(() => {
    if (open && user) {
      checkStatus();
      if (userProfile) {
        setFormData({
          fullName: userProfile.profile?.fullName || user.displayName || '',
          phone: userProfile.phoneNumber || '',
          businessName: userProfile.profile?.businessName || '',
          location: userProfile.profile?.location || {
            city: '',
            state: 'TX',
            zip: '',
          },
        });
      }
    }
  }, [open, user, checkStatus]);

  // Poll for email verification status
  useEffect(() => {
    if (currentStep === 'email' && !status.emailVerified && user) {
      const interval = setInterval(() => {
        reloadCurrentUser().then(() => {
          checkStatus();
        });
      }, 3000); // Check every 3 seconds
      return () => clearInterval(interval);
    }
  }, [currentStep, status.emailVerified, user, checkStatus]);

  const steps: { id: TourStep; title: string; description: string; icon: any }[] = [
    {
      id: 'profile',
      title: 'Complete Your Profile',
      description: 'Add your name, location, and contact info so buyers can trust you',
      icon: User,
    },
    {
      id: 'email',
      title: 'Verify Your Email',
      description: 'Confirm your email address to unlock all features',
      icon: Mail,
    },
    {
      id: 'stripe',
      title: 'Connect Payment Account',
      description: 'Set up Stripe to receive payouts when you sell',
      icon: CreditCard,
    },
    {
      id: 'listing',
      title: 'Create Your First Listing',
      description: 'Ready to sell? Create your first listing and start earning',
      icon: Package,
    },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;
  const allCoreStepsComplete = status.profileComplete && status.emailVerified && status.stripeConnected;

  const validateProfileForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.fullName.trim()) errors.fullName = 'Full name is required';
    if (!formData.phone.trim()) errors.phone = 'Phone number is required';
    if (!formData.location.city.trim()) errors.city = 'City is required';
    if (!formData.location.state.trim()) errors.state = 'State is required';
    if (!formData.location.zip.trim()) errors.zip = 'ZIP code is required';
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProfileSubmit = async () => {
    if (!validateProfileForm() || !user?.uid) return;
    setLoading(true);
    try {
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
      await updateUserProfile(user.uid, updates);
      toast({
        title: 'Profile completed!',
        description: 'Your profile has been updated successfully.',
      });
      await checkStatus();
      setCurrentStep('email');
    } catch (error: any) {
      toast({
        title: 'Failed to update profile',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await resendVerificationEmail();
      toast({
        title: 'Verification email sent',
        description: 'Check your inbox (and spam folder) for the verification link.',
      });
    } catch (error: any) {
      toast({
        title: 'Failed to send email',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleRefreshEmailStatus = async () => {
    try {
      await reloadCurrentUser();
      await checkStatus();
      toast({
        title: 'Status refreshed',
        description: 'If you verified your email, it should show as verified now.',
      });
    } catch (error: any) {
      toast({
        title: 'Refresh failed',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleConnectStripe = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (!userProfile?.stripeAccountId) {
        await createStripeAccount();
      }
      const { url } = await createAccountLink();
      // Save that we're in the tour so we can show it again when they return
      if (typeof window !== 'undefined') {
        localStorage.setItem('we:quick-setup-tour:stripe-redirect', '1');
      }
      window.location.href = url;
    } catch (error: any) {
      toast({
        title: 'Failed to connect Stripe',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('we:quick-setup-tour:dismissed', '1');
    }
    onClose();
  };

  const handleComplete = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('we:quick-setup-tour:completed', '1');
    }
    onComplete?.();
    onClose();
  };

  // Check if user returned from Stripe
  useEffect(() => {
    if (typeof window !== 'undefined' && open) {
      const wasRedirected = localStorage.getItem('we:quick-setup-tour:stripe-redirect');
      if (wasRedirected === '1') {
        localStorage.removeItem('we:quick-setup-tour:stripe-redirect');
        // Check status after a brief delay to allow webhook to process
        setTimeout(() => {
          checkStatus();
          setCurrentStep('stripe');
        }, 2000);
      }
    }
  }, [open, checkStatus]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tour-fullName" className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="tour-fullName"
                  value={formData.fullName}
                  onChange={(e) => {
                    setFormData({ ...formData, fullName: e.target.value });
                    if (profileErrors.fullName) setProfileErrors({ ...profileErrors, fullName: '' });
                  }}
                  className={cn('min-h-[48px]', profileErrors.fullName && 'border-destructive')}
                  placeholder="John Doe"
                />
                {profileErrors.fullName && (
                  <p className="text-sm text-destructive">{profileErrors.fullName}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tour-phone" className="text-sm font-semibold flex items-center gap-2">
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="tour-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value });
                    if (profileErrors.phone) setProfileErrors({ ...profileErrors, phone: '' });
                  }}
                  className={cn('min-h-[48px]', profileErrors.phone && 'border-destructive')}
                  placeholder="(512) 555-1234"
                />
                {profileErrors.phone && (
                  <p className="text-sm text-destructive">{profileErrors.phone}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tour-businessName" className="text-sm font-semibold">
                  Business / Ranch Name <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Input
                  id="tour-businessName"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="min-h-[48px]"
                  placeholder="Hill Country Exotics"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide">Location</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tour-city">City <span className="text-destructive">*</span></Label>
                  <Input
                    id="tour-city"
                    value={formData.location.city}
                    onChange={(e) => {
                      setFormData({ 
                        ...formData, 
                        location: { ...formData.location, city: e.target.value }
                      });
                      if (profileErrors.city) setProfileErrors({ ...profileErrors, city: '' });
                    }}
                    className={cn('min-h-[48px]', profileErrors.city && 'border-destructive')}
                    placeholder="Kerrville"
                  />
                  {profileErrors.city && (
                    <p className="text-sm text-destructive">{profileErrors.city}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tour-state">State <span className="text-destructive">*</span></Label>
                  <Input
                    id="tour-state"
                    value={formData.location.state}
                    onChange={(e) => {
                      setFormData({ 
                        ...formData, 
                        location: { ...formData.location, state: e.target.value.toUpperCase() }
                      });
                      if (profileErrors.state) setProfileErrors({ ...profileErrors, state: '' });
                    }}
                    maxLength={2}
                    className={cn('min-h-[48px] uppercase', profileErrors.state && 'border-destructive')}
                    placeholder="TX"
                  />
                  {profileErrors.state && (
                    <p className="text-sm text-destructive">{profileErrors.state}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tour-zip">ZIP Code <span className="text-destructive">*</span></Label>
                  <Input
                    id="tour-zip"
                    value={formData.location.zip}
                    onChange={(e) => {
                      setFormData({ 
                        ...formData, 
                        location: { ...formData.location, zip: e.target.value }
                      });
                      if (profileErrors.zip) setProfileErrors({ ...profileErrors, zip: '' });
                    }}
                    className={cn('min-h-[48px]', profileErrors.zip && 'border-destructive')}
                    placeholder="78028"
                  />
                  {profileErrors.zip && (
                    <p className="text-sm text-destructive">{profileErrors.zip}</p>
                  )}
                </div>
              </div>
            </div>

            <Button
              onClick={handleProfileSubmit}
              disabled={loading || checkingStatus}
              className="w-full min-h-[48px] font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  Complete Profile
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        );

      case 'email':
        return (
          <div className="space-y-6">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Verify your email address</h3>
                  <p className="text-sm text-muted-foreground">
                    We've sent a verification email to <span className="font-semibold text-foreground">{user?.email}</span>
                  </p>
                </div>
              </div>

              {status.emailVerified ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Email verified!</span>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleResendVerification}
                    disabled={loading}
                    variant="default"
                    className="flex-1"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Resend Verification Email'
                    )}
                  </Button>
                  <Button
                    onClick={handleRefreshEmailStatus}
                    disabled={loading || checkingStatus}
                    variant="outline"
                    className="flex-1"
                  >
                    {checkingStatus ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      'Refresh Status'
                    )}
                  </Button>
                </div>
              )}
            </div>

            {status.emailVerified && (
              <Button
                onClick={() => {
                  setCurrentStep('stripe');
                  checkStatus();
                }}
                className="w-full min-h-[48px] font-semibold"
              >
                Continue to Payment Setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        );

      case 'stripe':
        return (
          <div className="space-y-6">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Connect your payment account</h3>
                  <p className="text-sm text-muted-foreground">
                    Set up Stripe to receive payouts when you sell. This is secure and required to publish listings.
                  </p>
                </div>
              </div>

              {status.stripeConnected ? (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Payment account connected!</span>
                </div>
              ) : (
                <Button
                  onClick={handleConnectStripe}
                  disabled={loading}
                  className="w-full min-h-[48px] font-semibold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Connect Stripe Account
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>

            {status.stripeConnected && (
              <Button
                onClick={() => {
                  setCurrentStep('listing');
                  checkStatus();
                }}
                className="w-full min-h-[48px] font-semibold"
              >
                Continue to Create Listing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        );

      case 'listing':
        return (
          <div className="space-y-6">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">You're all set!</h3>
                  <p className="text-sm text-muted-foreground">
                    Your account is fully configured. Ready to create your first listing and start selling?
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  asChild
                  className="flex-1 min-h-[48px] font-semibold"
                >
                  <Link href="/dashboard/listings/new">
                    Create Your First Listing
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  onClick={handleComplete}
                  variant="outline"
                  className="flex-1 min-h-[48px]"
                >
                  Maybe Later
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-extrabold flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                Quick Setup
              </DialogTitle>
              <DialogDescription className="text-base pt-2">
                Let's get your account set up in just a few steps
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDismiss}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
            <span className="font-semibold">{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-between py-4">
          {steps.slice(0, 3).map((step, index) => {
            const StepIcon = step.icon;
            const isActive = step.id === currentStep;
            const isComplete = 
              (step.id === 'profile' && status.profileComplete) ||
              (step.id === 'email' && status.emailVerified) ||
              (step.id === 'stripe' && status.stripeConnected);
            const isPast = currentStepIndex > index;

            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      'h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all',
                      isComplete
                        ? 'bg-primary border-primary text-primary-foreground'
                        : isActive
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-muted bg-background text-muted-foreground'
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={cn(
                    'text-xs mt-2 text-center font-medium',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {step.title.split(' ')[0]}
                  </span>
                </div>
                {index < 2 && (
                  <div className={cn(
                    'h-0.5 flex-1 mx-2 transition-colors',
                    isPast || isComplete ? 'bg-primary' : 'bg-muted'
                  )} />
                )}
              </div>
            );
          })}
        </div>

        <Separator />

        {/* Current Step Content */}
        <div className="py-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-1">
              {steps[currentStepIndex]?.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {steps[currentStepIndex]?.description}
            </p>
          </div>
          {renderStepContent()}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="text-muted-foreground"
          >
            Skip for now
          </Button>
          {allCoreStepsComplete && currentStep === 'listing' && (
            <Button
              onClick={handleComplete}
              variant="outline"
            >
              Finish Setup
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
