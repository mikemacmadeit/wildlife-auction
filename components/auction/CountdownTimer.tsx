'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  endsAt?: Date | null;
  endDate?: Date | null; // Alias for endsAt (backward compatibility)
  onEnd?: () => void;
  className?: string;
  showIcon?: boolean;
  variant?: 'default' | 'compact' | 'badge';
  pulseWhenEndingSoon?: boolean;
}

export function CountdownTimer({
  endsAt,
  endDate,
  onEnd,
  className,
  showIcon = true,
  variant = 'default',
  pulseWhenEndingSoon = true,
}: CountdownTimerProps) {
  // Use endsAt or endDate (endDate is alias for backward compatibility)
  const endTime: any = endsAt || endDate;

  function toMillisSafe(value: any): number | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime();
      } catch {
        // ignore
      }
    }
    if (typeof value?.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return Number.isFinite(d.getTime()) ? d.getTime() : null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d.getTime() : null;
    }
    return null;
  }

  const endTimeMs = useMemo(() => toMillisSafe(endTime), [endTime]);

  // Hooks must be called unconditionally - move before early return
  const [timeRemaining, setTimeRemaining] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    total: 0,
  });
  const [isEnded, setIsEnded] = useState(false);

  useEffect(() => {
    // Early return inside useEffect if no endTime
    if (!endTimeMs) return;
    const calculateTime = () => {
      if (!endTimeMs) return;
      
      const now = Date.now();
      const total = endTimeMs - now;

      if (total <= 0) {
        setIsEnded(true);
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });
        if (onEnd) onEnd();
        return;
      }

      const days = Math.floor(total / (1000 * 60 * 60 * 24));
      const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((total % (1000 * 60)) / 1000);

      setTimeRemaining({ days, hours, minutes, seconds, total });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);

    return () => clearInterval(interval);
  }, [endTimeMs, onEnd]);

  // Return null if no end time is provided (after all hooks)
  if (!endTimeMs) {
    return null;
  }

  const isEndingSoon = timeRemaining.total < 24 * 60 * 60 * 1000; // Less than 24 hours
  const isEndingVerySoon = timeRemaining.total < 60 * 60 * 1000; // Less than 1 hour

  if (isEnded) {
    return (
      <div className={cn('flex items-center gap-2 text-destructive font-bold', className)}>
        {showIcon && <Clock className="h-4 w-4" />}
        <span>Auction Ended</span>
      </div>
    );
  }

  // Badge variant (for listing cards)
  if (variant === 'badge') {
    return (
      <motion.div
        animate={pulseWhenEndingSoon && isEndingVerySoon ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold',
          isEndingVerySoon && 'bg-destructive/90 text-destructive-foreground',
          isEndingSoon && !isEndingVerySoon && 'bg-orange-500/90 text-white',
          !isEndingSoon && 'bg-card/80 text-foreground border border-border/50',
          className
        )}
      >
        {showIcon && <Clock className="h-3 w-3" />}
        <span>
          {timeRemaining.days > 0 && `${timeRemaining.days}d `}
          {timeRemaining.hours > 0 && `${timeRemaining.hours}h `}
          {timeRemaining.minutes > 0 && `${timeRemaining.minutes}m `}
          {timeRemaining.days === 0 && timeRemaining.hours === 0 && `${timeRemaining.seconds}s`}
        </span>
      </motion.div>
    );
  }

  // Compact variant (single line)
  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 text-sm font-semibold', className)}>
        {showIcon && <Clock className="h-4 w-4" />}
        <span className={cn(isEndingSoon && 'text-destructive font-bold')}>
          {timeRemaining.days > 0 && `${timeRemaining.days}d `}
          {timeRemaining.hours > 0 && `${timeRemaining.hours}h `}
          {timeRemaining.minutes > 0 && `${timeRemaining.minutes}m `}
          {timeRemaining.seconds}s
        </span>
      </div>
    );
  }

  // Default variant (detailed breakdown)
  return (
    <motion.div
      animate={pulseWhenEndingSoon && isEndingVerySoon ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 2, repeat: Infinity }}
      className={cn(
        'flex flex-col gap-2 p-4 rounded-lg border-2',
        isEndingVerySoon && 'border-destructive bg-destructive/10',
        isEndingSoon && !isEndingVerySoon && 'border-orange-500/50 bg-orange-500/5',
        !isEndingSoon && 'border-border/50 bg-card/50',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {showIcon && (
          <Clock className={cn(
            'h-5 w-5',
            isEndingVerySoon && 'text-destructive',
            isEndingSoon && !isEndingVerySoon && 'text-orange-500',
            !isEndingSoon && 'text-muted-foreground'
          )} />
        )}
        <span className={cn(
          'text-sm font-bold uppercase tracking-wide',
          isEndingVerySoon && 'text-destructive',
          isEndingSoon && !isEndingVerySoon && 'text-orange-500',
          !isEndingSoon && 'text-muted-foreground'
        )}>
          {isEndingVerySoon && '⚠️ Ending Very Soon!'}
          {isEndingSoon && !isEndingVerySoon && 'Ending Soon'}
          {!isEndingSoon && 'Time Remaining'}
        </span>
      </div>
      
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center">
          <div className={cn(
            'text-2xl md:text-3xl font-extrabold',
            isEndingSoon && 'text-destructive'
          )}>
            {String(timeRemaining.days).padStart(2, '0')}
          </div>
          <div className="text-xs text-muted-foreground font-medium uppercase">Days</div>
        </div>
        <div className="text-center">
          <div className={cn(
            'text-2xl md:text-3xl font-extrabold',
            isEndingSoon && 'text-destructive'
          )}>
            {String(timeRemaining.hours).padStart(2, '0')}
          </div>
          <div className="text-xs text-muted-foreground font-medium uppercase">Hours</div>
        </div>
        <div className="text-center">
          <div className={cn(
            'text-2xl md:text-3xl font-extrabold',
            isEndingSoon && 'text-destructive'
          )}>
            {String(timeRemaining.minutes).padStart(2, '0')}
          </div>
          <div className="text-xs text-muted-foreground font-medium uppercase">Minutes</div>
        </div>
        <div className="text-center">
          <div className={cn(
            'text-2xl md:text-3xl font-extrabold animate-pulse',
            isEndingSoon && 'text-destructive'
          )}>
            {String(timeRemaining.seconds).padStart(2, '0')}
          </div>
          <div className="text-xs text-muted-foreground font-medium uppercase">Seconds</div>
        </div>
      </div>
    </motion.div>
  );
}
