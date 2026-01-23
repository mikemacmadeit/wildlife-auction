'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function SiteGateOverlay() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg border-2 border-border/50">
        <CardHeader>
          <CardTitle className="text-2xl font-extrabold">Coming Soon</CardTitle>
          <CardDescription>
            Private beta. Enter the access password to continue.
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
                const next = window.location.pathname + window.location.search;
                const res = await fetch('/api/site-gate/login', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ password, next }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setError(data?.error || 'Invalid password');
                  setLoading(false);
                  return;
                }
                // Cookie is set in response headers via Set-Cookie
                // Full page reload ensures cookie is available on next page
                const redirectTo = data?.redirect || next || '/';
                window.location.href = redirectTo;
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

