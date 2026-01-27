import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Gavel, AlertTriangle, Mail } from 'lucide-react';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

export const metadata: Metadata = {
  title: 'Terms of Service | Agchange',
  description:
    'Terms of Service for using Agchange, including marketplace-only status, live animal risk, and arbitration.',
};

const EFFECTIVE_DATE = LEGAL_VERSIONS.tos.effectiveDateLabel;
const VERSION = LEGAL_VERSIONS.tos.version;

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
          <Gavel className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-3">
          Effective date: {EFFECTIVE_DATE} • Version: {VERSION}
        </p>
      </div>

      <Alert className="mb-8">
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Important:</strong> Agchange is a technology marketplace only. We are not the seller, dealer, broker,
          agent, or auctioneer. We do not take title, custody, possession, or control of animals or goods. “Verified” means a document
          was reviewed for marketplace workflow completeness—it does <strong>not</strong> mean a regulator approved a transfer.
        </AlertDescription>
      </Alert>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>1) Acceptance of these Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              By accessing or using Agchange (the “Services”), you agree to these Terms of Service (“Terms”).
              If you do not agree, do not use the Services.
            </p>
            <p>
              These Terms apply to buyers, sellers, and any visitor to the Services.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Marketplace-only status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Agchange provides software that allows users to list items and communicate with other users. Agchange is a
              technology platform only and is not a seller, dealer, broker, agent, or auctioneer.
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>We do not take title to any animal or good.</li>
              <li>We do not inspect, house, handle, transport, or take custody of animals or goods.</li>
              <li>We do not provide veterinary advice or veterinary services.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3) Contract is between buyer and seller</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Buyers and sellers contract directly with each other. Agchange is not a party to the transaction and does not become an
              owner of, or responsible for, any listed animal or good.
            </p>
            <p>
              Any sale agreement, bill of sale, or transfer documentation is between buyer and seller. Agchange may provide tools or
              templates for convenience but makes no representation about the sufficiency of those documents for any particular transaction.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4) Eligibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>You must be legally able to enter into a binding contract to use the Services.</p>
            <p>
              The Services are not intended for children under 13.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5) Texas-only animal transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>All animal transactions are Texas-only.</strong> Buyers and sellers must comply with applicable Texas laws and regulations.
              Agchange may apply geographic restrictions and workflow checks to support these requirements.
            </p>
            <p>Equipment and vehicle listings may be multi-state unless otherwise stated.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6) Live Animal Transactions &amp; Assumption of Risk</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Live animals involve inherent risks including (without limitation) stress from handling or transport, acclimation issues,
              disease exposure, injury, illness, escape, and mortality.
            </p>
            <p>
              Agchange makes no representations or warranties regarding the health, viability, genetics, temperament, training, or future
              performance of any animal. Any representations are made solely by the seller.
            </p>
            <p>
              You acknowledge and assume these inherent risks. You are responsible for your own due diligence, including permits, veterinary records,
              and facility checks.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7) Risk of loss transfer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              As between buyer and seller, risk of loss, injury, illness, escape, or death transfers to the buyer upon delivery or pickup (as applicable).
              Agchange bears no responsibility before, during, or after transport.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8) AS-IS / NO WARRANTIES</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              All listings are provided “AS-IS, WHERE-IS.” To the maximum extent permitted by law, Agchange disclaims all warranties,
              express or implied, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
            </p>
            <p>
              Agchange does not warrant the quality, health, condition, legality, or transferability of any animal or good listed by sellers.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>9) Transport disclaimer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Agchange does not arrange or provide transportation. Any pickup, delivery, shipping, hauling, or other transport is arranged
              solely between buyer, seller, and/or third-party carriers. Agchange is not responsible for transport outcomes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10) Seller responsibilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Accuracy and legality</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Sellers must provide truthful, complete, and accurate listings and documentation.</li>
              <li>Sellers are responsible for legal ownership/authority to sell and compliance with all applicable laws.</li>
              <li>Sellers must not misrepresent permits, registrations, animal identity, health disclosures, or title/lien status.</li>
            </ul>
            <p className="font-semibold text-foreground">Whitetail breeder listings</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Whitetail deer may only be listed in the Whitetail Breeder category.</li>
              <li>Platform workflows may require permits/records to be uploaded and reviewed before a listing is published or funds are released.</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              “Verified” indicates an admin reviewed an uploaded document for marketplace workflow completeness; it does not represent TPWD approval or
              transfer authorization.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>11) Buyer responsibilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>Buyers must provide accurate account and payment information.</li>
              <li>Buyers are responsible for inspections, due diligence, and verifying permits/records.</li>
              <li>Buyers must comply with pickup/transfer requirements and applicable law.</li>
              <li>Buyers must not attempt to circumvent Texas-only restrictions for animal transactions.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>12) Payments and platform fees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Payments are processed by Stripe. Agchange may collect marketplace fees.</p>
            <p>
              Agchange processes payments through the platform and releases funds according to marketplace workflow rules (for example, dispute windows or required document uploads).
              This relates to payment settlement only and does not mean Agchange takes custody of any animal or good.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>13) Disputes, refunds, and chargebacks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              We may provide dispute tools. Buyers and sellers should attempt to resolve issues promptly. Certain
              disputes or compliance failures may result in refunds, payment holds, or other actions consistent with these Terms and our policies.
            </p>
            <p>
              Unauthorized chargebacks or abuse may result in account limitation or termination.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>14) Prohibited items and prohibited conduct</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Prohibited listings include (not exhaustive): hunting tags/licenses/permits for sale, wild whitetail,
                venison/meat products, illegal wildlife products, and any unlawful activity.
              </AlertDescription>
            </Alert>
            <p>
              We may remove listings, suspend accounts, or take other actions if we believe activity violates these
              Terms or applicable law.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>15) Content and moderation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              You are responsible for content you post. We may review, reject, or remove content and listings at our
              discretion, including for safety, compliance workflow needs, or marketplace integrity.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>16) Indemnification (critical)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Sellers agree to defend, indemnify, and hold harmless Agchange and its owners, directors, officers, employees, and contractors
              from and against any claims arising out of or relating to their listings and transactions, including claims related to animal injury, illness,
              death, disease, misrepresentation, legality, compliance, title/lien issues, and transport outcomes.
            </p>
            <p>
              All users agree to indemnify and hold Agchange harmless from claims arising out of their use of the Services or violation of these Terms.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>17) Limitation of liability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              To the maximum extent permitted by law, Agchange will not be liable for indirect, incidental, special, consequential, or punitive
              damages, or any loss of profits or revenues.
            </p>
            <p>
              To the maximum extent permitted by law, Agchange’s total liability for any claim arising out of or relating to the Services will not
              exceed the fees paid to Agchange by you in the twelve (12) months before the event giving rise to the claim.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>18) Arbitration &amp; class action waiver</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              You agree that disputes arising out of or relating to these Terms or the Services will be resolved by binding arbitration on an individual basis,
              and you waive the right to participate in any class action or class-wide arbitration.
            </p>
            <p>
              Either party may bring a claim in small claims court if the claim qualifies. Otherwise, arbitration will be administered by a reputable arbitration
              provider under its consumer/commercial rules as applicable. The arbitrator may award the same damages and relief as a court could award on an
              individual basis.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>19) Governing law</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              These Terms are governed by the laws of the State of Texas, without regard to conflict of law principles.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>20) Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-semibold">support@agchange.com</span>
            </div>
            <p>
              You can also reach us via the{' '}
              <Link href="/contact" className="underline underline-offset-4">
                Contact page
              </Link>{' '}
              or review our compliance workflow at{' '}
              <Link href="/trust" className="underline underline-offset-4">
                Trust &amp; Compliance
              </Link>
              .
            </p>
            <p className="text-xs text-muted-foreground">
              Related: <Link href="/legal/marketplace-policies" className="underline underline-offset-4">Marketplace Policies</Link>,{' '}
              <Link href="/legal/seller-policy" className="underline underline-offset-4">Seller Policy</Link>,{' '}
              <Link href="/legal/buyer-acknowledgment" className="underline underline-offset-4">Buyer Acknowledgment</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

