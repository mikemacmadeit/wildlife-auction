'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  MessageSquare,
  Search,
  Send,
  Package,
  User,
  MapPin,
  Filter,
  Check,
  CheckCheck,
  MoreVertical,
  Archive,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { mockConversations, Conversation, Message } from '@/lib/seller-mock-data';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { subscribeToUnreadCountByType, markNotificationsAsReadByType } from '@/lib/firebase/notifications';

type FilterType = 'all' | 'unread' | 'archived';

export default function SellerMessagesPage() {
  const { user } = useAuth();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  // NOTE: This page still uses mock conversations for now; we keep UI stable but
  // we source the unread badge from real notifications so it matches the sidebar.
  const [conversations, setConversations] = useState<Conversation[]>(
    mockConversations.map((c) => ({ ...c, unreadCount: 0 }))
  );
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(
    mockConversations[0] ? { ...mockConversations[0], unreadCount: 0 } : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [messageInput, setMessageInput] = useState('');
  const [quickReplySelected, setQuickReplySelected] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Real unread count (message notifications) — this is what the sidebar badge uses too.
  useEffect(() => {
    if (!user?.uid) {
      setUnreadMessageCount(0);
      return;
    }
    const unsub = subscribeToUnreadCountByType(user.uid, 'message_received', (count) => {
      setUnreadMessageCount(count || 0);
    });
    return () => unsub();
  }, [user?.uid]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversation?.messages]);

  // Auto-fill message input when quick reply is selected
  useEffect(() => {
    if (quickReplySelected) {
      setMessageInput(quickReplySelected);
      setQuickReplySelected(null);
    }
  }, [quickReplySelected]);

  const filteredConversations = useMemo(() => {
    let result = [...conversations];

    // Filter by type
    if (filterType === 'unread') {
      result = result.filter((conv) => conv.unreadCount > 0);
    } else if (filterType === 'archived') {
      // For now, just return empty - can add archived status later
      result = [];
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (conv) =>
          conv.listingTitle.toLowerCase().includes(query) ||
          conv.buyer.name.toLowerCase().includes(query) ||
          conv.lastMessage.toLowerCase().includes(query)
      );
    }

    // Sort by last message time (most recent first)
    return result.sort((a, b) => b.lastMessageTime.getTime() - a.lastMessageTime.getTime());
  }, [conversations, searchQuery, filterType]);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConversation) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'seller',
      content: messageInput.trim(),
      timestamp: new Date(),
    };

    // Update the conversation with the new message
    const updatedConversations = conversations.map((conv) => {
      if (conv.id === selectedConversation.id) {
        const updatedConv = {
          ...conv,
          messages: [...conv.messages, newMessage],
          lastMessage: newMessage.content,
          lastMessageTime: newMessage.timestamp,
          unreadCount: 0, // Mark as read when seller sends a message
        };
        setSelectedConversation(updatedConv);
        return updatedConv;
      }
      return conv;
    });

    setConversations(updatedConversations);
    setMessageInput('');
  };

  const handleQuickReply = (reply: string) => {
    setMessageInput(reply);
    // Optionally auto-send, or just fill the input
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const markAsRead = (conversationId: string) => {
    // Persistently clear unread MESSAGE notifications so counts don't come back on navigation.
    if (user?.uid) {
      markNotificationsAsReadByType(user.uid, 'message_received').catch((e) => {
        console.error('Failed to mark message notifications as read:', e);
      });
    }
  };

  // Group messages by date
  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';

    messages.forEach((message) => {
      const messageDate = new Date(message.timestamp).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: message.timestamp.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      });

      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({ date: messageDate, messages: [message] });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    });

    return groups;
  };

  const quickReplies = [
    "Yes, it's available.",
    "Happy to provide more photos.",
    "Transport can be quoted—what's your ranch address?",
    "The animal is in excellent health.",
    "Papers are included in the sale.",
    "The auction ends soon—place your bid now!",
  ];

  const totalUnread = unreadMessageCount;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground">
              Messages
            </h1>
            {totalUnread > 0 && (
              <Badge variant="destructive" className="text-sm font-semibold">
                {totalUnread} unread
              </Badge>
            )}
          </div>
          <p className="text-base md:text-lg text-muted-foreground">
            Manage conversations with buyers about your listings
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Conversations List */}
          <div className="lg:col-span-1 space-y-4">
            {/* Search and Filters */}
            <Card className="border-2 border-border/50 bg-card">
              <CardContent className="pt-6 pb-6 px-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 h-11 bg-background"
                  />
                </div>

                {/* Filter Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant={filterType === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('all')}
                    className="flex-1 text-xs font-semibold"
                  >
                    All
                  </Button>
                  <Button
                    variant={filterType === 'unread' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterType('unread')}
                    className="flex-1 text-xs font-semibold"
                  >
                    Unread
                    {totalUnread > 0 && (
                      <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-xs">
                        {totalUnread}
                      </Badge>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Conversation List */}
            <Card className="border-2 border-border/50 bg-card">
              <CardContent className="p-0">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground font-medium mb-1">
                      No conversations found
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {filterType === 'unread' ? 'No unread messages' : 'Try adjusting your search'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50 max-h-[600px] overflow-y-auto">
                    {filteredConversations.map((conversation) => {
                      const isSelected = selectedConversation?.id === conversation.id;
                      return (
                        <button
                          key={conversation.id}
                          onClick={() => {
                            setSelectedConversation(conversation);
                            markAsRead(conversation.id);
                          }}
                          className={cn(
                            'w-full p-4 text-left hover:bg-background/50 transition-colors',
                            isSelected && 'bg-primary/10 border-l-4 border-primary'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10 border-2 border-border/50">
                              <AvatarImage src={conversation.buyer.avatar} alt={conversation.buyer.name} />
                              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                {conversation.buyer.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="font-semibold text-foreground truncate">
                                  {conversation.buyer.name}
                                </p>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {/* Per-conversation unread is not wired to Firestore yet; use the global unread badge in the header/sidebar */}
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {formatDistanceToNow(conversation.lastMessageTime, { addSuffix: true })}
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground font-medium mb-1 truncate">
                                {conversation.listingTitle}
                              </p>
                              <p
                                className={cn(
                                  'text-sm truncate',
                                  'text-muted-foreground'
                                )}
                              >
                                {conversation.lastMessage}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Message Thread */}
          <div className="lg:col-span-2">
            {selectedConversation ? (
              <Card className="border-2 border-border/50 bg-card h-full flex flex-col">
                <CardHeader className="border-b border-border/50 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Avatar className="h-12 w-12 border-2 border-border/50">
                        <AvatarImage
                          src={selectedConversation.buyer.avatar}
                          alt={selectedConversation.buyer.name}
                        />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-base">
                          {selectedConversation.buyer.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-xl font-extrabold mb-2 truncate">
                          {selectedConversation.buyer.name}
                        </CardTitle>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Package className="h-4 w-4 flex-shrink-0" />
                            <Link
                              href={`/listing/${selectedConversation.listingId}`}
                              className="font-semibold hover:text-primary truncate"
                            >
                              {selectedConversation.listingTitle}
                            </Link>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span>{selectedConversation.buyer.location}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {/* Messages */}
                <CardContent className="flex-1 overflow-y-auto pt-6 pb-6 px-4 md:px-6 space-y-6 min-h-[400px] max-h-[600px]">
                  {groupMessagesByDate(selectedConversation.messages).map((group, groupIndex) => (
                    <div key={groupIndex} className="space-y-4">
                      {/* Date Separator */}
                      <div className="flex items-center gap-3">
                        <Separator className="flex-1" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {group.date === new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                            ? 'Today'
                            : group.date}
                        </span>
                        <Separator className="flex-1" />
                      </div>

                      {/* Messages in this group */}
                      {group.messages.map((message) => {
                        const isSeller = message.sender === 'seller';
                        return (
                          <div
                            key={message.id}
                            className={cn('flex gap-3', isSeller ? 'justify-end' : 'justify-start')}
                          >
                            {!isSeller && (
                              <Avatar className="h-8 w-8 border border-border/50 flex-shrink-0">
                                <AvatarImage
                                  src={selectedConversation.buyer.avatar}
                                  alt={selectedConversation.buyer.name}
                                />
                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                  {selectedConversation.buyer.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div
                              className={cn(
                                'max-w-[75%] md:max-w-[70%] rounded-lg p-3 space-y-1',
                                isSeller
                                  ? 'bg-primary/10 text-foreground border border-primary/20'
                                  : 'bg-background/50 text-foreground border border-border/50'
                              )}
                            >
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                                </span>
                                {isSeller && (
                                  <CheckCheck className="h-3 w-3 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                            {isSeller && (
                              <Avatar className="h-8 w-8 border border-border/50 flex-shrink-0">
                                <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                                  You
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </CardContent>

                <Separator />

                {/* Quick Replies */}
                <CardContent className="pt-4 pb-4 px-4 md:px-6">
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Quick Replies</p>
                    <div className="flex flex-wrap gap-2">
                      {quickReplies.map((reply, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-semibold"
                          onClick={() => handleQuickReply(reply)}
                        >
                          {reply}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Message Input */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type your message..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="flex-1 h-11 bg-background"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim()}
                      className="min-h-[44px] min-w-[44px] font-semibold"
                      size="icon"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-2 border-border/50 bg-card h-full flex items-center justify-center min-h-[400px]">
                <CardContent className="text-center p-8">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No conversation selected</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a conversation from the list to view messages
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
