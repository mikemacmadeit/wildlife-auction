'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MessageSquare, Send, AlertTriangle, Flag } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Message, MessageThread } from '@/lib/types';
import { subscribeToThreadMessages, sendMessage, markThreadAsRead, flagThread } from '@/lib/firebase/messages';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface MessageThreadProps {
  thread: MessageThread;
  listingTitle: string;
  otherPartyName: string;
  otherPartyAvatar?: string;
  orderStatus?: 'pending' | 'paid' | 'completed';
}

export function MessageThreadComponent({
  thread,
  listingTitle,
  otherPartyName,
  otherPartyAvatar,
  orderStatus,
}: MessageThreadProps) {
  const { user, initialized: authInitialized } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isPaid, setIsPaid] = useState(orderStatus === 'paid' || orderStatus === 'completed');
  const [listenError, setListenError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toDateSafe = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) return d;
      } catch {
        // ignore
      }
    }
    if (typeof value?.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
  };

  // Subscribe to messages
  useEffect(() => {
    if (!thread.id) return;
    if (!authInitialized) return;
    if (!user?.uid) return;
    setListenError(null);

    const unsubscribe = subscribeToThreadMessages(
      thread.id,
      (newMessages) => {
        setMessages(newMessages);
        // Mark as read when viewing (best-effort; never crash the listener)
        void markThreadAsRead(thread.id, user.uid).catch(() => {});
      },
      {
        onError: (err: any) => {
          const code = String(err?.code || '');
          const msg = String(err?.message || 'Failed to load messages');
          if (code === 'permission-denied') {
            setListenError('You do not have permission to view this conversation.');
          } else {
            setListenError('Failed to load messages. Please refresh and try again.');
          }
          console.error('[MessageThread] subscribeToThreadMessages error', err);
          toast({
            title: 'Messaging error',
            description: code ? `${msg} (${code})` : msg,
            variant: 'destructive',
          });
        },
      }
    );

    return () => unsubscribe();
  }, [authInitialized, thread.id, toast, user?.uid]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update paid status
  useEffect(() => {
    setIsPaid(orderStatus === 'paid' || orderStatus === 'completed');
  }, [orderStatus]);

  const handleSend = async () => {
    if (!messageInput.trim() || !user || sending) return;

    setSending(true);
    try {
      await sendMessage(
        thread.id,
        user.uid,
        user.uid === thread.buyerId ? thread.sellerId : thread.buyerId,
        thread.listingId,
        messageInput.trim(),
        orderStatus
      );
      setMessageInput('');
    } catch (error: any) {
      const code = typeof error?.code === 'string' ? error.code : '';
      toast({
        title: 'Error sending message',
        description: code ? `${error.message || 'Failed to send message'} (${code})` : error.message || 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleFlag = async () => {
    if (!user) return;
    try {
      await flagThread(thread.id, user.uid);
      toast({
        title: 'Thread flagged',
        description: 'This conversation has been flagged for admin review.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to flag thread',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={otherPartyAvatar} />
            <AvatarFallback>{otherPartyName.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{otherPartyName}</p>
            <p className="text-sm text-muted-foreground">{listingTitle}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleFlag}>
          <Flag className="h-4 w-4 mr-2" />
          Report
        </Button>
      </div>

      {/* Safety Notice */}
      {!isPaid && (
        <Alert className="m-4 border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/25 dark:text-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-700 dark:text-orange-300" />
          <AlertDescription className="text-sm text-orange-950 dark:text-orange-50">
            <strong>For your safety:</strong> Keep communication and payment on Wildlife Exchange. 
            Contact info unlocks after payment is completed.
          </AlertDescription>
        </Alert>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {listenError ? (
          <Alert className="border-destructive/40 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {listenError}
            </AlertDescription>
          </Alert>
        ) : null}
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isSender = message.senderId === user?.uid;
            const createdAt = toDateSafe((message as any).createdAt);
            return (
              <div
                key={message.id}
                className={cn('flex gap-2', isSender ? 'justify-end' : 'justify-start')}
              >
                {!isSender && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={otherPartyAvatar} />
                    <AvatarFallback>{otherPartyName.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-[75%] rounded-lg p-3',
                    isSender
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-muted border border-border'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
                  {message.wasRedacted && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      Contact details redacted
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : '—'}
                  </p>
                </div>
                {isSender && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20">You</AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Type your message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={!messageInput.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!isPaid && (
          <p className="text-xs text-muted-foreground mt-2">
            Contact details are hidden until payment is completed.
          </p>
        )}
      </div>
    </div>
  );
}
