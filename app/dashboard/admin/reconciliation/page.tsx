/**
 * Admin Reconciliation Page
 * 
 * UI for running Stripe ↔ Firestore reconciliation checks
 */

'use client';

import { useState, useCallback } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  Search,
  Copy,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { runReconciliation } from '@/lib/stripe/api';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

interface ReconciliationIssue {
  type: string;
  severity: 'error' | 'warning';
  orderId?: string;
  listingId?: string;
  stripeId?: string;
  description: string;
  firestoreData?: any;
  stripeData?: any;
}

export default function ReconciliationPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    summary: {
      totalIssues: number;
      errorCount: number;
      warningCount: number;
      ordersChecked: number;
    };
    issues: ReconciliationIssue[];
    issuesByType: Record<string, ReconciliationIssue[]>;
    checkedAt: string;
  } | null>(null);

  // Filter inputs
  const [orderId, setOrderId] = useState('');
  const [listingId, setListingId] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [paymentIntentId, setPaymentIntentId] = useState('');

  const handleRunReconciliation = useCallback(async () => {
    if (!user?.uid || !isAdmin) return;

    setLoading(true);
    try {
      const result = await runReconciliation({
        orderId: orderId || undefined,
        listingId: listingId || undefined,
        buyerEmail: buyerEmail || undefined,
        sellerEmail: sellerEmail || undefined,
        paymentIntentId: paymentIntentId || undefined,
        limit: 100,
      });

      setResults(result);
      toast({
        title: 'Reconciliation Complete',
        description: `Found ${result.summary.totalIssues} issue(s): ${result.summary.errorCount} errors, ${result.summary.warningCount} warnings`,
        variant: result.summary.errorCount > 0 ? 'destructive' : 'default',
      });
    } catch (error: any) {
      console.error('Error running reconciliation:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run reconciliation',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, orderId, listingId, buyerEmail, sellerEmail, paymentIntentId, toast]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Copied to clipboard',
    });
  };

  if (adminLoading) {
    return (
      <PageLoader title="Loading…" subtitle="Getting things ready." minHeight="screen" />
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You don't have permission to access this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Stripe Reconciliation</h1>
        <p className="text-muted-foreground">
          Compare Stripe payment data with Firestore orders to identify discrepancies
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Optionally filter by specific order, listing, or payment details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Order ID</Label>
              <Input
                placeholder="Order ID"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </div>
            <div>
              <Label>Listing ID</Label>
              <Input
                placeholder="Listing ID"
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
              />
            </div>
            <div>
              <Label>Buyer Email</Label>
              <Input
                type="email"
                placeholder="Buyer email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Seller Email</Label>
              <Input
                type="email"
                placeholder="Seller email"
                value={sellerEmail}
                onChange={(e) => setSellerEmail(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Payment Intent ID</Label>
              <Input
                placeholder="Stripe Payment Intent ID"
                value={paymentIntentId}
                onChange={(e) => setPaymentIntentId(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={handleRunReconciliation}
              disabled={loading}
              className="w-full md:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Reconciliation...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Run Reconciliation
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Results</CardTitle>
            <CardDescription>
              Checked {results.summary.ordersChecked} orders at {formatDate(new Date(results.checkedAt))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Issues</p>
                    <p className="text-2xl font-bold">{results.summary.totalIssues}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Errors</p>
                    <p className="text-2xl font-bold text-destructive">{results.summary.errorCount}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Warnings</p>
                    <p className="text-2xl font-bold text-orange-600">{results.summary.warningCount}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Orders Checked</p>
                    <p className="text-2xl font-bold">{results.summary.ordersChecked}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Issues by Type */}
            {results.summary.totalIssues === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Issues Found</h3>
                <p className="text-muted-foreground">All Stripe data matches Firestore records.</p>
              </div>
            ) : (
              <Accordion type="multiple" className="w-full">
                {Object.entries(results.issuesByType).map(([issueType, issues]) => (
                  <AccordionItem key={issueType} value={issueType}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={issues[0].severity === 'error' ? 'destructive' : 'outline'}
                        >
                          {issues[0].severity === 'error' ? 'Error' : 'Warning'}
                        </Badge>
                        <span className="font-semibold">{issueType.replace(/_/g, ' ')}</span>
                        <Badge variant="secondary">{issues.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">
                        {issues.map((issue, index) => (
                          <Card key={index} className="border-l-4 border-l-orange-500">
                            <CardContent className="pt-4">
                              <div className="space-y-2">
                                <p className="font-medium">{issue.description}</p>
                                <div className="flex flex-wrap gap-2 text-sm">
                                  {issue.orderId && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-muted-foreground">Order:</span>
                                      <code className="text-xs bg-muted px-1 rounded">
                                        {issue.orderId.slice(-8)}
                                      </code>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-4 w-4 p-0"
                                        onClick={() => copyToClipboard(issue.orderId!)}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                      <Link href={`/dashboard/admin/ops?orderId=${issue.orderId}`}>
                                        <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                                          <ExternalLink className="h-3 w-3" />
                                        </Button>
                                      </Link>
                                    </div>
                                  )}
                                  {issue.listingId && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-muted-foreground">Listing:</span>
                                      <code className="text-xs bg-muted px-1 rounded">
                                        {issue.listingId.slice(-8)}
                                      </code>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-4 w-4 p-0"
                                        onClick={() => copyToClipboard(issue.listingId!)}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                      <Link href={`/listing/${issue.listingId}`}>
                                        <Button variant="ghost" size="sm" className="h-4 w-4 p-0">
                                          <ExternalLink className="h-3 w-3" />
                                        </Button>
                                      </Link>
                                    </div>
                                  )}
                                  {issue.stripeId && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-muted-foreground">Stripe ID:</span>
                                      <code className="text-xs bg-muted px-1 rounded">
                                        {issue.stripeId.slice(-12)}
                                      </code>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-4 w-4 p-0"
                                        onClick={() => copyToClipboard(issue.stripeId!)}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                {(issue.firestoreData || issue.stripeData) && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-muted-foreground">
                                      View Details
                                    </summary>
                                    <div className="mt-2 space-y-2">
                                      {issue.firestoreData && (
                                        <div>
                                          <p className="font-medium">Firestore:</p>
                                          <pre className="bg-muted p-2 rounded text-xs overflow-auto">
                                            {JSON.stringify(issue.firestoreData, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                      {issue.stripeData && (
                                        <div>
                                          <p className="font-medium">Stripe:</p>
                                          <pre className="bg-muted p-2 rounded text-xs overflow-auto">
                                            {JSON.stringify(issue.stripeData, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </details>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
