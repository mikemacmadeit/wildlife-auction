'use client';

import { ReactNode, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AsyncPageProps {
  title: string;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: ReactNode;
  loadingMessage?: string;
}

export function AsyncPage({ 
  title, 
  loading, 
  error, 
  onRetry, 
  children, 
  loadingMessage = 'Loading...' 
}: AsyncPageProps) {
  // Loading state - always show a visible loading UI
  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-4 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-muted-foreground">{loadingMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state - always show a visible error UI with retry
  if (error) {
    return (
      <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-4">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl">
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-12 pb-12 text-center space-y-4">
              <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <div>
                <h3 className="text-lg font-semibold text-destructive mb-2">
                  Failed to load {title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">{error}</p>
                {onRetry && (
                  <Button onClick={onRetry} variant="outline" className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Try Again
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Success state - render the content
  return <>{children}</>;
}

// Hook for async page logic with timeout protection
export function useAsyncPage(title: string, loadingMessage?: string) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const withTimeout = useCallback(<T,>(
    promise: Promise<T>, 
    timeoutMs: number = 10000
  ): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }, []);

  const runAsync = useCallback(async (asyncFn: () => Promise<void>) => {
    try {
      setLoading(true);
      setError(null);
      await withTimeout(asyncFn());
    } catch (err: any) {
      console.error(`[AsyncPage:${title}] Error:`, err);
      setError(err?.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [title, withTimeout]);

  const retry = useCallback(() => {
    // This will be set by the component using this hook
  }, []);

  return {
    loading,
    error,
    runAsync,
    retry,
    AsyncPageWrapper: ({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) => (
      <AsyncPage 
        title={title} 
        loading={loading} 
        error={error} 
        onRetry={onRetry}
        loadingMessage={loadingMessage}
      >
        {children}
      </AsyncPage>
    )
  };
}