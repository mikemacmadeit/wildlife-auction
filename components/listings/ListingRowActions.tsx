'use client';

import { useState, useRef, useEffect, memo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Edit, Pause, TrendingUp, Copy, CheckCircle2, MoreVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ListingRowActionsProps {
  listingId: string;
  status: string;
  onPause?: () => void;
  onPromote?: () => void;
  onDuplicate?: () => void;
  onMarkSold?: () => void;
}

const ListingRowActions = memo(function ListingRowActions({
  listingId,
  status,
  onPause,
  onPromote,
  onDuplicate,
  onMarkSold,
}: ListingRowActionsProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close menu on escape key
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(!open)}
        aria-label="Actions"
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border-2 border-border/50 bg-card shadow-lg py-1"
        >
          <Link
            href={`/seller/listings/${listingId}/edit`}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-background/50 cursor-pointer"
            onClick={() => setOpen(false)}
          >
            <Edit className="h-4 w-4" />
            Edit
          </Link>
          {status === 'active' && (
            <button
              onClick={() => {
                onPause?.();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-background/50 cursor-pointer text-left"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          )}
          <button
            onClick={() => {
              onPromote?.();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-background/50 cursor-pointer text-left"
          >
            <TrendingUp className="h-4 w-4" />
            Promote
          </button>
          <button
            onClick={() => {
              onDuplicate?.();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-background/50 cursor-pointer text-left"
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </button>
          <div className="h-px bg-border/50 my-1" />
          <button
            onClick={() => {
              onMarkSold?.();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-background/50 cursor-pointer text-left"
          >
            <CheckCircle2 className="h-4 w-4" />
            Mark Sold
          </button>
        </div>
      )}
    </div>
  );
});

export { ListingRowActions };
