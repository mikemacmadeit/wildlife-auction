'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-6 sm:p-8 rounded-xl border border-dashed border-border/60 bg-muted/10',
        className
      )}
    >
      {Icon ? (
        <div className="rounded-full bg-muted/30 p-4 mb-4">
          <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
        </div>
      ) : null}
      <h3 className="we-h4 mb-2">{title}</h3>
      {description ? (
        <p className="text-sm text-muted-foreground max-w-sm mb-4">{description}</p>
      ) : null}
      {action ? (
        action.href ? (
          <Button asChild variant="default" size="sm">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : action.onClick ? (
          <Button variant="default" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null
      ) : null}
      {children}
    </div>
  );
}
