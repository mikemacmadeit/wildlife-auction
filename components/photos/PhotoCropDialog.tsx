'use client';

import { useCallback, useMemo, useState } from 'react';
import Cropper, { type Area, type MediaSize } from 'react-easy-crop';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export type FocalPoint = { x: number; y: number };
export type PhotoCropResult = { focalPoint: FocalPoint; zoom: number };

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function PhotoCropDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  aspect?: number; // width/height
  title?: string;
  description?: string;
  onSave: (result: PhotoCropResult) => void;
}) {
  const {
    open,
    onOpenChange,
    imageSrc,
    aspect = 4 / 3,
    title = 'Adjust thumbnail',
    description = 'Choose what part of the photo shows on listing cards.',
    onSave,
  } = props;

  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [media, setMedia] = useState<MediaSize | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const reset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const saveEnabled = Boolean(media && croppedAreaPixels);

  const focalPoint = useMemo<FocalPoint>(() => {
    if (!media || !croppedAreaPixels) return { x: 0.5, y: 0.5 };
    const cx = (croppedAreaPixels.x + croppedAreaPixels.width / 2) / (media.naturalWidth || 1);
    const cy = (croppedAreaPixels.y + croppedAreaPixels.height / 2) / (media.naturalHeight || 1);
    return { x: clamp01(cx), y: clamp01(cy) };
  }, [croppedAreaPixels, media]);

  const cropResult = useMemo<PhotoCropResult>(() => {
    const safeZoom = Number.isFinite(zoom) ? Math.max(1, Math.min(3, zoom)) : 1;
    return { focalPoint, zoom: safeZoom };
  }, [focalPoint, zoom]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          // Keep state (so reopen feels stable), but ensure media/crop data doesn't leak between images.
          setMedia(null);
          setCroppedAreaPixels(null);
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={cn(
              'relative w-full overflow-hidden rounded-lg border bg-black/80',
              // The cropper needs a concrete height; aspect ratio keeps it consistent.
            )}
            style={{ aspectRatio: String(aspect) }}
          >
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              onMediaLoaded={(m) => setMedia(m)}
              showGrid={true}
              restrictPosition={true}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Zoom</div>
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.01}
                onValueChange={(v) => setZoom(v[0] ?? 1)}
              />
            </div>
            <Button type="button" variant="outline" className="min-h-[44px] font-semibold" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" className="min-h-[44px] font-semibold" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-[44px] font-semibold"
              disabled={!saveEnabled}
              onClick={() => onSave(cropResult)}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

