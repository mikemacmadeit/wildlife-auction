import { cn } from '@/lib/utils';

/**
 * Renders the brand name with "Ag" in the lighter green (primary) and "change" inheriting
 * the parent/text color. Use for navbar, footer, and dashboard/seller chrome.
 */
export function BrandLogoText({ className }: { className?: string }) {
  return (
    <span className={cn(className)}>
      <span className="text-primary">Ag</span>change
    </span>
  );
}
