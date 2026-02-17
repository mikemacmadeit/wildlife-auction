'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-base font-extrabold tracking-tight">{props.title}</div>
      <div className="text-sm text-foreground space-y-2">{props.children}</div>
    </div>
  );
}

function Bullets(props: { items: string[] }) {
  return (
    <ul className="list-disc ml-5 space-y-1">
      {props.items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export type LegalDocsModalTab = 'tos' | 'marketplacePolicies' | 'sellerPolicy' | 'buyerAcknowledgment';

export function LegalDocsModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: LegalDocsModalTab;
  /**
   * If provided, the modal shows an "I agree" checkbox + primary CTA.
   * This is the most user-friendly flow for signup / updated-terms gates.
   */
  agreeAction?: {
    label?: string;
    buttonText?: string;
    onConfirm: () => void;
  };
}) {
  const [tab, setTab] = useState<LegalDocsModalTab>(props.initialTab || 'tos');
  const [agreeChecked, setAgreeChecked] = useState(false);

  const versionLabel = useMemo(() => {
    return `ToS ${LEGAL_VERSIONS.tos.version} • Policies ${LEGAL_VERSIONS.marketplacePolicies.version}`;
  }, []);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        props.onOpenChange(o);
        if (o) {
          if (props.initialTab) setTab(props.initialTab);
          setAgreeChecked(false);
        }
      }}
    >
      <DialogContent className="border-2 w-[calc(100vw-2rem)] sm:w-full sm:max-w-4xl lg:max-w-5xl max-h-[90dvh] sm:max-h-[90vh] flex flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <DialogTitle>Legal documents</DialogTitle>
              <DialogDescription>
                Read the full Terms and policies here. You do not need to leave this page.
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="font-mono">
              {versionLabel}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as LegalDocsModalTab)} className="w-full flex flex-col flex-1 min-h-0 overflow-hidden mt-3">
          <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full shrink-0">
            <TabsTrigger value="tos">Terms</TabsTrigger>
            <TabsTrigger value="marketplacePolicies">Marketplace</TabsTrigger>
            <TabsTrigger value="sellerPolicy">Seller</TabsTrigger>
            <TabsTrigger value="buyerAcknowledgment">Buyer</TabsTrigger>
          </TabsList>

          {/* Native overflow scroll for reliable touch scrolling on mobile (Radix ScrollArea can block it) */}
          <div
            className="mt-3 flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-xl border bg-background overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            <TabsContent value="tos" className="mt-0 data-[state=inactive]:hidden focus-visible:outline-none focus-visible:ring-0">
              <div className="p-5 space-y-6">
                  <div className="text-xs text-muted-foreground">
                    Effective {LEGAL_VERSIONS.tos.effectiveDateLabel} (version {LEGAL_VERSIONS.tos.version}). Full page:{' '}
                    <Link href="/terms" className="underline underline-offset-4">
                      /terms
                    </Link>
                  </div>

                  <Section title="A) Marketplace-only status">
                    <Bullets
                      items={[
                        'Agchange is a technology platform only.',
                        'Agchange is not the seller, dealer, broker, agent, or auctioneer.',
                        'Agchange does not take title to any animal or good.',
                        'Agchange does not inspect, house, handle, transport, or take custody of animals or goods.',
                      ]}
                    />
                  </Section>

                  <Section title="B) Contract is between buyer and seller">
                    <Bullets
                      items={[
                        'Buyers and sellers contract directly with each other.',
                        'Agchange is not a party to the transaction.',
                        'Any sale agreement is solely between buyer and seller.',
                      ]}
                    />
                  </Section>

                  <Section title="C) Live Animal Transactions & Assumption of Risk">
                    <Bullets
                      items={[
                        'Live animals involve inherent risks (handling stress, transport stress, disease exposure, acclimation issues, injury, illness, escape, mortality).',
                        'Agchange makes no representations regarding health, viability, genetics, temperament, training, or future performance.',
                        'Seller representations are made solely by the seller.',
                        'Buyer is responsible for due diligence (permits, records, veterinary checks, facility checks).',
                      ]}
                    />
                  </Section>

                  <Section title="D) Risk of loss transfer">
                    <Bullets
                      items={[
                        'Risk of loss, injury, illness, escape, or death transfers to the buyer upon delivery or pickup (as applicable).',
                        'Agchange bears no responsibility before, during, or after transport.',
                      ]}
                    />
                  </Section>

                  <Section title="E) AS-IS / NO WARRANTIES">
                    <Bullets
                      items={[
                        'All listings are provided “AS-IS, WHERE-IS.”',
                        'No express or implied warranties (including merchantability or fitness for a particular purpose).',
                        'Agchange disclaims all warranties to the maximum extent permitted by law.',
                      ]}
                    />
                  </Section>

                  <Section title="F) Transport disclaimer">
                    <Bullets
                      items={[
                        'Agchange does not arrange or provide transportation.',
                        'Any transport is between buyer, seller, and/or third-party carriers.',
                        'Agchange is not responsible for transport outcomes.',
                      ]}
                    />
                  </Section>

                  <Section title="G) Indemnification (critical)">
                    <Bullets
                      items={[
                        'Sellers must defend, indemnify, and hold harmless Agchange from claims arising from their listings and sales.',
                        'This includes claims related to animal injury, illness, death, disease, misrepresentation, legality, compliance, title/lien issues, and transport outcomes.',
                      ]}
                    />
                  </Section>

                  <Section title="H) Limitation of liability">
                    <Bullets
                      items={[
                        'Agchange is not liable for indirect, incidental, punitive, or consequential damages.',
                        'Total liability is capped at the fees paid to Agchange by you in the prior 12 months.',
                      ]}
                    />
                  </Section>

                  <Section title="I) Arbitration & class action waiver">
                    <Bullets
                      items={[
                        'Mandatory binding arbitration on an individual basis.',
                        'No class actions or class-wide arbitration.',
                        'Texas governing law (as stated in the full Terms).',
                      ]}
                    />
                  </Section>
                </div>
            </TabsContent>

            <TabsContent value="marketplacePolicies" className="mt-0 data-[state=inactive]:hidden focus-visible:outline-none focus-visible:ring-0">
              <div className="p-5 space-y-6">
                  <div className="text-xs text-muted-foreground">
                    Effective {LEGAL_VERSIONS.marketplacePolicies.effectiveDateLabel} (version {LEGAL_VERSIONS.marketplacePolicies.version}). Full page:{' '}
                    <Link href="/legal/marketplace-policies" className="underline underline-offset-4">
                      /legal/marketplace-policies
                    </Link>
                  </div>

                  <Section title="Category-level disclaimers (animals)">
                    <Bullets
                      items={[
                        'Agchange does not take custody, possession, or control of any animal at any time.',
                        'Health and legality representations are made solely by the seller.',
                        'Buyers must perform their own due diligence.',
                        'Risk transfers upon delivery or pickup (buyer/seller handle logistics).',
                      ]}
                    />
                  </Section>

                  <Section title="Category-level disclaimers (equipment / vehicles)">
                    <Bullets
                      items={[
                        'Listings are “AS-IS, WHERE-IS.” Agchange makes no warranty of condition, title, or fitness.',
                        'Buyer and seller handle inspection, title/VIN verification, liens, taxes, and transfer paperwork.',
                        'Agchange does not provide transport; hauling/shipping is arranged between buyer, seller, and third parties.',
                      ]}
                    />
                  </Section>
                </div>
            </TabsContent>

            <TabsContent value="sellerPolicy" className="mt-0 data-[state=inactive]:hidden focus-visible:outline-none focus-visible:ring-0">
              <div className="p-5 space-y-6">
                  <div className="text-xs text-muted-foreground">
                    Effective {LEGAL_VERSIONS.sellerPolicy.effectiveDateLabel} (version {LEGAL_VERSIONS.sellerPolicy.version}). Full page:{' '}
                    <Link href="/legal/seller-policy" className="underline underline-offset-4">
                      /legal/seller-policy
                    </Link>
                  </div>

                  <Section title="Seller representations">
                    <Bullets
                      items={[
                        'You have legal ownership/authority to sell the listed animal or good.',
                        'Listing information is accurate and not misleading.',
                        'You comply with all applicable laws (including TPWD/TAHC/USDA and local rules).',
                      ]}
                    />
                  </Section>

                  <Section title="Animal-specific seller obligations">
                    <Bullets
                      items={[
                        'You are solely responsible for animal condition, health, permits/records, and required disclosures.',
                        'You are solely responsible for any representations about health, genetics, temperament, and training.',
                      ]}
                    />
                  </Section>

                  <Section title="Indemnification reinforcement">
                    <Bullets
                      items={[
                        'You must defend, indemnify, and hold harmless Agchange for claims arising from your listings and sales.',
                      ]}
                    />
                  </Section>
                </div>
            </TabsContent>

            <TabsContent value="buyerAcknowledgment" className="mt-0 data-[state=inactive]:hidden focus-visible:outline-none focus-visible:ring-0">
              <div className="p-5 space-y-6">
                  <div className="text-xs text-muted-foreground">
                    Effective {LEGAL_VERSIONS.buyerAcknowledgment.effectiveDateLabel} (version {LEGAL_VERSIONS.buyerAcknowledgment.version}). Full page:{' '}
                    <Link href="/legal/buyer-acknowledgment" className="underline underline-offset-4">
                      /legal/buyer-acknowledgment
                    </Link>
                  </div>

                  <Section title="Buyer acknowledgments (animals)">
                    <Bullets
                      items={[
                        'The contract is between you and the seller; Agchange is not a party.',
                        'Live animals involve inherent risk; outcomes are not guaranteed.',
                        'You will perform your own due diligence (permits/records/inspection).',
                        'Risk transfers upon delivery or pickup.',
                      ]}
                    />
                  </Section>
                </div>
            </TabsContent>
          </div>
        </Tabs>

        {props.agreeAction ? (
          <div className="sticky bottom-0 mt-3 rounded-xl border bg-background p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] z-10 border-t">
            <div className="flex items-start gap-3 min-w-0">
              <Checkbox
                id="legal-agree"
                checked={agreeChecked}
                onCheckedChange={(v) => setAgreeChecked(Boolean(v))}
                className="mt-0.5 shrink-0"
              />
              <label htmlFor="legal-agree" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                {props.agreeAction.label ||
                  'I have read and agree to the Terms of Service and Marketplace Policies, including the arbitration agreement and class action waiver.'}
              </label>
            </div>
            <Button
              className="font-semibold shrink-0 w-full sm:w-auto"
              disabled={!agreeChecked}
              onClick={() => {
                if (!agreeChecked) return;
                props.agreeAction?.onConfirm();
              }}
            >
              {props.agreeAction.buttonText || 'Agree & close'}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

