'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { Bug, Eye, EyeOff } from 'lucide-react';

export function DebugHUD() {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useAdmin();
  const [isVisible, setIsVisible] = useState(true);
  const [renderTimestamp, setRenderTimestamp] = useState('');

  useEffect(() => {
    setRenderTimestamp(new Date().toLocaleTimeString());
  });

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 left-4 z-[9999] max-w-xs">
      <div className="bg-black/80 text-white text-xs rounded-lg shadow-lg border border-gray-700 backdrop-blur-sm">
        <div className="flex items-center justify-between p-2 border-b border-gray-700">
          <div className="flex items-center gap-1">
            <Bug className="h-3 w-3" />
            <span className="font-mono">DEBUG</span>
          </div>
          <button
            onClick={() => setIsVisible(!isVisible)}
            className="text-gray-400 hover:text-white"
          >
            {isVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
        </div>
        
        {isVisible && (
          <div className="p-3 space-y-2">
            <div>
              <span className="text-gray-400">Path:</span>
              <div className="font-mono text-xs break-all">{pathname || 'N/A'}</div>
            </div>
            
            <div>
              <span className="text-gray-400">Auth:</span>
              <div className="font-mono text-xs">
                {authLoading ? '⏳ Loading' : user ? '✅ Authenticated' : '❌ Not authenticated'}
              </div>
            </div>
            
            <div>
              <span className="text-gray-400">Role:</span>
              <div className="font-mono text-xs">
                {isAdmin ? '👑 Admin' : '👤 User'}
              </div>
            </div>
            
            <div>
              <span className="text-gray-400">Render:</span>
              <div className="font-mono text-xs">{renderTimestamp}</div>
            </div>
            
            <div>
              <span className="text-gray-400">UID:</span>
              <div className="font-mono text-xs break-all">
                {user?.uid ? user.uid.slice(0, 8) + '...' : 'None'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}