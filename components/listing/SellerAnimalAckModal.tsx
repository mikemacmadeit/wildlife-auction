'use client';

/**
 * Shared seller animal acknowledgment modal for create, edit, and duplicate flows.
 * Must match exactly across all flows for consistency.
 */

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ListingCategory } from '@/lib/types';

export interface SellerAnimalAckModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  category: ListingCategory | '';
  checkboxId?: string;
}

export function SellerAnimalAckModal({
  open,
  onOpenChange,
  checked,
  onCheckedChange,
  onConfirm,
  onCancel,
  category,
  checkboxId = 'seller-animal-ack-modal',
}: SellerAnimalAckModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Seller acknowledgment</DialogTitle>
          <DialogDescription>
            You must accept this acknowledgment to publish an animal listing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 px-1">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 md:p-4">
            <div className="flex items-start gap-2 md:gap-3">
              <Checkbox
                id={checkboxId}
                className="mt-1 min-h-[20px] min-w-[20px]"
                checked={checked}
                onCheckedChange={(c) => onCheckedChange(Boolean(c))}
              />
              <Label htmlFor={checkboxId} className="cursor-pointer leading-relaxed text-sm">
                <div className="space-y-2">
                  <div>
                    I acknowledge I am solely responsible for all representations, permits/records, and legal compliance for this animal listing, and that
                    Agchange does not take custody of animals.
                  </div>
                  {/* Category-specific disclosures (same as create listing) */}
                  {category === 'sporting_working_dogs' && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <div className="font-medium mb-1.5 text-xs md:text-sm">Required disclosures:</div>
                      <div className="text-xs md:text-sm space-y-1">
                        <div>• I have accurately disclosed identification details (if applicable).</div>
                        <div>• I have disclosed any known health issues and represented the dog honestly.</div>
                        <div>• I understand transfers are Texas-only on this platform.</div>
                      </div>
                    </div>
                  )}
                  {category === 'wildlife_exotics' && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <div className="font-medium mb-1.5 text-xs md:text-sm">Required disclosures:</div>
                      <div className="text-xs md:text-sm space-y-1">
                        <div>• I confirm that animals are properly identified/tagged as required by TAHC regulations.</div>
                        <div>• I acknowledge health disclosure requirements for registered livestock.</div>
                        <div>• I confirm that transfer is Texas-only unless otherwise permitted by regulations.</div>
                      </div>
                    </div>
                  )}
                  {category === 'cattle_livestock' && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <div className="font-medium mb-1.5 text-xs md:text-sm">Required disclosures:</div>
                      <div className="text-xs md:text-sm space-y-1">
                        <div>• I confirm that animals have proper ear tags/brand identification as required.</div>
                        <div>• I acknowledge health disclosure requirements for cattle.</div>
                      </div>
                    </div>
                  )}
                  {category === 'farm_animals' && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <div className="font-medium mb-1.5 text-xs md:text-sm">Required disclosures:</div>
                      <div className="text-xs md:text-sm space-y-1">
                        <div>• I confirm that animals are properly identified (ear tags, tattoos, or other as required).</div>
                        <div>• I acknowledge health disclosure requirements for farm animals.</div>
                      </div>
                    </div>
                  )}
                  {category === 'horse_equestrian' && (
                    <div className="mt-2 pt-2 border-t border-border/40">
                      <div className="font-medium mb-1.5 text-xs md:text-sm">Required disclosures:</div>
                      <div className="text-xs md:text-sm space-y-1">
                        <div>• I have accurately disclosed identifying information (microchip/brand/tattoo/markings/registration).</div>
                        <div>• I have disclosed any known health issues and represented the horse honestly.</div>
                        <div>• I understand transfers are Texas-only on this platform.</div>
                        <div>• I disclose any liens/encumbrances (or confirm there are none).</div>
                      </div>
                    </div>
                  )}
                </div>
              </Label>
            </div>
          </div>

          <div className="text-xs md:text-sm text-muted-foreground px-1">
            After you publish, your listing will be submitted for review and approval.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 flex-shrink-0">
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-[44px]"
            disabled={!checked}
            onClick={onConfirm}
          >
            I agree &amp; continue to publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
