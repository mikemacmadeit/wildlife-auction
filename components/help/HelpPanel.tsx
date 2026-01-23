'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ExternalLink, Sparkles, ListChecks, AlertTriangle, PhoneCall, MessageSquare, HelpCircle, Send, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { HelpContent } from '@/help/helpContent';
import { HelpChat } from '@/components/help/HelpChat';
import { HelpTicketForm } from '@/components/help/HelpTicketForm';

// Default help content for pages without a specific helpKey
const DEFAULT_HELP_CONTENT: HelpContent = {
  key: 'default' as any,
  title: 'Help Center',
  oneLiner: 'Get help, ask questions, or contact support.',
  checklist: [
    'Use the "Ask" tab to chat with our AI assistant',
    'Use the "Support" tab to create a support ticket',
    'Browse our knowledge base articles for common questions',
    'Contact support if you need immediate assistance',
  ],
  quickActions: [
    { label: 'Browse Listings', href: '/browse' },
    { label: 'Create Listing', href: '/dashboard/listings/new' },
    { label: 'My Orders', href: '/dashboard/orders' },
    { label: 'Account Settings', href: '/dashboard/account' },
  ],
};

export function HelpPanel(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HelpContent | null;
  onStartTour?: () => void;
  showStartTour?: boolean;
}) {
  const { open, onOpenChange, content, onStartTour, showStartTour } = props;
  const [activeTab, setActiveTab] = useState<'help' | 'chat' | 'support'>('help');
  
  // Use default content if no specific content is available
  const displayContent = content || DEFAULT_HELP_CONTENT;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn('w-[92vw] sm:w-[520px] sm:max-w-none', 'p-0 overflow-hidden')}
      >
        <div className="flex h-full flex-col">
          <div className="p-5 sm:p-6 border-b border-border">
            <SheetHeader className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <SheetTitle className="text-xl sm:text-2xl font-extrabold">Help Center</SheetTitle>
                  <SheetDescription className="text-sm sm:text-base">
                    Get help, ask questions, or contact support.
                  </SheetDescription>
                </div>
                <Badge variant="secondary" className="font-semibold shrink-0">
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Help
                </Badge>
              </div>

              {showStartTour && onStartTour && (
                <div className="pt-2">
                  <Button type="button" className="w-full min-h-[44px] font-semibold" onClick={onStartTour}>
                    Start tour
                  </Button>
                </div>
              )}
            </SheetHeader>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 sm:px-6 border-b border-border">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="help" className="text-xs sm:text-sm">
                  <HelpCircle className="h-3.5 w-3.5 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Help</span>
                </TabsTrigger>
                <TabsTrigger value="chat" className="text-xs sm:text-sm">
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Ask</span>
                </TabsTrigger>
                <TabsTrigger value="support" className="text-xs sm:text-sm">
                  <PhoneCall className="h-3.5 w-3.5 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Support</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="help" className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 mt-0">
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-extrabold uppercase tracking-wide text-foreground">Checklist</h3>
                </div>
                <ul className="space-y-2">
                  {(displayContent?.checklist || []).slice(0, 7).map((item, idx) => (
                    <li key={idx} className="flex gap-3 text-sm leading-relaxed">
                      <span className="mt-1 h-2 w-2 rounded-full bg-primary/70 flex-shrink-0" />
                      <span className="text-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {displayContent?.commonMistakes && displayContent.commonMistakes.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-extrabold uppercase tracking-wide text-foreground">Common mistakes</h3>
                  </div>
                  <ul className="space-y-2">
                    {displayContent.commonMistakes.slice(0, 7).map((item, idx) => (
                      <li key={idx} className="flex gap-3 text-sm leading-relaxed">
                        <span className="mt-1 h-2 w-2 rounded-full bg-amber-500/80 flex-shrink-0" />
                        <span className="text-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {displayContent?.quickActions && displayContent.quickActions.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-extrabold uppercase tracking-wide text-foreground">Quick actions</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {displayContent.quickActions.slice(0, 6).map((qa) => (
                      <Button key={qa.href} asChild variant="outline" className="justify-between min-h-[44px] font-semibold">
                        <Link href={qa.href}>
                          <span className="truncate">{qa.label}</span>
                          <ExternalLink className="h-4 w-4 opacity-70" />
                        </Link>
                      </Button>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="chat" className="flex-1 overflow-hidden mt-0">
              <HelpChat onSwitchToSupport={() => setActiveTab('support')} />
            </TabsContent>

            <TabsContent value="support" className="flex-1 overflow-hidden mt-0">
              <HelpTicketForm />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
