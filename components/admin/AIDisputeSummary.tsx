/**
 * AI Dispute Summary Component
 * 
 * Displays AI-generated dispute summaries for admin review.
 * READ-ONLY and ADVISORY - no actions, no user-facing language.
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

interface AIDisputeSummaryProps {
  orderId: string;
  existingSummary?: string | null;
  existingFacts?: string[] | null;
  existingReviewedAt?: Date | string | null;
  existingModel?: string | null;
  onSummaryUpdated?: (summary: string, facts: string[], model: string, generatedAt: Date) => void;
}

export function AIDisputeSummary({
  orderId,
  existingSummary,
  existingFacts,
  existingReviewedAt,
  existingModel,
  onSummaryUpdated,
}: AIDisputeSummaryProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(existingSummary || null);
  const [facts, setFacts] = useState<string[]>(existingFacts || []);
  const [reviewedAt, setReviewedAt] = useState<Date | null>(
    existingReviewedAt
      ? existingReviewedAt instanceof Date
        ? existingReviewedAt
        : new Date(existingReviewedAt)
      : null
  );
  const [model, setModel] = useState<string | null>(existingModel || null);
  const [error, setError] = useState<string | null>(null);

  // Update local state when props change
  useEffect(() => {
    setSummary(existingSummary || null);
    setFacts(existingFacts || []);
    setReviewedAt(
      existingReviewedAt
        ? existingReviewedAt instanceof Date
          ? existingReviewedAt
          : new Date(existingReviewedAt)
        : null
    );
    setModel(existingModel || null);
  }, [existingSummary, existingFacts, existingReviewedAt, existingModel]);

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
      const response = await fetch(`/api/admin/disputes/${orderId}/ai-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          forceRegenerate,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || data.message || 'Failed to generate summary');
      }

      setSummary(data.summary);
      setFacts(Array.isArray(data.facts) ? data.facts : []);
      setReviewedAt(new Date(data.generatedAt));
      setModel(data.model);

      if (onSummaryUpdated) {
        onSummaryUpdated(data.summary, data.facts || [], data.model, new Date(data.generatedAt));
      }

      if (data.cached) {
        toast({
          title: 'Summary loaded',
          description: 'Using cached summary (less than 24 hours old).',
        });
      } else {
        toast({
          title: 'Summary generated',
          description: 'AI dispute summary has been generated successfully.',
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

  // Auto-generate on mount if no summary exists and order has dispute
  useEffect(() => {
    if (!summary && !loading && user && orderId) {
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

  if (error && error.includes('does not have an active dispute')) {
    // Order doesn't have a dispute - don't show component
    return null;
  }

  return (
    <Card className="border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <CardTitle className="text-sm font-semibold">AI Dispute Summary (Internal – Advisory)</CardTitle>
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
          AI-generated summary for internal admin review. This is informational only and does not affect any decisions or outcomes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !summary ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Generating dispute summary...</span>
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
          <div className="space-y-4">
            {/* Summary Paragraph */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Summary</h4>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{summary}</p>
            </div>

            {/* Key Facts / Timeline */}
            {facts.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Key Facts</h4>
                <ul className="space-y-1.5">
                  {facts.map((fact, idx) => (
                    <li key={idx} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-amber-600 dark:text-amber-400 mt-1 shrink-0">•</span>
                      <span className="flex-1">{fact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metadata */}
            {reviewedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                <span>
                  Generated {reviewedAt.toLocaleDateString()} at {reviewedAt.toLocaleTimeString()}
                </span>
                {model && <span>• Model: {model}</span>}
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
