import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, FileText } from 'lucide-react';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

export const metadata: Metadata = {
  title: 'Seller Policy | Wildlife Exchange',
  description:
    'Seller policy for Wildlife Exchange, including animal-specific obligations and indemnification requirements.',
};

export default function SellerPolicyPage() {
  const EFFECTIVE = LEGAL_VERSIONS.sellerPolicy.effectiveDateLabel;
  const VERSION = LEGAL_VERSIONS.sellerPolicy.version;

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
          <FileText className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Seller Policy</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Effective date: {EFFECTIVE} • Version: {VERSION}
        </p>
      </div>

      <Alert className="mb-8">
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Sellers list and sell directly to buyers. Wildlife Exchange is not a seller, dealer, broker, agent, or auctioneer,
          and is not a party to the buyer–seller contract.
        </AlertDescription>
      </Alert>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>1) Seller representations (required)</CardTitle>
            <CardDescription>By listing, you represent and warrant the following to buyers and to Wildlife Exchange.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>You have legal ownership, possession rights, and authority to sell the listed item/animal.</li>
              <li>Your listing is accurate and not misleading (including photos, genetics, age, training, health notes, and disclosures).</li>
              <li>You will comply with all applicable laws and regulations (including TPWD/TAHC/USDA and any local rules).</li>
              <li>You will not list prohibited items or engage in unlawful conduct using the platform.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Animal-specific seller obligations</CardTitle>
            <CardDescription>Applies to whitetail, registered livestock, cattle, horses, and dogs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>You are solely responsible for animal condition, health, permits, records, and required disclosures.</li>
              <li>You are solely responsible for any seller representations about health, genetics, temperament, and training.</li>
              <li>You must provide any legally required permits, records, or documentation to the buyer and/or relevant authorities.</li>
              <li>You are solely responsible for safe packaging/handling and compliance during pickup/transport (if applicable).</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3) Indemnification (critical)</CardTitle>
            <CardDescription>You must defend and protect the platform from claims arising from your listings and sales.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              You agree to defend, indemnify, and hold harmless Wildlife Exchange and its owners, directors, officers, employees, and contractors
              from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys’ fees) arising out of or
              related to:
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>your listing content, representations, or omissions;</li>
              <li>the condition, injury, illness, death, escape, or disease of an animal you list or sell;</li>
              <li>alleged misrepresentation, fraud, or failure to disclose;</li>
              <li>alleged illegality or non-compliance (permits, transfers, transport, taxes, title/lien issues);</li>
              <li>your breach of the Terms, these policies, or applicable law.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4) Required disclosures and documentation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The platform may require certain disclosures and documents (by category) to publish listings or release payouts. These are marketplace
              workflow requirements and do not create any warranty by Wildlife Exchange.
            </p>
            <p>
              Any “verified” label means a document was reviewed for workflow completeness; it does <strong>not</strong> mean a regulator approved a transfer.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5) Related documents</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <Link className="underline underline-offset-4" href="/terms">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link className="underline underline-offset-4" href="/legal/buyer-acknowledgment">
                  Buyer Acknowledgment
                </Link>
              </li>
              <li>
                <Link className="underline underline-offset-4" href="/legal/marketplace-policies">
                  Marketplace Policies
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

