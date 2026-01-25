/**
 * Visibility Diagnostics Utility (Dev Only)
 * 
 * Detects and reports:
 * - Nodes with 0x0 bounding rect
 * - Parent containers collapsing
 * - Overflow clipping ancestors
 * - elementFromPoint null issues
 * 
 * Usage: Wrap your app or specific components with <VisibilityDiagnostics enabled={process.env.NODE_ENV === 'development'} />
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface DiagnosticReport {
  timestamp: number;
  pathname: string;
  issues: DiagnosticIssue[];
}

interface DiagnosticIssue {
  type: 'zero-size' | 'collapsed-parent' | 'overflow-clip' | 'element-from-point-null';
  element: HTMLElement;
  selector: string;
  details: string;
  rect: DOMRect;
  computedStyles: {
    display: string;
    visibility: string;
    opacity: string;
    position: string;
    overflow: string;
    width: string;
    height: string;
    minWidth: string;
    minHeight: string;
  };
}

export function VisibilityDiagnostics({ 
  enabled = false,
  onReport,
}: { 
  enabled?: boolean;
  onReport?: (report: DiagnosticReport) => void;
}) {
  const pathname = usePathname();
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const runDiagnostics = () => {
      const issues: DiagnosticIssue[] = [];
      const mainContent = document.querySelector('main');
      const dashboardMain = document.querySelector('[class*="flex-1"][class*="overflow-y-auto"]');
      
      // Check main content area
      const checkElement = (el: HTMLElement | null, name: string) => {
        if (!el) return;
        
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        
        // Check for zero-size elements
        if (rect.width === 0 && rect.height === 0 && el.offsetParent !== null) {
          issues.push({
            type: 'zero-size',
            element: el,
            selector: `${name} (${el.className || el.tagName})`,
            details: 'Element has 0x0 bounding rect but is in document flow',
            rect,
            computedStyles: {
              display: styles.display,
              visibility: styles.visibility,
              opacity: styles.opacity,
              position: styles.position,
              overflow: styles.overflow,
              width: styles.width,
              height: styles.height,
              minWidth: styles.minWidth,
              minHeight: styles.minHeight,
            },
          });
        }
        
        // Check for collapsed parent (has children but zero size)
        if (rect.width === 0 || rect.height === 0) {
          const hasVisibleChildren = Array.from(el.children).some(
            (child) => {
              const childRect = (child as HTMLElement).getBoundingClientRect();
              return childRect.width > 0 || childRect.height > 0;
            }
          );
          
          if (hasVisibleChildren) {
            issues.push({
              type: 'collapsed-parent',
              element: el,
              selector: `${name} (${el.className || el.tagName})`,
              details: 'Parent container has zero size but contains visible children',
              rect,
              computedStyles: {
                display: styles.display,
                visibility: styles.visibility,
                opacity: styles.opacity,
                position: styles.position,
                overflow: styles.overflow,
                width: styles.width,
                height: styles.height,
                minWidth: styles.minWidth,
                minHeight: styles.minHeight,
              },
            });
          }
        }
        
        // Check for overflow clipping
        if (styles.overflow === 'hidden' || styles.overflowX === 'hidden' || styles.overflowY === 'hidden') {
          const hasClippedChildren = Array.from(el.children).some(
            (child) => {
              const childRect = (child as HTMLElement).getBoundingClientRect();
              const parentRect = el.getBoundingClientRect();
              return (
                childRect.left < parentRect.left ||
                childRect.right > parentRect.right ||
                childRect.top < parentRect.top ||
                childRect.bottom > parentRect.bottom
              );
            }
          );
          
          if (hasClippedChildren) {
            issues.push({
              type: 'overflow-clip',
              element: el,
              selector: `${name} (${el.className || el.tagName})`,
              details: 'Element has overflow:hidden and may be clipping children',
              rect,
              computedStyles: {
                display: styles.display,
                visibility: styles.visibility,
                opacity: styles.opacity,
                position: styles.position,
                overflow: styles.overflow,
                width: styles.width,
                height: styles.height,
                minWidth: styles.minWidth,
                minHeight: styles.minHeight,
              },
            });
          }
        }
      };
      
      if (mainContent) checkElement(mainContent as HTMLElement, 'main');
      if (dashboardMain) checkElement(dashboardMain as HTMLElement, 'dashboard-main');
      
      // Check elementFromPoint at center of viewport
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const elementAtPoint = document.elementFromPoint(centerX, centerY);
      
      if (!elementAtPoint || elementAtPoint === document.body || elementAtPoint === document.documentElement) {
        issues.push({
          type: 'element-from-point-null',
          element: document.body,
          selector: 'viewport-center',
          details: `elementFromPoint(${centerX}, ${centerY}) returned body/html - content may not be visible`,
          rect: document.body.getBoundingClientRect(),
          computedStyles: {
            display: 'block',
            visibility: 'visible',
            opacity: '1',
            position: 'static',
            overflow: 'visible',
            width: 'auto',
            height: 'auto',
            minWidth: '0',
            minHeight: '0',
          },
        });
      }
      
      const newReport: DiagnosticReport = {
        timestamp: Date.now(),
        pathname: pathname || 'unknown',
        issues,
      };
      
      setReport(newReport);
      onReport?.(newReport);
      
      // Log to console in dev
      if (issues.length > 0) {
        console.group(`[Visibility Diagnostics] ${issues.length} issue(s) found on ${pathname}`);
        issues.forEach((issue, i) => {
          console.warn(`Issue ${i + 1}: ${issue.type}`, {
            selector: issue.selector,
            details: issue.details,
            rect: issue.rect,
            styles: issue.computedStyles,
            element: issue.element,
          });
        });
        console.groupEnd();
      }
    };
    
    // Run immediately and then every 2 seconds
    runDiagnostics();
    intervalRef.current = setInterval(runDiagnostics, 2000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, pathname, onReport]);

  if (!enabled || !report || report.issues.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-destructive/90 text-destructive-foreground p-4 rounded-lg shadow-lg max-w-md text-xs">
      <div className="font-bold mb-2">⚠️ Visibility Issues Detected</div>
      <div className="space-y-1">
        {report.issues.map((issue, i) => (
          <div key={i} className="border-l-2 border-destructive-foreground pl-2">
            <div className="font-semibold">{issue.type}</div>
            <div className="text-[10px] opacity-90">{issue.details}</div>
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          console.table(report.issues.map(issue => ({
            type: issue.type,
            selector: issue.selector,
            details: issue.details,
            width: issue.rect.width,
            height: issue.rect.height,
          })));
        }}
        className="mt-2 text-[10px] underline"
      >
        Log full report to console
      </button>
    </div>
  );
}
