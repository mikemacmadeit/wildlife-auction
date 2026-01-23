'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface AIAdminDraftProps {
  ticketId: string;
  existingDraft?: string | null;
  existingGeneratedAt?: Date | null;
  existingModel?: string | null;
  onDraftChange?: (draft: string) => void;
  disabled?: boolean;
}

export function AIAdminDraft({
  ticketId,
  existingDraft,
  existingGeneratedAt,
  existingModel,
  onDraftChange,
  disabled = false,
}: AIAdminDraftProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState<string>(existingDraft || '');
  const [generatedAt, setGeneratedAt] = useState<Date | null>(existingGeneratedAt || null);
  const [model, setModel] = useState<string | null>(existingModel || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateDraft = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!user || !ticketId) return;

      setLoading(true);
      setError(null);

      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/support/tickets/${ticketId}/ai-draft`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!res.ok || data?.ok !== true) {
          throw new Error(data?.message || data?.error || 'Failed to generate AI draft');
        }

        setDraft(data.draft);
        setGeneratedAt(data.generatedAt ? new Date(data.generatedAt) : null);
        setModel(data.model);
        if (onDraftChange) {
          onDraftChange(data.draft);
        }
      } catch (e: any) {
        console.error('Error generating AI draft:', e);
        setError(e.message || 'Could not generate AI draft.');
        toast({
          title: 'AI Draft Error',
          description: e.message || 'Failed to generate AI draft.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [user, ticketId, onDraftChange, toast]
  );

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      if (onDraftChange) {
        onDraftChange(value);
      }
    },
    [onDraftChange]
  );

  // Auto-load draft if it exists and we don't have one yet
  useEffect(() => {
    if (existingDraft && !draft && !loading && !error) {
      setDraft(existingDraft);
      if (existingGeneratedAt) {
        setGeneratedAt(existingGeneratedAt);
      }
      if (existingModel) {
        setModel(existingModel);
      }
    }
  }, [existingDraft, existingGeneratedAt, existingModel, draft, loading, error]);

  return (
    <Card className="border-2 bg-muted/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold">AI Draft Response (Internal)</CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateDraft(true)}
          disabled={loading || disabled}
          className="h-7 text-xs"
        >
          {loading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          {loading ? 'Generating...' : draft ? 'Regenerate' : 'Generate Draft'}
        </Button>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        {loading && !draft ? (
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Generating draft...
          </div>
        ) : error ? (
          <div className="space-y-2">
            <div className="flex items-center text-destructive">
              <AlertCircle className="h-4 w-4 mr-2" />
              {error}
            </div>
            {error.includes('disabled') && (
              <p className="text-xs text-muted-foreground">
                To enable this feature, set <code className="bg-muted px-1 rounded">AI_ADMIN_DRAFT_ENABLED=true</code> in your environment variables and ensure <code className="bg-muted px-1 rounded">OPENAI_API_KEY</code> is configured.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground font-semibold">
                Edit the draft below before sending. This is a suggested response only.
              </div>
              <Textarea
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                placeholder="AI draft will appear here..."
                className="min-h-[120px] text-sm"
                disabled={disabled}
              />
            </div>
            {generatedAt && (
              <p className="text-xs text-muted-foreground">
                Generated {formatDistanceToNow(generatedAt, { addSuffix: true })} by {model || 'AI'}.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
