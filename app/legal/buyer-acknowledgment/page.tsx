import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

export const metadata: Metadata = {
  title: 'Buyer Acknowledgment | Agchange',
  description:
    'Buyer acknowledgments for Agchange, including live animal risk and due diligence requirements.',
};

export default function BuyerAcknowledgmentPage() {
  const EFFECTIVE = LEGAL_VERSIONS.buyerAcknowledgment.effectiveDateLabel;
  const VERSION = LEGAL_VERSIONS.buyerAcknowledgment.version;

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
          <Shield className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Buyer Acknowledgment</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Effective date: {EFFECTIVE} • Version: {VERSION}
        </p>
      </div>

      <Alert className="mb-8">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-sm">
          This acknowledgment applies to animal categories and is required before purchase/checkout where applicable.
          Agchange is not the seller and does not take custody of animals or goods.
        </AlertDescription>
      </Alert>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>1) Contract is between you and the seller</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground">
            <p>
              You acknowledge that any sale agreement is solely between you and the seller. Agchange is a marketplace technology provider
              and is not a party to the buyer–seller contract.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Live animal transactions & assumption of risk</CardTitle>
            <CardDescription>Applies to whitetail, registered livestock, cattle, horses, and dogs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground">
            <p>
              You acknowledge that live animals involve inherent risks including, without limitation, stress from handling or transport, acclimation,
              disease exposure, injury, illness, escape, and mortality.
            </p>
            <p>
              Agchange makes no representations or warranties regarding health, viability, genetics, temperament, training, or future performance.
              Any representations are made solely by the seller.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3) Due diligence is your responsibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>You will verify the listing, seller representations, and any required permits/records.</li>
              <li>You will conduct any inspections you deem necessary (including veterinary checks where appropriate).</li>
              <li>You will verify transfer requirements, title/lien status (where applicable), and pickup/transport details.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4) Risk of loss transfers on delivery/pickup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground">
            <p>
              You acknowledge that risk of loss, injury, illness, escape, or death transfers to you upon delivery or pickup, as between you and the seller.
              Agchange bears no responsibility before, during, or after transport.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5) Related documents</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <Link className="underline underline-offset-4" href="/terms">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link className="underline underline-offset-4" href="/legal/marketplace-policies">
                  Marketplace Policies
                </Link>
              </li>
              <li>
                <Link className="underline underline-offset-4" href="/legal/seller-policy">
                  Seller Policy
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

