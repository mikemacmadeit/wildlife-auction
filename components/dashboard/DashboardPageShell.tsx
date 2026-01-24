'use client';

import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertCircle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface DashboardPageShellProps {
  title?: string;
  loading?: boolean;
  error?: string | null;
  isEmpty?: boolean;
  emptyState?: {
    icon?: React.ComponentType<{ className?: string }>;
    title?: string;
    description?: string;
    action?: {
      label: string;
      href: string;
    };
  };
  children: ReactNode;
  /** TEMP DEBUG: Remove after fixing blank pages */
  debugLabel?: string;
}

/**
 * Reusable shell for dashboard pages that ensures content is never blank.
 * Always renders something: loading, error, empty state, or content.
 */
export function DashboardPageShell({
  title,
  loading = false,
  error = null,
  isEmpty = false,
  emptyState,
  children,
  debugLabel,
}: DashboardPageShellProps) {
  // TEMP DEBUG: Remove after fixing blank pages
  if (process.env.NODE_ENV === 'development' && debugLabel) {
    console.log(`[DashboardPageShell] ${debugLabel}`, {
      loading,
      error: !!error,
      isEmpty,
      hasChildren: !!children,
      timestamp: Date.now(),
    });
  }

  // Error state - always show error UI
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        {process.env.NODE_ENV === 'development' && debugLabel && (
          <div className="mb-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-xs font-mono rounded">
            DEBUG: {debugLabel} - Error State
          </div>
        )}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h2 className="text-xl font-semibold mb-2">Error loading {title || 'page'}</h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state - always show loading UI
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        {process.env.NODE_ENV === 'development' && debugLabel && (
          <div className="mb-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-xs font-mono rounded">
            DEBUG: {debugLabel} - Loading State
          </div>
        )}
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <div className="text-sm font-semibold">Loading {title || 'content'}...</div>
            <div className="text-xs text-muted-foreground">Please wait.</div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state - show friendly empty UI
  if (isEmpty && emptyState) {
    const EmptyIcon = emptyState.icon || Inbox;
    return (
      <div className="container mx-auto px-4 py-8">
        {process.env.NODE_ENV === 'development' && debugLabel && (
          <div className="mb-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-xs font-mono rounded">
            DEBUG: {debugLabel} - Empty State
          </div>
        )}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <EmptyIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-xl font-semibold mb-2">{emptyState.title || 'No items found'}</h2>
              <p className="text-muted-foreground mb-6">{emptyState.description || 'Get started by adding your first item.'}</p>
              {emptyState.action && (
                <Button asChild>
                  <Link href={emptyState.action.href}>{emptyState.action.label}</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Content state - render children with optional debug banner
  console.log(`[DashboardPageShell] ${debugLabel || 'Unknown'} - Rendering children`, {
    childrenType: typeof children,
    childrenIsArray: Array.isArray(children),
    childrenLength: Array.isArray(children) ? children.length : 'N/A',
  });
  
  return (
    <div className="container mx-auto px-4 py-8">
      {children}
    </div>
  );
}
