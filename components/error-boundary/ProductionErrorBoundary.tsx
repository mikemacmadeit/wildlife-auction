'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ProductionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ProductionErrorBoundary] Component error:', error, errorInfo);
    
    // Send to error tracking service if available
    if (typeof window !== 'undefined') {
      // Try Sentry if available
      if ((window as any).Sentry) {
        (window as any).Sentry.captureException(error, {
          contexts: { react: errorInfo },
          tags: { errorBoundary: true },
        });
      }
      
      // Also try to send to any custom error handler
      try {
        const errorEvent = new CustomEvent('app:error', {
          detail: { error, errorInfo, source: 'ProductionErrorBoundary' },
        });
        window.dispatchEvent(errorEvent);
      } catch (e) {
        // Ignore if custom event fails
      }
    }
    
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This section couldn't load properly. Try refreshing the page.
            </p>
            <p className="text-xs text-muted-foreground">
              If it keeps happening, <a href="/dashboard/support" className="underline underline-offset-2 hover:text-foreground">contact support</a>.
            </p>
            <Button
              variant="outline" 
              size="sm"
              onClick={() => {
                this.setState({ hasError: false, error: undefined });
                window.location.reload();
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}