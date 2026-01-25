/**
 * App Shell Guard
 * 
 * Guarantees every route renders *something* in the main area.
 * - Never returns null from layouts
 * - Provides consistent loading/empty/error display
 * - Ensures children are always wrapped in a visible container
 */

'use client';

import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface AppShellGuardProps {
  children: ReactNode;
  loading?: boolean;
  error?: Error | string | null;
  empty?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function AppShellGuard({
  children,
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'No content available',
  className = '',
}: AppShellGuardProps) {
  // Always render something - never return null
  if (error) {
    const errorMessage = typeof error === 'string' ? error : error?.message || 'An error occurred';
    return (
      <div className={`min-h-[400px] flex items-center justify-center ${className}`}>
        <Card className="border-destructive/50 bg-destructive/5 max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold">Error</h3>
                <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`min-h-[400px] flex items-center justify-center ${className}`}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className={`min-h-[400px] flex items-center justify-center ${className}`}>
        <Card className="border-border/50 max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">{emptyMessage}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Always wrap children in a container to ensure something renders
  return <div className={className}>{children}</div>;
}
