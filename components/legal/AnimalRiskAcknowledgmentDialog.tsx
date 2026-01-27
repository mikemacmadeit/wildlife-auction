'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';

export function AnimalRiskAcknowledgmentDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="border-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Live animal purchase acknowledgment
          </DialogTitle>
          <DialogDescription>
            This is required before purchasing any animal listing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <ul className="list-disc ml-5 space-y-1">
            <li>Agchange is a marketplace only and does not take custody, possession, or control of animals.</li>
            <li>Health and legality representations are made solely by the seller.</li>
            <li>Live animals have inherent risk (stress, illness, injury, escape, mortality).</li>
            <li>Risk transfers upon delivery or pickup (buyer and seller handle logistics).</li>
          </ul>

          <div className="rounded-xl border p-3 flex items-start gap-3">
            <Checkbox id="animal-ack" checked={checked} onCheckedChange={(v) => setChecked(Boolean(v))} className="mt-0.5" />
            <label htmlFor="animal-ack" className="leading-relaxed">
              I understand and acknowledge these risks. I agree this purchase is between me and the seller.
            </label>
          </div>

          <div className="text-xs text-muted-foreground">
            Read more:{' '}
            <Link href="/legal/buyer-acknowledgment" className="underline underline-offset-4">
              Buyer Acknowledgment
            </Link>{' '}
            and{' '}
            <Link href="/terms" className="underline underline-offset-4">
              Terms of Service
            </Link>
            .
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              className="font-semibold"
              onClick={() => {
                if (!checked) return;
                props.onConfirm();
              }}
              disabled={!checked}
            >
              Continue to checkout
            </Button>
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

