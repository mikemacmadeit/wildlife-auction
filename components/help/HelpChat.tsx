'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Send, MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ title: string; slug?: string }>;
  suggestedQuestions?: string[];
  timestamp: Date;
};

export function HelpChat({ onSwitchToSupport }: { onSwitchToSupport: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-detect context from URL
  const context = useMemo(() => {
    const listingId = searchParams?.get('listingId') || (pathname?.match(/\/listing\/([^/]+)/)?.[1]);
    const orderId = searchParams?.get('orderId') || (pathname?.match(/\/orders\/([^/]+)/)?.[1]);
    return {
      pathname: pathname || '',
      listingId: listingId || undefined,
      orderId: orderId || undefined,
    };
  }, [pathname, searchParams]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const token = user ? await user.getIdToken() : null;
      const res = await fetch('/api/help/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage.content,
          role: 'all', // Will be auto-detected on server
          context,
          conversationHistory: messages.slice(-5).map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) {
        // Better error messages
        let errorMessage = body?.error || body?.message || 'Failed to get response';
        if (res.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (res.status === 503) {
          errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
        } else if (res.status >= 500) {
          errorMessage = 'Server error. Please try again or contact support.';
        }
        throw new Error(errorMessage);
      }

      // Convert sources to objects with title and slug
      const sources = (body.sources || []).map((title: string) => ({
        title,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      }));
      
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: body.answer || "I'm sorry, I couldn't generate a response. Please try contacting support.",
        sources,
        suggestedQuestions: body.suggestedQuestions || [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // If KB is not available, suggest switching to support
      if (body.kbAvailable === false && messages.length === 0) {
        toast({
          title: 'Knowledge Base Setup',
          description: 'The Knowledge Base is being set up. Use the Support tab for immediate help.',
        });
      }
    } catch (e: any) {
      toast({
        title: 'Chat Error',
        description: e?.message || 'Failed to send message. Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, user, context, messages.length, toast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">Ask a Question</h3>
              <p className="text-sm text-muted-foreground mt-1">
                I can help answer questions about using the platform. Type your question below.
              </p>
            </div>
            {!user && (
              <Card className="border-2 bg-muted/20 max-w-sm">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">
                    Sign in for a better experience and to save your conversation history.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'rounded-lg px-4 py-2 max-w-[80%]',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-xs font-semibold mb-1">Sources:</p>
                      <ul className="text-xs space-y-1">
                        {msg.sources.map((source, idx) => (
                          <li key={idx}>
                            <a
                              href={`/help/${source.slug || source.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              • {source.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-border/50">
                      <p className="text-xs font-semibold mb-2">You might also ask:</p>
                      <div className="flex flex-wrap gap-2">
                        {msg.suggestedQuestions.map((question, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            className="text-xs h-auto py-1 px-2"
                            onClick={() => {
                              setInput(question);
                              // Auto-send after a brief delay
                              setTimeout(() => {
                                sendMessage();
                              }, 100);
                            }}
                          >
                            {question}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start gap-3">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="border-t border-border p-4 sm:p-6 space-y-3">
        {messages.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Can't find what you need?</span>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onSwitchToSupport}>
              Contact Support
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your question..."
            className="min-h-[60px] resize-none"
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={loading || !input.trim()} className="min-h-[60px] min-w-[60px]">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
