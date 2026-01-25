'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { signUp, signInWithGoogle, getGoogleRedirectResult } from '@/lib/firebase/auth';
import { createUserDocument, getUserProfile } from '@/lib/firebase/users';
import { getIdToken } from '@/lib/firebase/auth-helper';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';
import { 
  User, 
  Mail, 
  Lock, 
  Phone, 
  MapPin, 
  Building2,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LegalDocsModal } from '@/components/legal/LegalDocsModal';

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [signUpMethod, setSignUpMethod] = useState<'select' | 'email' | 'google'>('select');
  
  // Get redirect path from sessionStorage if available
  const getRedirectPath = () => {
    if (typeof window !== 'undefined') {
      const redirectPath = sessionStorage.getItem('redirectAfterLogin');
      if (redirectPath) {
        sessionStorage.removeItem('redirectAfterLogin');
        return redirectPath;
      }
    }
    return '/dashboard';
  };
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    location: {
      city: '',
      state: 'TX',
      zip: '',
    },
    agreeToTerms: false,
    subscribeNewsletter: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Handle Google redirect result on page load
  useEffect(() => {
    getGoogleRedirectResult()
      .then((result) => {
        if (result?.user) {
          createUserDocument(result.user)
            .then(async () => {
              // Check if user has accepted terms by checking their profile
              try {
                const profile = await getUserProfile(result.user.uid);
                const requiredVersion = LEGAL_VERSIONS.tos.version;
                const hasAcceptedTerms = profile?.legal?.tos?.version === requiredVersion;

                if (!hasAcceptedTerms) {
                  // User hasn't accepted terms - redirect to acceptance page
                  const nextUrl = getRedirectPath();
                  router.push(`/legal/accept?next=${encodeURIComponent(nextUrl)}`);
                  return;
                }

                // User has accepted terms - proceed normally
                toast({
                  title: 'Welcome to Wildlife Exchange!',
                  description: 'Your account has been created successfully with Google.',
                });
                router.push(getRedirectPath());
              } catch (error) {
                console.error('Error checking user profile after Google redirect:', error);
                // If we can't check profile, redirect to terms acceptance to be safe
                const nextUrl = getRedirectPath();
                router.push(`/legal/accept?next=${encodeURIComponent(nextUrl)}`);
              }
            })
            .catch((error) => {
              console.error('Error creating user document after Google redirect:', error);
              toast({
                title: 'Google sign-up failed',
                description: 'Failed to set up user account. Please try again.',
                variant: 'destructive',
              });
            });
        }
      })
      .catch((error: any) => {
        console.error('Error during Google redirect result:', error);
        let errorMessage = 'An error occurred during Google sign-up. Please try again.';
        if (error.code === 'auth/unauthorized-domain') {
          errorMessage = 'Google sign-up is not enabled for this domain. Please contact support.';
        } else if (error.code === 'auth/operation-not-allowed') {
          errorMessage = 'Google sign-up is not enabled for this project. Please contact support.';
        } else if (error.message) {
          errorMessage = error.message;
        }
        toast({
          title: 'Google sign-up failed',
          description: errorMessage,
          variant: 'destructive',
        });
      });
  }, [router, toast]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!/^[\d\s\-\(\)]+$/.test(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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

    if (!formData.agreeToTerms) {
      newErrors.agreeToTerms = 'You must agree to the terms and conditions';
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
      // Create Firebase Auth user
      const userCredential = await signUp(
        formData.email,
        formData.password,
        formData.fullName
      );

      // Create user document in Firestore
      if (userCredential.user) {
        await createUserDocument(userCredential.user, {
          fullName: formData.fullName,
          businessName: formData.businessName || undefined,
          phone: formData.phone,
          location: formData.location,
        });

        // Record legal acceptance server-side (non-spoofable).
        try {
          const token = await getIdToken(userCredential.user, true);
          await fetch('/api/legal/accept', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              docs: ['tos', 'marketplacePolicies', 'buyerAcknowledgment', 'sellerPolicy'],
            }),
          });
        } catch {
          // If this fails, the RequireAuth gate will force acceptance later.
        }

        toast({
          title: 'Account created successfully!',
          description: 'Welcome to Wildlife Exchange! Please check your email to verify your account.',
        });

        // Redirect to saved path or dashboard after successful registration
        router.push(getRedirectPath());
      }
    } catch (error: any) {
      let errorMessage = 'An error occurred while creating your account. Please try again.';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists. Please sign in instead.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please choose a stronger password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address. Please check and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: 'Registration failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);

    try {
      // No terms check here - allow Google sign up to proceed
      // Terms acceptance will be required after sign up completes
      const userCredential = await signInWithGoogle();

      // Create user document in Firestore if it doesn't exist
      if (userCredential.user) {
        await createUserDocument(userCredential.user);

        // Check if user has accepted terms by checking their profile
        try {
          const profile = await getUserProfile(userCredential.user.uid);
          const requiredVersion = LEGAL_VERSIONS.tos.version;
          const hasAcceptedTerms = profile?.legal?.tos?.version === requiredVersion;

          if (!hasAcceptedTerms) {
            // User hasn't accepted terms - redirect to acceptance page
            const nextUrl = getRedirectPath();
            router.push(`/legal/accept?next=${encodeURIComponent(nextUrl)}`);
            setIsLoading(false);
            return;
          }

          // User has accepted terms - proceed normally
          toast({
            title: 'Welcome to Wildlife Exchange!',
            description: 'Your account has been created successfully.',
          });

          // Redirect to saved path or dashboard after successful registration
          router.push(getRedirectPath());
        } catch (error) {
          console.error('Error checking user profile after Google sign up:', error);
          // If we can't check profile, redirect to terms acceptance to be safe
          const nextUrl = getRedirectPath();
          router.push(`/legal/accept?next=${encodeURIComponent(nextUrl)}`);
        }
      }
    } catch (error: any) {
      // Don't show error if redirect was initiated (page will reload)
      if (error.message === 'REDIRECT_INITIATED') {
        return; // Page will reload after redirect
      }

      let errorMessage = 'An error occurred while signing in with Google. Please try again.';
      
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in popup was closed. Please try again.';
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Popup was blocked. Using redirect instead...';
        // Will automatically fall back to redirect in signInWithGoogle
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = 'Only one popup request is allowed at a time.';
      } else if (error.code === 'auth/unauthorized-domain') {
        errorMessage = 'This domain is not authorized. Please contact support.';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Google sign-in is not enabled. Please contact support.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: 'Google sign-up failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 md:py-20 px-4">
      <div className="w-full max-w-5xl">
        <LegalDocsModal
          open={legalOpen}
          onOpenChange={setLegalOpen}
          initialTab="tos"
          agreeAction={{
            buttonText: 'I Agree',
            onConfirm: () => {
              setFormData((p) => ({ ...p, agreeToTerms: true }));
              if (errors.agreeToTerms) setErrors((e) => ({ ...e, agreeToTerms: '' }));
              setLegalOpen(false);
            },
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center"
        >
          {/* Left Side - Branding & Info */}
          <div className="hidden lg:block space-y-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="relative h-14 w-14">
                <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
                <div
                  aria-hidden="true"
                  className="relative h-full w-full opacity-95"
                  style={{
                    backgroundColor: 'hsl(var(--primary))',
                    WebkitMaskImage: "url('/images/Kudu.png')",
                    maskImage: "url('/images/Kudu.png')",
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                  }}
                />
              </div>
              <span className="text-3xl font-extrabold text-foreground">
                Wildlife Exchange
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-foreground leading-tight">
              Create your Wildlife Exchange account
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Join Texas&apos; premier marketplace for registered livestock and breeder animal sales. Connect with verified sellers and serious buyers.
            </p>
            <div className="space-y-4 pt-4">
              {[
                'Free to join and list',
                'Verified seller options',
                'Secure transactions',
                'Texas-first marketplace',
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-base text-foreground font-medium">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side - Registration Form */}
          <Card className="border-2 border-border/50 bg-card shadow-xl">
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between mb-4">
                <CardTitle className="text-2xl md:text-3xl font-extrabold">
                  Create Account
                </CardTitle>
                <div className="lg:hidden">
                  <div
                    aria-hidden="true"
                    className="h-8 w-8 opacity-95"
                    style={{
                      backgroundColor: 'hsl(var(--primary))',
                      WebkitMaskImage: "url('/images/Kudu.png')",
                      maskImage: "url('/images/Kudu.png')",
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      WebkitMaskSize: 'contain',
                      maskSize: 'contain',
                    }}
                  />
                </div>
              </div>
              <CardDescription className="text-base">
                Sign up to start listing animals and connecting with buyers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {signUpMethod === 'select' ? (
                /* Sign Up Method Selection */
                <div className="space-y-4 py-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full min-h-[60px] text-base font-semibold gap-3 border-2 hover:bg-muted/50 transition-all"
                    onClick={handleGoogleSignUp}
                    disabled={isLoading}
                  >
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Sign up with Google</span>
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border/50" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-3 text-muted-foreground">Or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="default"
                    className="w-full min-h-[60px] text-base font-semibold gap-3 shadow-lg hover:shadow-xl transition-all"
                    onClick={() => setSignUpMethod('email')}
                    disabled={isLoading}
                  >
                    <Mail className="h-6 w-6" />
                    <span>Sign up with Email</span>
                  </Button>

                  <div className="text-center pt-4 border-t border-border/50">
                    <p className="text-sm text-muted-foreground">
                      Already have an account?{' '}
                      <Link href="/login" className="text-primary font-semibold hover:underline">
                        Sign In
                      </Link>
                    </p>
                  </div>
                </div>
              ) : (
                /* Email Sign Up Form */
                <div>
                  {/* Back Button */}
                  <Button
                    type="button"
                    variant="ghost"
                    className="mb-4 -ml-2"
                    onClick={() => setSignUpMethod('select')}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to sign up options
                  </Button>

                  <form onSubmit={handleSubmit} className="space-y-6">
                {/* Personal Information Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Personal Information</h3>
                  
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
                    <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => {
                        setFormData({ ...formData, email: e.target.value });
                        if (errors.email) setErrors({ ...errors, email: '' });
                      }}
                      className={cn(
                        'min-h-[48px] text-base bg-background',
                        errors.email && 'border-destructive focus-visible:ring-destructive'
                      )}
                      placeholder="john@example.com"
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive font-medium">{errors.email}</p>
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

                {/* Location Section */}
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

                <Separator />

                {/* Password Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Password
                  </h3>
                  
                  {/* Password Requirements */}
                  <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/50">
                    <p className="font-semibold mb-1.5 text-foreground">Password Requirements:</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li className={cn(formData.password.length >= 8 && 'text-primary')}>
                        At least 8 characters
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-semibold flex items-center gap-2">
                      Password <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => {
                          setFormData({ ...formData, password: e.target.value });
                          if (errors.password) setErrors({ ...errors, password: '' });
                        }}
                        className={cn(
                          'min-h-[48px] text-base bg-background pr-12',
                          errors.password && 'border-destructive focus-visible:ring-destructive'
                        )}
                        placeholder="Create a strong password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {errors.password && (
                      <p className="text-sm text-destructive font-medium">{errors.password}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-semibold flex items-center gap-2">
                      Confirm Password <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={(e) => {
                          setFormData({ ...formData, confirmPassword: e.target.value });
                          if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                        }}
                        className={cn(
                          'min-h-[48px] text-base bg-background pr-12',
                          errors.confirmPassword && 'border-destructive focus-visible:ring-destructive',
                          formData.confirmPassword && formData.password === formData.confirmPassword && 'border-green-500 focus-visible:ring-green-500'
                        )}
                        placeholder="Re-enter your password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {formData.confirmPassword && formData.password === formData.confirmPassword && (
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Passwords match
                      </p>
                    )}
                    {errors.confirmPassword && (
                      <p className="text-sm text-destructive font-medium">{errors.confirmPassword}</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Terms & Newsletter */}
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="agreeToTerms"
                      checked={formData.agreeToTerms}
                      onCheckedChange={(checked) => {
                        setFormData({ ...formData, agreeToTerms: checked as boolean });
                        if (errors.agreeToTerms) setErrors({ ...errors, agreeToTerms: '' });
                      }}
                      className={cn(
                        'mt-1',
                        errors.agreeToTerms && 'border-destructive'
                      )}
                    />
                    <Label htmlFor="agreeToTerms" className="text-sm font-medium leading-relaxed cursor-pointer flex-1">
                      I agree to the{' '}
                      <button
                        type="button"
                        className="text-primary hover:underline font-semibold"
                        onClick={() => setLegalOpen(true)}
                      >
                        Terms of Service & Marketplace Policies
                      </button>{' '}
                      and{' '}
                      <Link href="/privacy" className="text-primary hover:underline font-semibold">
                        Privacy Policy
                      </Link>
                      <span className="text-destructive"> *</span>
                    </Label>
                  </div>
                  {errors.agreeToTerms && (
                    <p className="text-sm text-destructive font-medium ml-7">{errors.agreeToTerms}</p>
                  )}
                  <div className="ml-7 text-xs text-muted-foreground">
                    You can read the full Terms and policies in a modal without leaving this page.
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="subscribeNewsletter"
                      checked={formData.subscribeNewsletter}
                      onCheckedChange={(checked) => setFormData({ ...formData, subscribeNewsletter: checked as boolean })}
                      className="mt-1"
                    />
                    <Label htmlFor="subscribeNewsletter" className="text-sm font-medium leading-relaxed cursor-pointer flex-1">
                      Subscribe to newsletter for tips, updates, and marketplace news
                    </Label>
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
                      Creating Account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                {/* Sign In Link */}
                <div className="text-center pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">
                    Already have an account?{' '}
                    <Link href="/login" className="text-primary font-semibold hover:underline">
                      Sign In
                    </Link>
                  </p>
                </div>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
