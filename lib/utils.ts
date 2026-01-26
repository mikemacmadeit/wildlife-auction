import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as currency (USD)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date for display
 */
export function formatDate(date?: Date | null): string {
  if (!date) return 'N/A';
  // Handle Date objects, ISO strings, or timestamp-like objects
  let dateObj: Date;
  if (date instanceof Date) {
    dateObj = date;
  } else if (typeof date === 'string') {
    dateObj = new Date(date);
  } else if (date && typeof date === 'object' && 'seconds' in date && typeof (date as any).seconds === 'number') {
    // Handle normalized {seconds, nanoseconds} objects
    const ms = (date as any).seconds * 1000 + ((date as any).nanoseconds || 0) / 1_000_000;
    dateObj = new Date(ms);
  } else {
    dateObj = new Date(date as any);
  }
  // Check if date is valid before formatting
  if (isNaN(dateObj.getTime())) {
    console.warn('formatDate: Invalid date value', date);
    return 'Invalid date';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format a date as relative time (e.g., "2 hours ago")
 * Re-exports formatDistanceToNow from date-fns
 */
export { formatDistanceToNow };
