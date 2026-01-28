import { cn } from '@/lib/utils';

/**
 * Renders the brand name with "Ag" in the lighter green (primary) and "change" inheriting
 * the parent/text color. Use for navbar, footer, and dashboard/seller chrome.
 * When agLarger is true (e.g. hero), "Ag" is shown bigger than "change".
 */
export function BrandLogoText({ className, agLarger }: { className?: string; agLarger?: boolean }) {
  return (
    <span className={cn(className)}>
      <span className={cn('text-primary', agLarger && 'text-[1.5em] font-extrabold leading-none')}>Ag</span>
      <span className={agLarger ? 'text-[0.82em] align-baseline' : undefined}>change</span>
    </span>
  );
}
