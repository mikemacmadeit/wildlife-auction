'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function ComingSoonPage() {
  const searchParams = useSearchParams();
  const next = useMemo(() => searchParams?.get('next') || '/', [searchParams]);

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg border-2 border-border/50">
        <CardHeader>
          <CardTitle className="text-2xl font-extrabold">Coming Soon</CardTitle>
          <CardDescription>
            This site is currently in private testing. Enter the access password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            placeholder="Access password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[48px]"
            autoFocus
          />
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          <Button
            type="button"
            className="w-full min-h-[48px] font-semibold"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const res = await fetch('/api/site-gate/login', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ password, next }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setError(data?.error || 'Invalid password');
                  return;
                }
                window.location.href = data?.redirect || next || '/';
              } catch (e: any) {
                setError(e?.message || 'Failed to sign in');
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Checking…' : 'Enter'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

