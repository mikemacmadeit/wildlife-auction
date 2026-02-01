'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { signIn, resetPassword, signInWithGoogle, getGoogleRedirectResult } from '@/lib/firebase/auth';
import {
  getSignInErrorMessage,
  getPasswordResetErrorMessage,
  getGoogleSignInErrorMessage,
} from '@/lib/firebase/auth-error-messages';
import { createUserDocument } from '@/lib/firebase/users';
import { Mail, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  
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
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Show success message when user lands after completing password reset
  useEffect(() => {
    if (searchParams?.get('reset') === '1') {
      toast({
        title: 'Password updated',
        description: 'You can sign in with your new password.',
      });
      router.replace('/login', { scroll: false });
    }
  }, [searchParams, router, toast]);

  // Handle Google redirect result on page load
  useEffect(() => {
    getGoogleRedirectResult()
      .then((result) => {
        if (result?.user) {
          createUserDocument(result.user)
            .then(() => {
              toast({
                title: 'Welcome back!',
                description: 'You have been successfully signed in with Google.',
              });
              router.push(getRedirectPath());
            })
            .catch((error) => {
              console.error('Error creating user document after Google redirect:', error);
              toast({
                title: 'Google sign-in failed',
                description: 'Failed to set up user account. Please try again.',
                variant: 'destructive',
              });
            });
        }
      })
      .catch((error: any) => {
        console.error('Error during Google redirect result:', error);
        const errorMessage = getGoogleSignInErrorMessage(error?.code);
        toast({
          title: 'Google sign-in failed',
          description: errorMessage,
          variant: 'destructive',
        });
      });
  }, [router, toast]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please check your email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await signIn(formData.email, formData.password);
      toast({
        title: 'Welcome back!',
        description: 'You have been successfully signed in.',
      });
      router.push(getRedirectPath());
    } catch (error: any) {
      const errorMessage = getSignInErrorMessage(error?.code);

      toast({
        title: 'Sign in failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email.trim()) {
      toast({
        title: 'Email required',
        description: 'Please enter your email address first.',
        variant: 'destructive',
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setIsResettingPassword(true);

    try {
      await resetPassword(formData.email);
      toast({
        title: 'Password reset email sent',
        description:
          'If an account exists for this email, you’ll receive reset instructions shortly. Check your spam folder if you don’t see it in a few minutes.',
      });
    } catch (error: any) {
      const code = error?.code;
      // Avoid account enumeration: treat user-not-found as success UX.
      if (code === 'auth/user-not-found') {
        toast({
          title: 'Password reset email sent',
          description:
            'If an account exists for this email, you’ll receive reset instructions shortly. Check your spam folder if you don’t see it.',
        });
        return;
      }
      const errorMessage = getPasswordResetErrorMessage(code);

      toast({
        title: 'Couldn’t send reset email',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);

    try {
      const userCredential = await signInWithGoogle();

      // Create user document in Firestore if it doesn't exist (for new users)
      if (userCredential.user) {
        await createUserDocument(userCredential.user);

        toast({
          title: 'Welcome back!',
          description: 'You have been successfully signed in.',
        });

        router.push(getRedirectPath());
      }
    } catch (error: any) {
      // Don't show error if redirect was initiated (page will reload)
      if (error.message === 'REDIRECT_INITIATED') {
        return; // Page will reload after redirect
      }

      const errorMessage = getGoogleSignInErrorMessage(error?.code);
      toast({
        title: 'Google sign-in failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border border-border/50 shadow-warm">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="we-h2">Sign In</CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your.email@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={cn(
                      'pl-10',
                      errors.email && 'border-destructive focus-visible:ring-destructive'
                    )}
                    disabled={isLoading}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={cn(
                      'pl-10 pr-10',
                      errors.password && 'border-destructive focus-visible:ring-destructive'
                    )}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isLoading || isResettingPassword}
                    className="text-sm text-primary hover:underline font-medium"
                  >
                    {isResettingPassword ? 'Sending...' : 'Forgot password?'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Didn’t get the email? Check spam or{' '}
                  <Link href="/contact" className="text-primary hover:underline">
                    contact support
                  </Link>
                  .
                </p>
              </div>

              <Button
                type="submit"
                className="w-full min-h-[44px] font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Your session is encrypted.
              </p>
            </form>

            <div className="mt-6 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px] font-semibold gap-2 border-2"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {isLoading ? 'Signing in...' : 'Sign in with Google'}
              </Button>
            </div>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link
                href="/register"
                className="text-primary hover:underline font-semibold"
              >
                Sign up
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
