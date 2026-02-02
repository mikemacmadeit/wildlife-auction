'use client';

/**
 * Canvas-based signature pad for touch and mouse.
 * Exports to PNG base64 via ref.
 */

import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

interface SignaturePadProps {
  onSignatureChange?: (hasStroke: boolean) => void;
  width?: number;
  height?: number;
  className?: string;
}

export interface SignaturePadRef {
  getPngBase64: () => string | null;
}

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  function SignaturePad({ onSignatureChange, width = 400, height = 200, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    getPngBase64: () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      try {
        return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      } catch {
        return null;
      }
    },
  }), []);
  const [isDrawing, setIsDrawing] = useState(false);
  const hasStrokeRef = useRef(false);

  const getPoint = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      if (!t) return null;
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const draw = useCallback((pt: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    hasStrokeRef.current = true;
  }, []);

  const startDraw = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      const pt = getPoint(e);
      if (!pt) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      setIsDrawing(true);
    },
    [getPoint]
  );

  const moveDraw = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      e.preventDefault();
      if (!isDrawing) return;
      const pt = getPoint(e);
      if (pt) draw(pt);
    },
    [isDrawing, getPoint, draw]
  );

  const endDraw = useCallback(() => {
    setIsDrawing(false);
    onSignatureChange?.(hasStrokeRef.current);
  }, [onSignatureChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
    onSignatureChange?.(false);
  }, [onSignatureChange]);

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="touch-none w-full border border-input rounded-lg bg-white"
        style={{ maxWidth: '100%', aspectRatio: `${width}/${height}` }}
        onMouseDown={startDraw}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={moveDraw}
        onTouchEnd={endDraw}
      />
      <button
        type="button"
        onClick={handleClear}
        className="mt-2 text-sm text-muted-foreground hover:text-foreground underline"
      >
        Clear
      </button>
    </div>
  );
});
