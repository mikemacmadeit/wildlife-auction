'use client';

import { useMemo, memo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle2,
  TrendingUp,
  Package,
  Calendar,
  ArrowRight,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { mockPayouts, Payout } from '@/lib/seller-mock-data';

export default function SellerPayoutsPage() {
  const availablePayouts = useMemo(() => 
    mockPayouts.filter((p) => p.status === 'available'),
    []
  );
  const pendingPayouts = useMemo(() => 
    mockPayouts.filter((p) => p.status === 'pending'),
    []
  );
  const completedPayouts = useMemo(() => 
    mockPayouts.filter((p) => p.status === 'completed'),
    []
  );

  const totalAvailable = useMemo(() => 
    availablePayouts.reduce((sum, p) => sum + p.netAmount, 0),
    [availablePayouts]
  );
  const totalPending = useMemo(() => 
    pendingPayouts.reduce((sum, p) => sum + p.netAmount, 0),
    [pendingPayouts]
  );

  const formatDate = (date?: Date) => {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const PayoutCard = memo(({ payout }: { payout: Payout }) => {
    const getStatusBadge = () => {
      switch (payout.status) {
        case 'available':
          return <Badge variant="secondary" className="font-semibold text-xs">Available</Badge>;
        case 'pending':
          return <Badge variant="destructive" className="font-semibold text-xs">Pending</Badge>;
        case 'completed':
          return <Badge variant="outline" className="font-semibold text-xs">Completed</Badge>;
        default:
          return null;
      }
    };

    return (
          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
        <CardContent className="pt-6 pb-6 px-4 md:px-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <Link
                      href={`/listing/${payout.saleId}`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {payout.saleTitle}
                    </Link>
                  </div>
                  {getStatusBadge()}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-foreground mb-1">
                    {formatCurrency(payout.netAmount)}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">
                    from {formatCurrency(payout.amount)} sale
                  </div>
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="pt-2 border-t border-border/50 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Transaction Fee:</span>
                  <span className="font-semibold text-foreground">{formatCurrency(payout.fees.transaction)}</span>
                </div>
                {payout.fees.subscription > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Subscription:</span>
                    <span className="font-semibold text-foreground">{formatCurrency(payout.fees.subscription)}</span>
                  </div>
                )}
                {payout.fees.services > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Services:</span>
                    <span className="font-semibold text-foreground">{formatCurrency(payout.fees.services)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                  <span className="font-semibold text-foreground">Total Fees:</span>
                  <span className="font-bold text-foreground">{formatCurrency(payout.fees.total)}</span>
                </div>
              </div>

              {/* Schedule Info */}
              {payout.status === 'available' && payout.scheduledDate && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                  <Calendar className="h-3 w-3" />
                  <span>Scheduled: {formatDate(payout.scheduledDate)}</span>
                </div>
              )}
              {payout.status === 'completed' && payout.completedDate && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Completed: {formatDate(payout.completedDate)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  });
  PayoutCard.displayName = 'PayoutCard';

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
            Payouts
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Manage your earnings and payout schedule
          </p>
        </div>

        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Available Balance
              </CardTitle>
              <div className="w-10 h-10 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl md:text-4xl font-extrabold text-foreground mb-1">
                {formatCurrency(totalAvailable)}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Ready for payout
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Pending Payouts
              </CardTitle>
              <div className="w-10 h-10 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl md:text-4xl font-extrabold text-foreground mb-1">
                {formatCurrency(totalPending)}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Awaiting processing
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Fee Information */}
        <Card className="border-2 border-border/50 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl font-extrabold">Fee Structure</CardTitle>
            </div>
            <CardDescription>
              Transparent breakdown of marketplace fees
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <p className="text-sm font-semibold text-foreground mb-1">Transaction Fee</p>
                <p className="text-2xl font-extrabold text-primary mb-1">5%</p>
                <p className="text-xs text-muted-foreground">Applied to completed sales</p>
              </div>
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <p className="text-sm font-semibold text-foreground mb-1">Subscription</p>
                <p className="text-2xl font-extrabold text-primary mb-1">0%</p>
                <p className="text-xs text-muted-foreground">Free to list (plans available)</p>
              </div>
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <p className="text-sm font-semibold text-foreground mb-1">Services</p>
                <p className="text-2xl font-extrabold text-primary mb-1">Varies</p>
                <p className="text-xs text-muted-foreground">Verification, transport, insurance</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payouts Tabs */}
        <Tabs defaultValue="available" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-auto bg-card border border-border/50 p-1">
            <TabsTrigger value="available" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <DollarSign className="h-4 w-4 mr-2" />
              Available ({availablePayouts.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <Clock className="h-4 w-4 mr-2" />
              Pending ({pendingPayouts.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed ({completedPayouts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            {availablePayouts.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No available payouts</h3>
                  <p className="text-sm text-muted-foreground">
                    Available payouts will appear here when sales are completed
                  </p>
                </CardContent>
              </Card>
            ) : (
              availablePayouts.map((payout) => (
                <PayoutCard key={payout.id} payout={payout} />
              ))
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {pendingPayouts.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No pending payouts</h3>
                  <p className="text-sm text-muted-foreground">
                    Pending payouts will appear here while processing
                  </p>
                </CardContent>
              </Card>
            ) : (
              pendingPayouts.map((payout) => (
                <PayoutCard key={payout.id} payout={payout} />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedPayouts.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No completed payouts</h3>
                  <p className="text-sm text-muted-foreground">
                    Completed payouts will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              completedPayouts.map((payout) => (
                <PayoutCard key={payout.id} payout={payout} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
