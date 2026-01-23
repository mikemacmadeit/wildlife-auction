'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export type SearchableMultiSelectOption = {
  value: string;
  label: string;
};

export function SearchableMultiSelect(props: {
  values: string[] | null | undefined;
  onChange: (values: string[]) => void;
  options: SearchableMultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  maxSelected?: number;
}) {
  const {
    values,
    onChange,
    options,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    disabled,
    className,
    buttonClassName,
    maxSelected,
  } = props;

  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => new Set((values || []).map((v) => String(v)).filter(Boolean)), [values]);

  const label = React.useMemo(() => {
    if (selected.size === 0) return placeholder;
    const labels: string[] = [];
    for (const v of Array.from(selected)) {
      const opt = options.find((o) => o.value === v);
      labels.push(opt ? opt.label : `${v} (custom)`);
      if (labels.length >= 2) break;
    }
    const head = labels.join(', ');
    const extra = selected.size - labels.length;
    return extra > 0 ? `${head} +${extra}` : head;
  }, [options, placeholder, selected]);

  const toggle = (value: string) => {
    const v = String(value || '').trim();
    if (!v) return;
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else {
      if (typeof maxSelected === 'number' && Number.isFinite(maxSelected) && maxSelected > 0 && next.size >= maxSelected) return;
      next.add(v);
    }
    onChange(Array.from(next));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between min-h-[48px] text-base', buttonClassName)}
        >
          <span className={cn('truncate text-left', selected.size === 0 && 'text-muted-foreground')}>{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[--radix-popover-trigger-width] p-0', className)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    toggle(opt.value);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', selected.has(opt.value) ? 'opacity-100' : 'opacity-0')} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t border-border/50 p-2 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : 'None selected'}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => onChange([])}
            disabled={selected.size === 0}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

