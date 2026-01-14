import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Gavel, Lock, AlertTriangle, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service | Wildlife Exchange',
  description:
    'Terms and conditions for using Wildlife Exchange, including Texas-only animal transaction rules and compliance workflow disclaimers.',
};

const EFFECTIVE_DATE = 'January 2026';

export default function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
          <Gavel className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mt-3">Effective date: {EFFECTIVE_DATE}</p>
      </div>

      <Alert className="mb-8">
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Important:</strong> Wildlife Exchange is a marketplace platform. We do not own animals, do not provide
          veterinary services, and do not act as a transporter. “Verified” means documents were reviewed as part of our
          workflow—it does <strong>not</strong> mean a regulator approved a transfer.
        </AlertDescription>
      </Alert>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>1) Acceptance of these Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              By accessing or using Wildlife Exchange (the “Services”), you agree to these Terms of Service (“Terms”).
              If you do not agree, do not use the Services.
            </p>
            <p>
              These Terms apply to buyers, sellers, and any visitor to the Services.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Marketplace role (no agency)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Wildlife Exchange provides a platform to connect buyers and sellers. Unless explicitly stated otherwise,
              we are not a party to the transaction between buyer and seller.
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>We do not own, possess, or control listed animals or equipment.</li>
              <li>We do not provide veterinary advice or veterinary services.</li>
              <li>We do not provide transportation or logistics services (unless separately offered in the future).</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3) Eligibility</CardTitle>
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
            <CardTitle>4) Texas-only animal transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>All animal transactions are Texas-only.</strong> Buyers and sellers must comply with applicable
              Texas laws and regulations. We enforce Texas-only restrictions through our checkout and post-payment
              verification workflows.
            </p>
            <p>
              Equipment listings may be available across multiple states unless otherwise stated.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5) Seller responsibilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Accuracy and legality</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Sellers must provide truthful, complete, and accurate listings and documentation.</li>
              <li>Sellers are responsible for ensuring their listing and sale comply with all applicable laws.</li>
              <li>
                Sellers must not misrepresent permits, registrations, animal identity, health disclosures, or ownership.
              </li>
            </ul>

            <p className="font-semibold text-foreground">Whitetail breeder listings</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                Whitetail deer may only be listed in the <strong>Whitetail Breeder</strong> category.
              </li>
              <li>
                Sellers must upload a TPWD Deer Breeder Permit document for listing review (as required by the platform
                workflow).
              </li>
              <li>
                “Verified” or “Reviewed” indicates a platform admin reviewed an uploaded document for completeness in
                our workflow; it does not represent TPWD approval or transfer authorization.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6) Buyer responsibilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>Buyers must provide accurate account and payment information.</li>
              <li>
                Buyers are responsible for complying with pickup/transfer requirements and applicable laws.
              </li>
              <li>
                Buyers must not attempt to circumvent Texas-only restrictions for animal transactions.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7) Payments, fees, escrow, and payout release</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Payments are processed via Stripe. We may collect marketplace fees. We may hold funds in escrow and
              release payouts according to platform rules, including dispute handling and compliance workflow steps.
            </p>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Lock className="h-4 w-4 text-primary" />
                Whitetail breeder payout gating
              </div>
              <p className="mt-2">
                For whitetail breeder orders, payout release may be blocked until an order-level TPWD Transfer Approval
                document is uploaded and reviewed per our workflow. Transfer approvals are per-order and do not
                automatically apply to other transactions.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Wildlife Exchange is not a regulator. We do not issue transfer approvals and do not guarantee any party
                is compliant—buyers and sellers are responsible for compliance with TPWD/TAHC rules.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8) Disputes, refunds, and chargebacks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              We may provide dispute tools. Buyers and sellers should attempt to resolve issues promptly. Certain
              disputes or compliance failures may result in refunds, holds, or other actions consistent with these
              Terms and our policies.
            </p>
            <p>
              Unauthorized chargebacks or abuse may result in account limitation or termination.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>9) Prohibited items and prohibited conduct</CardTitle>
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
            <CardTitle>10) Content and moderation</CardTitle>
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
            <CardTitle>11) Account termination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              We may suspend or terminate access if we believe you violate these Terms, create risk for the platform,
              or engage in abusive or unlawful behavior.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>12) Disclaimers and limitation of liability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The Services are provided “as is” and “as available.” To the maximum extent permitted by law, Wildlife
              Exchange disclaims warranties of merchantability, fitness for a particular purpose, and non-infringement.
            </p>
            <p>
              Wildlife Exchange is not responsible for the quality, health, condition, legality, or transferability of
              any animal or equipment listed by sellers.
            </p>
            <p>
              To the maximum extent permitted by law, Wildlife Exchange will not be liable for indirect, incidental,
              special, consequential, or punitive damages, or any loss of profits or revenues.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>13) Indemnification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              You agree to indemnify and hold Wildlife Exchange harmless from claims arising out of your use of the
              Services, your listings, your transactions, or your violation of these Terms or applicable law.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>14) Governing law</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              These Terms are governed by the laws of the State of Texas, without regard to conflict of law principles.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>15) Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-semibold">support@wildlife.exchange</span>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

