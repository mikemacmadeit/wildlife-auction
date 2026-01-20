'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, CheckCircle2, AlertCircle, Clock, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mockSellerListings, SellerListing } from '@/lib/seller-mock-data';

type StatusFilter = 'all' | 'pending' | 'complete' | 'not_requested';

export default function SellerLogisticsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [verificationFilter, setVerificationFilter] = useState<StatusFilter>('all');

  const filteredListings = useMemo(() => {
    let result = [...mockSellerListings];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((listing) =>
        listing.title.toLowerCase().includes(query) ||
        listing.location?.city?.toLowerCase().includes(query) ||
        listing.location?.state?.toLowerCase().includes(query)
      );
    }

    // Verification filter
    if (verificationFilter !== 'all') {
      result = result.filter((listing) => {
        if (verificationFilter === 'pending') return listing.verificationStatus === 'pending';
        if (verificationFilter === 'complete') return listing.verificationStatus === 'verified';
        if (verificationFilter === 'not_requested') return listing.verificationStatus === 'not_requested';
        return true;
      });
    }

    return result;
  }, [searchQuery, verificationFilter]);

  const getVerificationBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon?: React.ReactNode }> = {
      eligible: { variant: 'outline', label: 'Eligible', icon: <CheckCircle2 className="h-3 w-3" /> },
      pending: { variant: 'destructive', label: 'Pending', icon: <Clock className="h-3 w-3" /> },
      verified: { variant: 'secondary', label: 'Verified', icon: <CheckCircle2 className="h-3 w-3" /> },
      not_requested: { variant: 'outline', label: 'Not Requested', icon: <AlertCircle className="h-3 w-3" /> },
    };
    const config = variants[status] || { variant: 'outline' as const, label: status };
    return (
      <Badge variant={config.variant} className="font-semibold text-xs gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  // Count listings by status
  const verificationCounts = useMemo(() => {
    const counts = { all: mockSellerListings.length, pending: 0, complete: 0, not_requested: 0 };
    mockSellerListings.forEach((listing) => {
      if (listing.verificationStatus === 'pending') counts.pending++;
      else if (listing.verificationStatus === 'verified') counts.complete++;
      else if (listing.verificationStatus === 'not_requested') counts.not_requested++;
    });
    return counts;
  }, []);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
            Documents & Delivery Status
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Manage documents and delivery notes for your listings. Wildlife Exchange does not arrange pickup or delivery.
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="border-2 border-border/50 bg-card">
          <CardContent className="pt-6 pb-6 px-4 md:px-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search listings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 h-11 bg-background"
              />
            </div>

            <Tabs defaultValue="verification" className="w-full">
              <TabsList className="grid w-full grid-cols-1 h-auto bg-background border border-border/50 p-1">
                <TabsTrigger 
                  value="verification" 
                  className="min-h-[44px] font-semibold data-[state=active]:bg-card"
                >
                  <FileCheck className="h-4 w-4 mr-2" />
                  Documents
                </TabsTrigger>
              </TabsList>

              <TabsContent value="verification" className="space-y-3 mt-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={verificationFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setVerificationFilter('all')}
                    className="text-xs"
                  >
                    All ({verificationCounts.all})
                  </Button>
                  <Button
                    variant={verificationFilter === 'pending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setVerificationFilter('pending')}
                    className="text-xs"
                  >
                    Pending ({verificationCounts.pending})
                  </Button>
                  <Button
                    variant={verificationFilter === 'complete' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setVerificationFilter('complete')}
                    className="text-xs"
                  >
                    Verified ({verificationCounts.complete})
                  </Button>
                  <Button
                    variant={verificationFilter === 'not_requested' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setVerificationFilter('not_requested')}
                    className="text-xs"
                  >
                    Not Requested ({verificationCounts.not_requested})
                  </Button>
                </div>
              </TabsContent>

            </Tabs>
          </CardContent>
        </Card>

        {/* Listings with document status (marketplace workflow; not transport coordination) */}
        {filteredListings.length === 0 ? (
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="pt-12 pb-12 px-6 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground font-medium">No listings found</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredListings.map((listing) => (
              <Card key={listing.id} className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
                <CardContent className="pt-6 pb-6 px-4 md:px-6">
                  <div className="space-y-4">
                    {/* Listing Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <Link
                          href={`/listing/${listing.id}`}
                          className="text-lg font-bold text-foreground hover:text-primary block mb-2"
                        >
                          {listing.title}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          Location: {listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}
                        </p>
                      </div>
                      <Link href={`/listing/${listing.id}`}>
                        <Button variant="outline" size="sm" className="text-xs">
                          View Listing
                        </Button>
                      </Link>
                    </div>

                    {/* Status Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border/50">
                      {/* Verification */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileCheck className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-foreground">Verification</span>
                          </div>
                          {getVerificationBadge(listing.verificationStatus)}
                        </div>
                        {listing.verificationStatus === 'not_requested' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full min-h-[36px] font-semibold text-xs"
                          >
                            Request Verification
                          </Button>
                        )}
                        {listing.verificationStatus === 'pending' && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>Awaiting documentation review</p>
                            <Button variant="ghost" size="sm" className="w-full text-xs h-8">
                              View Requirements
                            </Button>
                          </div>
                        )}
                        {listing.verificationStatus === 'verified' && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                            Reviewed (marketplace workflow)
                          </p>
                        )}
                        {listing.verificationStatus === 'eligible' && (
                          <p className="text-xs text-muted-foreground">
                            Eligible for verification
                          </p>
                        )}
                      </div>

                      {/* Delivery/pickup is arranged by buyer & seller off-platform; no transport tools here by design. */}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
