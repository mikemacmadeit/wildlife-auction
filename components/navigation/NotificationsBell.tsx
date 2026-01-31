'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare } from 'lucide-react';
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { subscribeToUnreadCount } from '@/lib/firebase/notifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type UserNotification = {
  id: string;
  title?: string;
  body?: string;
  type?: string;
  category?: string;
  deepLinkUrl?: string;
  linkLabel?: string;
  read?: boolean;
  createdAt?: any;
  metadata?: Record<string, any>;
};

function toAppPath(url: string): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const u = new URL(raw);
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return null;
    }
  }
  return null;
}

export function NotificationsBell(props: {
  userId: string;
  className?: string;
  // Optional: show admin "tasks" (e.g. pending listing approvals) on the main navbar bell.
  // This is separate from notification docs because those queues are often computed from live data.
  adminPendingApprovalsCount?: number;
  adminPendingApprovalsHref?: string;
}) {
  const { userId, className } = props;
  const router = useRouter();

  const [items, setItems] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const prevOpenRef = useRef<boolean>(false);
  const adminPendingApprovalsCount = Number(props.adminPendingApprovalsCount || 0) || 0;
  const adminPendingApprovalsHref = String(props.adminPendingApprovalsHref || '').trim() || '/dashboard/admin/listings';

  useEffect(() => {
    if (!userId) return;
    const ref = collection(db, 'users', userId, 'notifications');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(8));
    return onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as UserNotification[];
        setItems(next);
      },
      () => {
        setItems([]);
      }
    );
  }, [userId]);

  // IMPORTANT:
  // The dropdown only loads the latest N notifications for UX, but the bell badge must reflect
  // the user's true unread count (not just the visible slice).
  // Debounce updates to prevent flicker when multiple notifications change rapidly.
  useEffect(() => {
    if (!userId) return;
    let timeoutId: NodeJS.Timeout | null = null;
    let lastCount = 0;
    
    try {
      return subscribeToUnreadCount(userId, (count) => {
        // Only update if count actually changed
        if (count === lastCount) return;
        lastCount = count;
        
        // Debounce rapid updates (e.g. when marking multiple as read)
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setUnreadCount(count || 0);
          timeoutId = null;
        }, 150);
      });
    } catch (e) {
      console.error('NotificationsBell: failed to subscribe to unread count', e);
      setUnreadCount(0);
      return;
    }
  }, [userId]);

  const badgeCount = Math.max(0, unreadCount + adminPendingApprovalsCount);
  const hasUnread = badgeCount > 0;

  // When opening the dropdown, mark the visible notifications as read (best-effort).
  // This ensures the bell badge clears promptly and matches user expectation.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;
    if (!userId) return;

    const unreadVisible = items.filter((n) => n.read !== true).slice(0, 8);
    if (!unreadVisible.length) return;

    void Promise.all(
      unreadVisible.map((n) =>
        updateDoc(doc(db, 'users', userId, 'notifications', n.id), {
          read: true,
          readAt: serverTimestamp(),
        }).catch(() => null)
      )
    );
  }, [open, userId, items]);

  const handleClickNotif = async (n: UserNotification) => {
    try {
      // Best-effort mark-read; don't block navigation on failure.
      await updateDoc(doc(db, 'users', userId, 'notifications', n.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch {
      // ignore
    }

    const target = toAppPath(String(n.deepLinkUrl || ''));
    if (target) {
      router.push(target);
      setOpen(false);
      return;
    }
    // Fallback: open the main notifications page
    router.push('/dashboard/notifications');
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('relative h-9 w-9 lg:h-10 lg:w-10', className)}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {hasUnread ? (
            <span
              className={cn(
                'absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full',
                'bg-destructive text-destructive-foreground text-[11px] font-bold',
                'flex items-center justify-center'
              )}
            >
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {hasUnread ? <span className="text-xs text-muted-foreground">{badgeCount} unread</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {adminPendingApprovalsCount > 0 ? (
          <>
            <DropdownMenuItem
              className="flex items-center justify-between"
              onSelect={(e) => {
                e.preventDefault();
                router.push(adminPendingApprovalsHref);
                setOpen(false);
              }}
            >
              <span className="font-semibold">Admin approvals waiting</span>
              <span className="text-xs font-bold text-destructive">{adminPendingApprovalsCount}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {items.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          <>
            {items.slice(0, 6).map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn('flex items-start gap-3 py-2.5', n.read !== true && 'bg-primary/5')}
                onSelect={(e) => {
                  e.preventDefault();
                  void handleClickNotif(n);
                }}
              >
                <div className={cn('mt-0.5')}>
                  {String(n.type || '') === 'message_received' || String(n.category || '') === 'messages' ? (
                    <MessageSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Bell className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{n.title || 'Notification'}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{n.body || ''}</div>
                </div>
                {n.read !== true ? <span className="ml-auto mt-1 h-2 w-2 rounded-full bg-primary" /> : null}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                router.push('/dashboard/notifications');
                setOpen(false);
              }}
              className="justify-center font-semibold"
            >
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

