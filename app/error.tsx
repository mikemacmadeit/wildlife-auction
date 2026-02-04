'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Copy, Home } from 'lucide-react';
import { reportError } from '@/lib/monitoring/reportError';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const isDev = process.env.NODE_ENV === 'development';

  // Report error to monitoring service
  useEffect(() => {
    reportError(error, {
      digest: error.digest,
      pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
    }, 'high');
  }, [error]);

  const handleCopyError = () => {
    const errorDetails = `Error: ${error.message}\n\nStack: ${error.stack || 'No stack trace'}\n\nDigest: ${error.digest || 'N/A'}`;
    
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(errorDetails).then(() => {
        setCopied(true);
        toast({
          title: 'Copied',
          description: 'Error details copied to clipboard',
        });
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        toast({
          title: 'Copy failed',
          description: 'We couldn\'t copy the error details. Try selecting and copying the text manually.',
          variant: 'destructive',
        });
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Something went wrong</CardTitle>
          <CardDescription className="mt-2">
            We ran into an unexpected problem. Try again, or go back and try a different action. If the problem keeps happening, please contact support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error details (dev only) */}
          {isDev && error.message && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold mb-1">Error Details (Dev Only):</p>
              <p className="text-muted-foreground break-words">{error.message}</p>
              {error.digest && (
                <p className="text-xs text-muted-foreground mt-2">
                  Digest: {error.digest}
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <Button 
              onClick={reset} 
              className="w-full"
              size="lg"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
            
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => router.push('/browse')}
                className="flex-1"
              >
                Browse Listings
              </Button>
              <Button 
                variant="outline" 
                asChild
                className="flex-1"
              >
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Link>
              </Button>
            </div>
          </div>

          {/* Copy error button (dev only) */}
          {isDev && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyError}
              className="w-full text-xs"
            >
              <Copy className="mr-2 h-3 w-3" />
              {copied ? 'Copied!' : 'Copy error details'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
