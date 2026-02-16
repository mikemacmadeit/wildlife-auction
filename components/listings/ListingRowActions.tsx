'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Edit, Pause, TrendingUp, Copy, MoreVertical, Trash2, Send, Eye, CheckCircle, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ListingRowActionsProps {
  listingId: string;
  status: string;
  /** When sold, order ID so seller can open "Manage sale" (seller/orders/[orderId]) */
  orderId?: string;
  onPause?: () => void;
  onPromote?: () => void;
  onResubmit?: () => void;
  resubmitDisabled?: boolean;
  onDuplicate?: () => void;
  onDelete?: () => void;
  /** When listing shows as Ended/Expired but was actually sold; reconciles with paid order and marks sold */
  onReconcileSold?: () => void;
  reconcilingSold?: boolean;
}

const ListingRowActions = memo(function ListingRowActions({
  listingId,
  status,
  orderId,
  onPause,
  onPromote,
  onResubmit,
  resubmitDisabled,
  onDuplicate,
  onDelete,
  onReconcileSold,
  reconcilingSold,
}: ListingRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-52">
        {status === 'sold' && orderId ? (
          <DropdownMenuItem asChild>
            <Link href={`/seller/orders/${orderId}`} className="flex items-center gap-2 font-semibold">
              <Package className="h-4 w-4" />
              Manage sale
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={`/listing/${listingId}`} className="flex items-center gap-2 font-semibold">
            <Eye className="h-4 w-4" />
            View listing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/seller/listings/${listingId}/edit`} className="flex items-center gap-2 font-semibold">
            <Edit className="h-4 w-4" />
            Edit
          </Link>
        </DropdownMenuItem>

        {status === 'active' && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onPause?.();
            }}
            className="flex items-center gap-2 font-semibold"
          >
            <Pause className="h-4 w-4" />
            Pause
          </DropdownMenuItem>
        )}

        {(status === 'ended' || status === 'expired') && onReconcileSold ? (
          <DropdownMenuItem
            disabled={reconcilingSold}
            onSelect={(e) => {
              e.preventDefault();
              if (reconcilingSold) return;
              onReconcileSold();
            }}
            className="flex items-center gap-2 font-semibold"
          >
            <CheckCircle className="h-4 w-4" />
            {reconcilingSold ? 'Updating…' : 'Mark as sold'}
          </DropdownMenuItem>
        ) : null}

        {status === 'removed' ? (
          <DropdownMenuItem
            disabled={resubmitDisabled}
            onSelect={(e) => {
              e.preventDefault();
              if (resubmitDisabled) return;
              onResubmit?.();
            }}
            className="flex items-center gap-2 font-semibold"
          >
            <Send className="h-4 w-4" />
            Resubmit
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem
          onSelect={() => {
            onDuplicate?.();
          }}
          className="flex items-center gap-2 font-semibold"
        >
          <Copy className="h-4 w-4" />
          Sell another like this
        </DropdownMenuItem>

        {status === 'draft' && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onPromote?.();
            }}
            className="flex items-center gap-2 font-semibold"
          >
            <TrendingUp className="h-4 w-4" />
            Publish
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        {status !== 'sold' && (
          <DropdownMenuItem
            onSelect={() => {
              onDelete?.();
            }}
            className={cn('flex items-center gap-2 font-semibold text-destructive focus:text-destructive')}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export { ListingRowActions };
