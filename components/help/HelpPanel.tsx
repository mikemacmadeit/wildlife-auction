'use client';

import Link from 'next/link';
import { ExternalLink, Sparkles, ListChecks, AlertTriangle, PhoneCall } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { HelpContent } from '@/help/helpContent';

export function HelpPanel(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: HelpContent | null;
  onStartTour?: () => void;
  showStartTour?: boolean;
}) {
  const { open, onOpenChange, content, onStartTour, showStartTour } = props;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'w-[92vw] sm:w-[520px] sm:max-w-none',
          'p-0 overflow-hidden'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="p-5 sm:p-6">
            <SheetHeader className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <SheetTitle className="text-xl sm:text-2xl font-extrabold">
                    {content?.title || 'Help'}
                  </SheetTitle>
                  <SheetDescription className="text-sm sm:text-base">
                    {content?.oneLiner || 'Contextual help for this page will appear here.'}
                  </SheetDescription>
                </div>
                <Badge variant="secondary" className="font-semibold shrink-0">
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Tutorials
                </Badge>
              </div>

              {showStartTour && onStartTour && (
                <div className="pt-2">
                  <Button
                    type="button"
                    className="w-full min-h-[44px] font-semibold"
                    onClick={onStartTour}
                  >
                    Start tour
                  </Button>
                </div>
              )}
            </SheetHeader>
          </div>

          <Separator />

          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
                  Checklist
                </h3>
              </div>
              <ul className="space-y-2">
                {(content?.checklist || []).slice(0, 7).map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-relaxed">
                    <span className="mt-1 h-2 w-2 rounded-full bg-primary/70 flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
                {(!content?.checklist || content.checklist.length === 0) && (
                  <li className="text-sm text-muted-foreground">
                    No checklist is defined for this page yet.
                  </li>
                )}
              </ul>
            </section>

            {content?.commonMistakes && content.commonMistakes.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
                    Common mistakes
                  </h3>
                </div>
                <ul className="space-y-2">
                  {content.commonMistakes.slice(0, 7).map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed">
                      <span className="mt-1 h-2 w-2 rounded-full bg-amber-500/80 flex-shrink-0" />
                      <span className="text-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {content?.quickActions && content.quickActions.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-foreground">
                  Quick actions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {content.quickActions.slice(0, 6).map((qa) => (
                    <Button
                      key={qa.href}
                      asChild
                      variant="outline"
                      className="justify-between min-h-[44px] font-semibold"
                    >
                      <Link href={qa.href}>
                        <span className="truncate">{qa.label}</span>
                        <ExternalLink className="h-4 w-4 opacity-70" />
                      </Link>
                    </Button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <Separator />

          <div className="p-5 sm:p-6">
            <div className="rounded-lg border bg-background/40 p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <PhoneCall className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Need help from support?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  If something feels confusing or broken, send us a message and we’ll fix the UX.
                </p>
                <div className="mt-3">
                  <Button asChild variant="secondary" className="min-h-[40px] font-semibold">
                    <Link href="/contact">
                      Contact support <ExternalLink className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

