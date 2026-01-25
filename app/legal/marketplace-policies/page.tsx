import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

export const metadata: Metadata = {
  title: 'Marketplace Policies | Wildlife Exchange',
  description:
    'Marketplace policies, category disclaimers, and risk acknowledgments for Wildlife Exchange.',
};

export default function MarketplacePoliciesPage() {
  const EFFECTIVE = LEGAL_VERSIONS.marketplacePolicies.effectiveDateLabel;
  const VERSION = LEGAL_VERSIONS.marketplacePolicies.version;

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
          <Shield className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Marketplace Policies</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Effective date: {EFFECTIVE} • Version: {VERSION}
        </p>
      </div>

      <Alert className="mb-8">
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Wildlife Exchange is a technology marketplace only. These policies set marketplace rules and category-level disclaimers.
          They do not make Wildlife Exchange a seller, dealer, broker, agent, or auctioneer.
        </AlertDescription>
      </Alert>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>1) Category-level disclaimers (read this first)</CardTitle>
            <CardDescription>These disclaimers apply in addition to the Terms of Service.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-muted-foreground">
            <div className="space-y-2">
              <div className="font-semibold text-foreground">Animal categories (whitetail, registered livestock, cattle, horses, dogs)</div>
              <ul className="list-disc ml-5 space-y-1">
                <li>Wildlife Exchange does not take custody, possession, or control of any animal at any time.</li>
                <li>Health, genetics, temperament, training, and legality representations are made solely by the seller.</li>
                <li>Buyers must perform their own due diligence (including permits, veterinary records, and facility checks).</li>
                <li>Risk of loss, injury, illness, escape, or death transfers upon delivery or pickup (buyer/seller handle logistics).</li>
              </ul>
            </div>

            <div className="space-y-2">
              <div className="font-semibold text-foreground">Equipment / vehicles / ranch assets</div>
              <ul className="list-disc ml-5 space-y-1">
                <li>Listings are provided “AS-IS, WHERE-IS.” Wildlife Exchange makes no warranty of condition, title, or fitness.</li>
                <li>Buyer and seller are responsible for inspection, title/VIN verification, liens, taxes, and transfer paperwork.</li>
                <li>Wildlife Exchange does not provide transport; any shipping/hauling is arranged between buyer, seller, and third parties.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Prohibited items and prohibited conduct</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Prohibited listings include (not exhaustive): hunting tags/licenses/permits for sale, wild-caught protected species,
                venison/meat products, illegal animal products, stolen goods, endangered or protected species, and any listing that violates applicable law.
              </AlertDescription>
            </Alert>
            <p>
              We may remove listings, restrict visibility, suspend accounts, or take other action if we believe activity violates these policies,
              the Terms, or applicable law.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3) Compliance is seller/buyer responsibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Sellers and buyers are solely responsible for complying with all applicable laws (including TPWD/TAHC, USDA, and state requirements),
              including permits, records, and transfer requirements.
            </p>
            <p>
              Wildlife Exchange may require certain documents to be uploaded for platform workflow purposes. Any “verified” label means the document
              was reviewed for marketplace workflow completeness—<strong>not</strong> that a regulator approved a transfer.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4) Related policies</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <Link className="underline underline-offset-4" href="/legal/seller-policy">
                  Seller Policy
                </Link>
              </li>
              <li>
                <Link className="underline underline-offset-4" href="/legal/buyer-acknowledgment">
                  Buyer Acknowledgment
                </Link>
              </li>
              <li>
                <Link className="underline underline-offset-4" href="/terms">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

