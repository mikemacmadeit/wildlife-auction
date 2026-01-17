'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Edit, Pause, TrendingUp, Copy, CheckCircle2, MoreVertical, Trash2 } from 'lucide-react';
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
  onPause?: () => void;
  onPromote?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

const ListingRowActions = memo(function ListingRowActions({
  listingId,
  status,
  onPause,
  onPromote,
  onDuplicate,
  onDelete,
}: ListingRowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-52">
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

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onPromote?.();
          }}
          className="flex items-center gap-2 font-semibold"
        >
          <TrendingUp className="h-4 w-4" />
          Promote
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onDuplicate?.();
          }}
          className="flex items-center gap-2 font-semibold"
        >
          <Copy className="h-4 w-4" />
          Duplicate
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

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onDelete?.();
          }}
          className={cn('flex items-center gap-2 font-semibold text-destructive focus:text-destructive')}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export { ListingRowActions };
