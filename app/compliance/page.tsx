/**
 * Compliance Information Page
 * 
 * Plain English explanation of Texas wildlife/livestock compliance requirements
 */

'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertCircle, FileText, MapPin, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';

export default function CompliancePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Compliance & Regulations</h1>
        <p className="text-lg text-muted-foreground">
          Wildlife Exchange enforces Texas-only animal transactions and marketplace document workflows. Buyers and sellers remain responsible for legal compliance.
        </p>
      </div>

      <div className="space-y-6">
        {/* Texas-Only Policy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle>Texas-Only Animal Transactions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
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
                <li>Equipment listings are exempt and can be multi-state</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Prohibited Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
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
            <div className="space-y-2">
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Venison, deer meat, or any processed game meat</li>
                <li>Hunting tags, licenses, or permits for sale</li>
                <li>Wild whitetail deer (must be from licensed breeder facilities)</li>
                <li>Any listing attempting to circumvent TPWD regulations</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Whitetail Breeder Requirements */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Whitetail Breeder Requirements</CardTitle>
            </div>
            <CardDescription>
              TPWD Breeder Permit & Transfer Approval Required
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Listing Requirements:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                  <li>Valid TPWD Breeder Permit Number</li>
                  <li>Breeder Facility ID</li>
                  <li>Deer ID Tag</li>
                  <li>CWD (Chronic Wasting Disease) disclosure acknowledgment</li>
                  <li>TPWD Breeder Permit document upload (verified by admin before listing goes live)</li>
                </ul>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="font-semibold text-yellow-800 mb-2">Transfer Approval Required Before Payout:</h3>
                <p className="text-sm text-yellow-700">
                  For whitetail breeder sales, sellers must upload a verified TPWD Transfer Approval document 
                  before funds can be released. This ensures compliance with TPWD transfer regulations.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">How It Works:</h3>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-4">
                  <li>Seller creates listing with TPWD permit information</li>
                  <li>Seller uploads TPWD Breeder Permit document</li>
                  <li>Admin reviews and verifies permit document</li>
                  <li>Listing goes live after admin approval</li>
                  <li>After sale, seller uploads TPWD Transfer Approval</li>
                  <li>Admin verifies transfer approval</li>
                  <li>Payout is released to seller</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exotics Requirements */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Wildlife/Exotics Requirements</CardTitle>
            </div>
            <CardDescription>
              TAHC Compliance Disclosures
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Registered livestock listings require the following disclosures:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Animal identification disclosure (proper tagging/identification)</li>
                <li>Health disclosure (health status acknowledgment)</li>
                <li>Transport disclosure (Texas-only transfer unless otherwise permitted)</li>
              </ul>
            </div>
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                Species must be from the controlled list (Axis, Fallow, Blackbuck, Aoudad, Nilgai, etc.). 
                "Other" specialty species require admin review before listing goes live.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Cattle Requirements */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Cattle/Livestock Requirements</CardTitle>
            </div>
            <CardDescription>
              Standard Livestock Compliance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Cattle listings require the following disclosures:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Identification disclosure (ear tags/brand present)</li>
                <li>Health disclosure (health status acknowledgment)</li>
                <li>Breed, sex, and quantity information</li>
                <li>Age or weight range</li>
              </ul>
            </div>
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>Buyer Responsibility:</strong> Buyers are responsible for ensuring compliance with 
                brand inspection requirements for interstate transport. Check with TAHC for current regulations.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Horse / Equestrian Requirements */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Horse &amp; Equestrian Requirements</CardTitle>
            </div>
            <CardDescription>
              Texas-only + written transfer (Bill of Sale) in-platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Horse listings require clear identification and disclosures, and include an in-platform Bill of Sale / written transfer document at checkout.
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Texas-only transactions (listing location + buyer address)</li>
                <li>Identification disclosure (microchip/brand/tattoo/markings encouraged)</li>
                <li>Health disclosure</li>
                <li>Transport disclosure</li>
                <li>Title / lien disclosure (seller attestation)</li>
                <li>Bill of Sale generated and stored with the order</li>
              </ul>
            </div>
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                The Bill of Sale is generated server-side and tied to the order so both parties can access it in-platform.
              </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground">
              Learn more on the <Link className="underline underline-offset-4 hover:text-foreground" href="/trust#horses">Trust &amp; Compliance</Link> page.
            </p>
          </CardContent>
        </Card>

        {/* Ranch Equipment Requirements */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Ranch Equipment &amp; Attachments</CardTitle>
            </div>
            <CardDescription>
              Machinery and attachments (vehicles listed separately)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Equipment listings are multi-state and do not require Texas-only restrictions. These listings are for tractors, skid steers,
                ranch machinery, and attachments/implements. Vehicles and trailers are listed under Ranch Vehicles &amp; Trailers.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Ranch Vehicles Requirements */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Ranch Vehicles &amp; Trailers</CardTitle>
            </div>
            <CardDescription>
              Title &amp; VIN requirements for vehicles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ranch vehicles and trailers are multi-state and do not require Texas-only restrictions. For vehicles (UTV, ATV, Trailer, Truck),
                listings require:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Title status disclosure (has title or not)</li>
                <li>VIN or Serial Number</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Payout Holds & Release */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <CardTitle>Payout Holds & Release</CardTitle>
            </div>
            <CardDescription>
              How Payment Works
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Wildlife Exchange uses a payout-hold workflow to protect both buyers and sellers:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Buyer pays platform via Stripe Checkout at purchase</li>
                <li>Funds are held for payout release by the platform</li>
                <li>For whitetail breeder orders: Seller must upload TPWD Transfer Approval</li>
                <li>Admin verifies transfer approval document</li>
                <li>Admin releases payout to seller via Stripe Transfer</li>
              </ol>
            </div>
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Protection:</strong> This payout-hold workflow helps ensure required marketplace documents are verified
                before funds are released, protecting both buyers and sellers.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Questions?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If you have questions about compliance requirements or need assistance, please contact our 
              support team or review the{' '}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
