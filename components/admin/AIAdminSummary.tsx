/**
 * AI Admin Summary Component
 * 
 * Displays AI-generated summaries for admin review.
 * READ-ONLY and ADVISORY - no actions, no user-facing language.
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

export type EntityType = 'user' | 'listing' | 'order' | 'support_ticket';

interface AIAdminSummaryProps {
  entityType: EntityType;
  entityId: string;
  existingSummary?: string | null;
  existingSummaryAt?: Date | string | null;
  existingSummaryModel?: string | null;
  onSummaryUpdated?: (summary: string, model: string, generatedAt: Date) => void;
}

export function AIAdminSummary({
  entityType,
  entityId,
  existingSummary,
  existingSummaryAt,
  existingSummaryModel,
  onSummaryUpdated,
}: AIAdminSummaryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(existingSummary || null);
  const [summaryAt, setSummaryAt] = useState<Date | null>(
    existingSummaryAt
      ? existingSummaryAt instanceof Date
        ? existingSummaryAt
        : new Date(existingSummaryAt)
      : null
  );
  const [summaryModel, setSummaryModel] = useState<string | null>(existingSummaryModel || null);
  const [error, setError] = useState<string | null>(null);

  // Update local state when props change
  useEffect(() => {
    setSummary(existingSummary || null);
    setSummaryAt(
      existingSummaryAt
        ? existingSummaryAt instanceof Date
          ? existingSummaryAt
          : new Date(existingSummaryAt)
        : null
    );
    setSummaryModel(existingSummaryModel || null);
  }, [existingSummary, existingSummaryAt, existingSummaryModel]);

  const generateSummary = async (forceRegenerate = false) => {
    if (!user) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in to generate summaries.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/ai-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          entityType,
          entityId,
          forceRegenerate,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || data.message || 'Failed to generate summary');
      }

      setSummary(data.summary);
      setSummaryAt(new Date(data.generatedAt));
      setSummaryModel(data.model);

      if (onSummaryUpdated) {
        onSummaryUpdated(data.summary, data.model, new Date(data.generatedAt));
      }

      if (data.cached) {
        toast({
          title: 'Summary loaded',
          description: 'Using cached summary (less than 24 hours old).',
        });
      } else {
        toast({
          title: 'Summary generated',
          description: 'AI summary has been generated successfully.',
        });
      }
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to generate summary';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate on mount if no summary exists
  useEffect(() => {
    if (!summary && !loading && user && entityId) {
      // Small delay to avoid race conditions
      const timer = setTimeout(() => {
        void generateSummary(false);
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error && error.includes('disabled')) {
    // Feature is disabled - don't show component
    return null;
  }

  return (
    <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-sm font-semibold">AI Summary (Internal – Advisory)</CardTitle>
          </div>
          {summary && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => generateSummary(true)}
              disabled={loading}
              className="h-7 px-2 text-xs"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
        <CardDescription className="text-xs mt-1">
          AI-generated summary for internal admin review. This is informational only and does not affect any decisions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !summary ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Generating summary...</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-sm text-destructive py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Error generating summary</div>
              <div className="text-xs text-muted-foreground mt-1">{error}</div>
            </div>
          </div>
        ) : summary ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
            {summaryAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                <span>
                  Generated {summaryAt.toLocaleDateString()} at {summaryAt.toLocaleTimeString()}
                </span>
                {summaryModel && <span>• Model: {summaryModel}</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-2">
            No summary available. Click to generate.
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateSummary(false)}
              disabled={loading}
              className="ml-2 h-7"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Generate Summary
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
