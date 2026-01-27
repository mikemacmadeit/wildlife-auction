import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Lock, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | Agchange',
  description:
    'Learn how Agchange collects, uses, and shares information to provide a trusted Texas marketplace.',
};

const EFFECTIVE_DATE = 'January 2026';

export default function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mt-3">Effective date: {EFFECTIVE_DATE}</p>
      </div>

      <Alert className="mb-8">
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-sm">
          <strong>Summary:</strong> We collect information you provide (account, listings, and documents) and information
          generated through marketplace activity (orders, messages, usage). We use it to operate the platform, keep
          transactions secure, and support compliance workflows. We don’t sell your personal information.
        </AlertDescription>
      </Alert>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>1) Who we are</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Agchange (“Agchange,” “we,” “us”) provides a marketplace platform that helps buyers and
              sellers connect to list and transact livestock, wildlife/exotics, and ranch equipment.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, and share information when you use our website, apps,
              and related services (collectively, the “Services”).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Information we collect</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <p className="font-semibold text-foreground">Information you provide</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>
                  <strong>Account data</strong> (such as name, email, phone number, and location).
                </li>
                <li>
                  <strong>Seller information</strong> (such as business details you choose to provide).
                </li>
                <li>
                  <strong>Listing content</strong> (photos, descriptions, and category-specific attributes).
                </li>
                <li>
                  <strong>Messages and support requests</strong> you send through the platform.
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-foreground">Transaction and platform data</p>
              <ul className="list-disc ml-5 space-y-1">
                <li>
                  <strong>Order records</strong>, bids, disputes, and related transaction events.
                </li>
                <li>
                  <strong>Payment metadata</strong>: payments are processed by Stripe. We do not store full card numbers
                  on our servers.
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-foreground">Compliance documents (when applicable)</p>
              <p>
                Certain categories require document uploads (for example, permits or order-level transfer documents).
                These documents are stored securely in our backend (e.g., Firebase Storage/Firestore) and reviewed as
                part of our compliance workflow.
              </p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-foreground">Usage data, cookies, and similar technologies</p>
              <p>
                We may collect information about how you interact with the Services (such as pages viewed, feature
                usage, device/browser information, and approximate location inferred from IP). We use cookies/local
                storage for essential functionality (e.g., keeping you signed in and remembering preferences).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3) How we use information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>Provide and improve marketplace features (listings, messaging, orders, and payouts).</li>
              <li>Process transactions; payments are processed by Stripe. We do not hold funds or condition payouts on delivery.</li>
              <li>Fraud prevention, abuse prevention, and security monitoring.</li>
              <li>Support compliance workflows (e.g., document review and listing approval when applicable).</li>
              <li>Customer support and communications about your account and transactions.</li>
              <li>
                Marketing emails (newsletter/product updates) if you opt in. You can unsubscribe any time.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4) How we share information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Service providers</p>
            <p>
              We share information with vendors that help us operate the Services, such as payment processors (Stripe),
              email providers (Brevo), hosting and infrastructure providers, and analytics/security providers.
            </p>

            <p className="font-semibold text-foreground mt-4">Between buyers and sellers</p>
            <p>
              To facilitate transactions, we may share necessary information between buyers and sellers (for example,
              contact and pickup/transfer coordination information) consistent with the transaction flow.
            </p>

            <p className="font-semibold text-foreground mt-4">Legal and safety</p>
            <p>
              We may disclose information if required by law, to respond to lawful requests, or to protect the rights,
              safety, and security of users and the platform.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5) Marketing emails</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              If you subscribe to our newsletter, we may send product updates and marketplace announcements via Brevo.
              You can unsubscribe using the link in any email.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6) Data retention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              We retain information for as long as needed to provide the Services, comply with legal obligations,
              resolve disputes, enforce agreements, and maintain platform integrity. Retention periods vary by data type
              (for example, transaction records and compliance documents may be retained longer than marketing
              preferences).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7) Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              We use reasonable administrative, technical, and physical safeguards designed to protect information. No
              system can be guaranteed 100% secure, and you use the Services at your own risk.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>8) Your choices and rights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc ml-5 space-y-1">
              <li>Access and update your account information via your account settings.</li>
              <li>Opt out of marketing emails using the unsubscribe link in our emails.</li>
              <li>
                Request account assistance or data questions by contacting support (see “Contact” below).
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>9) Children’s privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The Services are not directed to children under 13, and we do not knowingly collect personal information
              from children under 13.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10) Changes to this policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              We may update this policy from time to time. When we do, we will update the effective date at the top of
              this page. Your continued use of the Services after changes means you accept the updated policy.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>11) Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-semibold">support@wildlife.exchange</span>
            </div>
            <p>
              Prefer a form? Visit our{' '}
              <Link href="/contact" className="underline underline-offset-4">
                Contact page
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

