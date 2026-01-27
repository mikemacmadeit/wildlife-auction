/**
 * Trust & Compliance Page
 * 
 * Public-facing page explaining trust badges, compliance workflow, and verification processes
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  CheckCircle2, 
  FileText, 
  MapPin, 
  AlertCircle, 
  Lock,
  Users,
  DollarSign,
  Clock,
  Mail,
  HelpCircle
} from 'lucide-react';
import Link from 'next/link';
import { BottomNav } from '@/components/navigation/BottomNav';

export default function TrustPage() {
  return (
    <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-0">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Trust & Compliance</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Agchange is built for trust, clear disclosures, and compliance workflows for regulated categories—
            without claiming to be a regulator or approving transfers.
          </p>
        </div>

        <div className="space-y-8">
        {/* Trust Badges Section */}
        <Card id="badges" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Trust Badges & Verification
            </CardTitle>
            <CardDescription>
              What our verification badges mean and how we verify sellers and listings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Verified Seller Badge */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-full">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Verified Seller</h3>
                    <Badge variant="outline" className="mt-1">Identity Verified</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  This seller has completed identity verification and has Stripe Connect payout enabled. 
                  They can receive payments directly from completed transactions.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Identity verified</li>
                  <li>Stripe Connect account active</li>
                  <li>Payouts enabled</li>
                </ul>
              </div>

              {/* TPWD Breeder Permit Badge */}
              <div id="whitetail" className="p-4 border rounded-lg space-y-3 scroll-mt-24">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-full">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">TPWD Breeder Permit</h3>
                    <Badge variant="outline" className="mt-1">Permit Verified</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  For whitetail breeder listings, sellers must upload their TPWD Breeder Permit document. 
                  Admin verifies the permit before the listing goes live.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>TPWD permit document uploaded</li>
                  <li>Admin verified</li>
                  <li>Listing-level verification</li>
                </ul>
              </div>

              {/* Horse Bill of Sale / Written Transfer */}
              <div id="horses" className="p-4 border rounded-lg space-y-3 scroll-mt-24">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-full">
                    <FileText className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Horse Bill of Sale</h3>
                    <Badge variant="outline" className="mt-1">Order Document</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  For Horse &amp; Equestrian transactions, Agchange generates an in-platform Bill of Sale / written transfer document
                  tied to the order. Buyer and seller can view/download it from the order details page.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Generated at checkout when required fields are present</li>
                  <li>Stored under the order’s documents</li>
                  <li>Buyer/seller can confirm “signed” (timestamped)</li>
                </ul>
              </div>

              {/* Transfer Approval Badge */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-full">
                    <Lock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Transfer Approval Verified</h3>
                    <Badge variant="outline" className="mt-1">Order-Level</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  For whitetail breeder sales, sellers must upload TPWD Transfer Approval before payout release. 
                  Admin verifies the document before funds are released.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>TPWD transfer approval uploaded</li>
                  <li>Admin verified</li>
                  <li>Required before payout</li>
                </ul>
              </div>

              {/* Compliance Status Badge */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-full">
                    <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Compliance Status</h3>
                    <Badge variant="outline" className="mt-1">Pending Review</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Some listings require admin review before going live. Statuses include: 
                  <strong>Pending Review</strong>, <strong>Approved</strong>, or <strong>Rejected</strong>.
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
                  <li>Whitetail breeder: Always requires review</li>
                  <li>Other specialty livestock: Review if "other_exotic" species</li>
                  <li>Admin verifies documents</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Texas-Only Policy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle>Texas-Only Animal Transactions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
              <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-800 dark:text-blue-200">
                <strong>All animal transactions are restricted to Texas residents only.</strong>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                To ensure compliance with Texas Parks and Wildlife Department (TPWD) and Texas Animal Health Commission (TAHC) regulations:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>All animal listings must be located in Texas</li>
                <li>Only Texas residents can bid on or purchase animal listings</li>
                <li>Buyers must have a Texas address in their profile</li>
                <li>Stripe billing/shipping address must be in Texas (verified post-payment)</li>
                <li>Equipment listings are exempt and can be multi-state</li>
              </ul>
            </div>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
                🔒 Air-Tight Enforcement
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                If a non-Texas buyer attempts to purchase an animal listing, the payment is automatically refunded 
                and the listing remains available. This is enforced via Stripe address verification in our webhook handler.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* How payments work — no escrow, no payout holds */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <CardTitle>How payments work</CardTitle>
            </div>
            <CardDescription>
              Seller verification and listing review before listings go live
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">1</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">How payments work</h4>
                  <p className="text-sm text-muted-foreground">
                    Agchange is a software marketplace. We verify sellers and review required documentation and listings before they go live. Payments are processed by Stripe. Agchange does not hold funds, provide escrow, or condition payouts on delivery.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">2</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Compliance Verification</h4>
                  <p className="text-sm text-muted-foreground">
                    For whitetail breeder orders: Seller must upload TPWD Transfer Approval document. 
                    Admin verifies the document.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">3</span>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Seller receives funds</h4>
                  <p className="text-sm text-muted-foreground">
                    Sellers receive funds via Stripe when the buyer pays. Agchange does not hold or delay payouts.
                  </p>
                </div>
              </div>
            </div>

            <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <strong>How it works:</strong> We verify sellers and review required documentation and listings before they go live. Payments are processed by Stripe. Agchange does not hold funds or condition payouts on delivery. “Verified” is for marketplace workflow completeness—not regulator approval.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Prohibited Items */}
        <Card id="safety" className="scroll-mt-24">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Prohibited Items</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                The following items are strictly prohibited and will result in immediate listing removal:
              </AlertDescription>
            </Alert>
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-4">
              <li><strong>Venison, deer meat, or any processed game meat</strong> - Cannot sell processed game meat</li>
              <li><strong>Hunting tags, licenses, or permits for sale</strong> - Cannot sell hunting permits/tags/licenses</li>
              <li><strong>Wild whitetail deer</strong> - Must be from licensed breeder facilities only</li>
              <li><strong>Any listing attempting to circumvent TPWD regulations</strong></li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Our system automatically scans listings for prohibited keywords and blocks them server-side. 
              Admin review also catches any attempts to list prohibited items.
            </p>
          </CardContent>
        </Card>

        {/* Compliance Workflow */}
        <Card>
          <CardHeader>
            <CardTitle>Compliance Workflow</CardTitle>
            <CardDescription>
              How listings are reviewed and approved
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Whitetail Breeder Listings</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
                  <li>Seller creates listing with TPWD permit information</li>
                  <li>Seller uploads TPWD Breeder Permit document</li>
                  <li>Listing goes to <Badge variant="outline">Pending Review</Badge> status</li>
                  <li>Admin reviews and verifies permit document</li>
                  <li>Admin approves → Listing becomes <Badge variant="outline">Active</Badge></li>
                  <li>After sale: Seller uploads TPWD Transfer Approval</li>
                  <li>Admin verifies transfer approval</li>
                  <li>Seller receives funds via Stripe when the buyer pays (we do not hold or release payouts)</li>
                </ol>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Registered & Specialty Livestock Listings</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
                  <li>Seller creates listing with species and TAHC disclosures</li>
                  <li>Standard species: Auto-approved (goes <Badge variant="outline">Active</Badge>)</li>
                  <li>"Other Exotic" species: Requires admin review</li>
                  <li>Admin reviews → Approves or rejects</li>
                </ol>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Cattle/Livestock Listings</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
                  <li>Seller creates listing with identification/health disclosures</li>
                  <li>Auto-approved (goes <Badge variant="outline">Active</Badge>)</li>
                  <li>Buyer responsible for brand inspection (interstate transport)</li>
                </ol>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Ranch Equipment &amp; Attachments</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
                  <li>Seller creates listing</li>
                  <li>Includes machinery, attachments, and implements (not vehicles)</li>
                  <li>Auto-approved (goes <Badge variant="outline">Active</Badge>)</li>
                  <li>Multi-state allowed (no TX-only restriction)</li>
                </ol>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold mb-2">Ranch Vehicles &amp; Trailers</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
                  <li>Seller creates listing</li>
                  <li>Vehicles (UTV/ATV/Trailer/Truck): Require title/VIN information</li>
                  <li>Auto-approved (goes <Badge variant="outline">Active</Badge>)</li>
                  <li>Multi-state allowed (no TX-only restriction)</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Protection Windows */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction Protection</CardTitle>
            <CardDescription>
              How disputes and protection windows work
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Agchange offers optional transaction protection for buyers:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li><strong>Verified listing window (7 days):</strong> Buyer can dispute within 7 days of delivery</li>
                <li><strong>Verified listing window (14 days):</strong> Extended dispute window for higher-value transactions</li>
                <li><strong>Dispute resolution:</strong> Admin reviews disputes and resolves (refund when appropriate). Agchange does not hold funds.</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Protection windows are optional and set by sellers. Standard dispute window (72 hours) applies to all transactions.
            </p>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Frequently Asked Questions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-1">Why is Texas-only enforcement so strict?</h4>
                <p className="text-sm text-muted-foreground">
                  Texas wildlife and livestock regulations require that animal transactions occur within Texas. 
                  This ensures compliance with TPWD and TAHC regulations and prevents illegal interstate transport.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-1">What happens if I'm not from Texas but want to buy equipment?</h4>
                <p className="text-sm text-muted-foreground">
                  Equipment listings are exempt from Texas-only restrictions. You can purchase ranch equipment from any state.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-1">How long does compliance review take?</h4>
                <p className="text-sm text-muted-foreground">
                  Admin reviews are typically completed within 24-48 hours. Whitetail breeder listings require permit verification, 
                  which may take longer if documents need clarification.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-1">What if my listing is rejected?</h4>
                <p className="text-sm text-muted-foreground">
                  You'll receive a rejection reason from admin. You can fix the issues and resubmit, or contact support for clarification.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-1">When will I receive my payout?</h4>
                <p className="text-sm text-muted-foreground">
                  Sellers receive funds via Stripe when the buyer pays. Agchange does not hold or delay payouts. TPWD Transfer Approval (for whitetail breeder sales) is a documentation requirement; it does not gate or delay payout.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Report */}
        <Card>
          <CardHeader>
            <CardTitle>Report a Listing or Contact Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                If you see a listing that violates our compliance policies or have questions about compliance:
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild variant="outline">
                  <Link href="/compliance" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    View Compliance Details
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a href="mailto:compliance@agchange.com" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Compliance Team
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
      <BottomNav />
    </div>
  );
}
