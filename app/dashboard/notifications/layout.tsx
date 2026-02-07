/**
 * Force this route to be dynamic so notifications HTML is not cached.
 * Helps avoid "I don't see the same red/needs-action as another user" due to stale cache.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
