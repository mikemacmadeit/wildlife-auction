/**
 * Development Diagnostics Page
 * 
 * Renders diagnostic information about:
 * - Current pathname
 * - Layout tree & computed rects of main containers
 * - Whether children are mounted
 * - Whether an ErrorBoundary caught anything
 * 
 * Access at: /dev/diagnostics
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VisibilityDiagnostics } from '@/lib/dev/visibility-diagnostics';

interface ContainerInfo {
  selector: string;
  className: string;
  rect: DOMRect;
  styles: {
    display: string;
    position: string;
    overflow: string;
    width: string;
    height: string;
    minWidth: string;
    minHeight: string;
    zIndex: string;
  };
  children: number;
  visible: boolean;
}

export default function DiagnosticsPage() {
  const pathname = usePathname();
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [childrenMounted, setChildrenMounted] = useState(false);
  const [errorBoundaryState, setErrorBoundaryState] = useState<string>('No errors');
  const mainRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const updateDiagnostics = () => {
      const containerInfos: ContainerInfo[] = [];
      
      // Check main content area
      const main = document.querySelector('main');
      if (main) {
        const rect = main.getBoundingClientRect();
        const styles = window.getComputedStyle(main);
        containerInfos.push({
          selector: 'main',
          className: main.className,
          rect,
          styles: {
            display: styles.display,
            position: styles.position,
            overflow: styles.overflow,
            width: styles.width,
            height: styles.height,
            minWidth: styles.minWidth,
            minHeight: styles.minHeight,
            zIndex: styles.zIndex,
          },
          children: main.children.length,
          visible: rect.width > 0 && rect.height > 0,
        });
      }
      
      // Check dashboard main content
      const dashboardMain = document.querySelector('[class*="flex-1"][class*="overflow-y-auto"]');
      if (dashboardMain && dashboardMain !== main) {
        const rect = dashboardMain.getBoundingClientRect();
        const styles = window.getComputedStyle(dashboardMain);
        containerInfos.push({
          selector: 'dashboard-main',
          className: dashboardMain.className,
          rect,
          styles: {
            display: styles.display,
            position: styles.position,
            overflow: styles.overflow,
            width: styles.width,
            height: styles.height,
            minWidth: styles.minWidth,
            minHeight: styles.minHeight,
            zIndex: styles.zIndex,
          },
          children: dashboardMain.children.length,
          visible: rect.width > 0 && rect.height > 0,
        });
      }
      
      // Check sidebar
      const sidebar = document.querySelector('aside[class*="md:flex"]');
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        const styles = window.getComputedStyle(sidebar);
        containerInfos.push({
          selector: 'sidebar',
          className: sidebar.className,
          rect,
          styles: {
            display: styles.display,
            position: styles.position,
            overflow: styles.overflow,
            width: styles.width,
            height: styles.height,
            minWidth: styles.minWidth,
            minHeight: styles.minHeight,
            zIndex: styles.zIndex,
          },
          children: sidebar.children.length,
          visible: rect.width > 0 && rect.height > 0,
        });
      }
      
      // Check if children are mounted
      const hasContent = (main?.children?.length ?? 0) > 0 || (dashboardMain?.children?.length ?? 0) > 0;
      setChildrenMounted(hasContent);
      
      setContainers(containerInfos);
    };
    
    updateDiagnostics();
    intervalRef.current = setInterval(updateDiagnostics, 1000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pathname]);

  // Check for error boundary state
  useEffect(() => {
    const checkErrorBoundary = () => {
      // Look for error boundary UI
      const errorCard = document.querySelector('[class*="border-destructive"][class*="bg-destructive"]');
      if (errorCard) {
        setErrorBoundaryState('Error boundary is active - error detected');
      } else {
        setErrorBoundaryState('No errors detected');
      }
    };
    
    checkErrorBoundary();
    const interval = setInterval(checkErrorBoundary, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>App Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Route */}
            <div>
              <h3 className="font-semibold mb-2">Current Route</h3>
              <Badge variant="outline">{pathname || 'unknown'}</Badge>
            </div>

            {/* Children Mounted */}
            <div>
              <h3 className="font-semibold mb-2">Children Mounted</h3>
              <Badge variant={childrenMounted ? 'default' : 'destructive'}>
                {childrenMounted ? 'Yes' : 'No'}
              </Badge>
            </div>

            {/* Error Boundary */}
            <div>
              <h3 className="font-semibold mb-2">Error Boundary State</h3>
              <Badge variant={errorBoundaryState.includes('No errors') ? 'default' : 'destructive'}>
                {errorBoundaryState}
              </Badge>
            </div>

            {/* Container Info */}
            <div>
              <h3 className="font-semibold mb-2">Container Layout Tree</h3>
              <div className="space-y-4">
                {containers.map((container, i) => (
                  <Card key={i} className={container.visible ? '' : 'border-destructive'}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        {container.selector}
                        {container.visible ? (
                          <Badge variant="default" className="text-xs">Visible</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Hidden/Collapsed</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      <div>
                        <strong>Classes:</strong> <code className="text-[10px]">{container.className}</code>
                      </div>
                      <div>
                        <strong>Rect:</strong> {container.rect.width.toFixed(0)} × {container.rect.height.toFixed(0)}px
                        {' '}at ({container.rect.x.toFixed(0)}, {container.rect.y.toFixed(0)})
                      </div>
                      <div>
                        <strong>Children:</strong> {container.children}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div><strong>Display:</strong> {container.styles.display}</div>
                        <div><strong>Position:</strong> {container.styles.position}</div>
                        <div><strong>Overflow:</strong> {container.styles.overflow}</div>
                        <div><strong>Z-Index:</strong> {container.styles.zIndex}</div>
                        <div><strong>Width:</strong> {container.styles.width}</div>
                        <div><strong>Height:</strong> {container.styles.height}</div>
                        <div><strong>Min-Width:</strong> {container.styles.minWidth}</div>
                        <div><strong>Min-Height:</strong> {container.styles.minHeight}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Visibility Diagnostics */}
            <div>
              <h3 className="font-semibold mb-2">Visibility Diagnostics</h3>
              <VisibilityDiagnostics enabled={true} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
