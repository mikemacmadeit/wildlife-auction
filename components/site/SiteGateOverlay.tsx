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
            onChange={(e) => {
              // Trim whitespace as user types to prevent issues
              const trimmed = e.target.value.trim();
              setPassword(trimmed);
            }}
            onBlur={(e) => {
              // Ensure trimmed on blur
              const trimmed = e.target.value.trim();
              if (trimmed !== password) {
                setPassword(trimmed);
              }
            }}
            className="min-h-[48px]"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
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
                // Ensure password is trimmed before sending
                const trimmedPassword = password.trim();
                const next = window.location.pathname + window.location.search;
                
                console.log('[Site Gate] Submitting password:', {
                  length: trimmedPassword.length,
                  firstChars: trimmedPassword.substring(0, 3),
                });
                
                const res = await fetch('/api/site-gate/login', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ password: trimmedPassword, next }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  console.error('[Site Gate] Login failed:', data);
                  setError(data?.error || 'Invalid password');
                  return;
                }
                // Force a hard reload to ensure cookie is read
                window.location.href = data?.redirect || next || '/';
              } catch (e: any) {
                console.error('[Site Gate] Error:', e);
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

