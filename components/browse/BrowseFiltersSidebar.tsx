'use client';

import { useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import type { FilterState } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  BROWSE_CATEGORIES,
  BROWSE_HEALTH_STATUS_OPTIONS,
  BROWSE_QUANTITY_OPTIONS,
  BROWSE_SPECIES,
  BROWSE_STATES,
} from '@/components/browse/filters/constants';

export function BrowseFiltersSidebar(props: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  onClearAll: () => void;
  className?: string;
}) {
  const { value, onChange, onClearAll, className } = props;
  const [speciesQuery, setSpeciesQuery] = useState('');

  const price = useMemo(() => {
    const min = typeof value.minPrice === 'number' ? value.minPrice : 0;
    const max = typeof value.maxPrice === 'number' ? value.maxPrice : 50000;
    return [Math.max(0, Math.min(min, max)), Math.max(0, Math.max(min, max))] as [number, number];
  }, [value.maxPrice, value.minPrice]);

  const speciesOptions = useMemo(() => {
    const q = speciesQuery.trim().toLowerCase();
    if (!q) return BROWSE_SPECIES;
    return BROWSE_SPECIES.filter((s) => s.label.toLowerCase().includes(q) || s.value.toLowerCase().includes(q));
  }, [speciesQuery]);

  const activeCount = useMemo(() => {
    let count = 0;
    if (value.category) count++;
    if (value.location?.state) count++;
    if (value.minPrice !== undefined || value.maxPrice !== undefined) count++;
    if (value.species && value.species.length > 0) count++;
    if (value.quantity) count++;
    if (value.healthStatus && value.healthStatus.length > 0) count++;
    if (value.papers !== undefined) count++;
    if (value.verifiedSeller) count++;
    if (value.transportReady) count++;
    if (value.endingSoon) count++;
    if (value.newlyListed) count++;
    if (value.featured) count++;
    return count;
  }, [value]);

  return (
    <div className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold">Filters</div>
          <div className="text-xs text-muted-foreground">{activeCount ? `${activeCount} active` : 'No filters applied'}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-2 font-semibold"
          disabled={activeCount === 0}
          onClick={onClearAll}
        >
          Clear
        </Button>
      </div>

      <Separator className="my-4" />

      <Accordion type="multiple" defaultValue={['category', 'location', 'price', 'showOnly']} className="w-full">
        <AccordionItem value="category">
          <AccordionTrigger className="text-sm font-bold">Category</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              {BROWSE_CATEGORIES.map((c) => {
                const checked = value.category === c.value;
                return (
                  <div key={c.value} className="flex items-center gap-3 min-h-[40px]">
                    <Checkbox
                      id={`cat-${c.value}`}
                      checked={checked}
                      onCheckedChange={(next) => {
                        onChange({
                          ...value,
                          category: next ? c.value : undefined,
                        });
                      }}
                    />
                    <Label htmlFor={`cat-${c.value}`} className="text-sm font-normal cursor-pointer flex-1">
                      {c.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="location">
          <AccordionTrigger className="text-sm font-bold">Location</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">State</Label>
              <Select
                value={value.location?.state || ''}
                onValueChange={(s) => {
                  onChange({
                    ...value,
                    location: { ...(value.location || {}), state: s || undefined },
                  });
                }}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Any state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {BROWSE_STATES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="price">
          <AccordionTrigger className="text-sm font-bold">Price</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  ${price[0].toLocaleString()} – ${price[1].toLocaleString()}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 font-semibold"
                  onClick={() => onChange({ ...value, minPrice: undefined, maxPrice: undefined })}
                  disabled={value.minPrice === undefined && value.maxPrice === undefined}
                >
                  Reset
                </Button>
              </div>

              <Slider
                value={[price[0], price[1]]}
                min={0}
                max={100000}
                step={100}
                onValueChange={(vals) => {
                  const [min, max] = vals as number[];
                  onChange({
                    ...value,
                    minPrice: min > 0 ? min : undefined,
                    maxPrice: max < 100000 ? max : undefined,
                  });
                }}
              />

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Min</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="min-h-[40px]"
                    value={value.minPrice ?? ''}
                    placeholder="Any"
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw === '' ? undefined : Number(raw);
                      onChange({ ...value, minPrice: Number.isFinite(n as any) ? (n as any) : undefined });
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Max</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="min-h-[40px]"
                    value={value.maxPrice ?? ''}
                    placeholder="Any"
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw === '' ? undefined : Number(raw);
                      onChange({ ...value, maxPrice: Number.isFinite(n as any) ? (n as any) : undefined });
                    }}
                  />
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="species">
          <AccordionTrigger className="text-sm font-bold">Species / Breed</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <Input
                value={speciesQuery}
                onChange={(e) => setSpeciesQuery(e.target.value)}
                placeholder="Search species…"
                className="min-h-[40px]"
              />
              <div className="max-h-[220px] overflow-auto pr-1 space-y-2">
                {speciesOptions.map((s) => {
                  const checked = (value.species || []).includes(s.value);
                  return (
                    <div key={s.value} className="flex items-center gap-3 min-h-[36px]">
                      <Checkbox
                        id={`species-${s.value}`}
                        checked={checked}
                        onCheckedChange={(next) => {
                          const cur = value.species || [];
                          const nextArr = next ? Array.from(new Set([...cur, s.value])) : cur.filter((x) => x !== s.value);
                          onChange({ ...value, species: nextArr.length ? nextArr : undefined });
                        }}
                      />
                      <Label htmlFor={`species-${s.value}`} className="text-sm font-normal cursor-pointer flex-1">
                        {s.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="details">
          <AccordionTrigger className="text-sm font-bold">Details</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Quantity</Label>
                <Select
                  value={value.quantity || ''}
                  onValueChange={(q) => onChange({ ...value, quantity: (q || undefined) as any })}
                >
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any</SelectItem>
                    {BROWSE_QUANTITY_OPTIONS.map((q) => (
                      <SelectItem key={q.value} value={q.value}>
                        {q.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Health notes include</Label>
                <div className="space-y-2">
                  {BROWSE_HEALTH_STATUS_OPTIONS.map((h) => {
                    const checked = (value.healthStatus || []).includes(h.value);
                    return (
                      <div key={h.value} className="flex items-center gap-3 min-h-[36px]">
                        <Checkbox
                          id={`health-${h.value}`}
                          checked={checked}
                          onCheckedChange={(next) => {
                            const cur = value.healthStatus || [];
                            const nextArr = next ? Array.from(new Set([...cur, h.value])) : cur.filter((x) => x !== h.value);
                            onChange({ ...value, healthStatus: nextArr.length ? nextArr : undefined });
                          }}
                        />
                        <Label htmlFor={`health-${h.value}`} className="text-sm font-normal cursor-pointer flex-1">
                          {h.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="showOnly">
          <AccordionTrigger className="text-sm font-bold">Show only</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="papers"
                  checked={value.papers === true}
                  onCheckedChange={(next) => onChange({ ...value, papers: next ? true : undefined })}
                />
                <Label htmlFor="papers" className="text-sm font-normal cursor-pointer flex-1">
                  Has papers / registration
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="verifiedSeller"
                  checked={value.verifiedSeller === true}
                  onCheckedChange={(next) => onChange({ ...value, verifiedSeller: next ? true : undefined })}
                />
                <Label htmlFor="verifiedSeller" className="text-sm font-normal cursor-pointer flex-1">
                  Verified seller
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="transportReady"
                  checked={value.transportReady === true}
                  onCheckedChange={(next) => onChange({ ...value, transportReady: next ? true : undefined })}
                />
                <Label htmlFor="transportReady" className="text-sm font-normal cursor-pointer flex-1">
                  Transport ready
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="endingSoon"
                  checked={value.endingSoon === true}
                  onCheckedChange={(next) => onChange({ ...value, endingSoon: next ? true : undefined })}
                />
                <Label htmlFor="endingSoon" className="text-sm font-normal cursor-pointer flex-1">
                  Ending soon (24h)
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="newlyListed"
                  checked={value.newlyListed === true}
                  onCheckedChange={(next) => onChange({ ...value, newlyListed: next ? true : undefined })}
                />
                <Label htmlFor="newlyListed" className="text-sm font-normal cursor-pointer flex-1">
                  Newly listed (7d)
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="featured"
                  checked={value.featured === true}
                  onCheckedChange={(next) => onChange({ ...value, featured: next ? true : undefined })}
                />
                <Label htmlFor="featured" className="text-sm font-normal cursor-pointer flex-1">
                  Featured
                </Label>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

