'use client';

import { useCallback, useMemo, useState, useRef } from 'react';
import Cropper, { type Area, type MediaSize } from 'react-easy-crop';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export type AvatarCropResult = {
  croppedImageBlob: Blob;
  croppedImageUrl: string;
};

function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = imageSrc;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.92
      );
    };
    image.onerror = () => reject(new Error('Failed to load image'));
  });
}

export function AvatarCropDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  title?: string;
  description?: string;
  onSave: (result: AvatarCropResult) => void;
}) {
  const {
    open,
    onOpenChange,
    imageSrc,
    title = 'Crop Profile Photo',
    description = 'Adjust your photo to fit perfectly. Drag to reposition and use the zoom slider.',
    onSave,
  } = props;

  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [media, setMedia] = useState<MediaSize | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const saveEnabled = Boolean(media && croppedAreaPixels);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels || !imageSrc) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      const url = URL.createObjectURL(blob);
      onSave({ croppedImageBlob: blob, croppedImageUrl: url });
    } catch (error) {
      console.error('Failed to crop image:', error);
    } finally {
      setSaving(false);
    }
  }, [croppedAreaPixels, imageSrc, onSave]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          // Reset state when closed
          setMedia(null);
          setCroppedAreaPixels(null);
          setCrop({ x: 0, y: 0 });
          setZoom(1);
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0 space-y-1">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-4 overflow-hidden">
          {/* Crop area: flexible so dialog + buttons fit in viewport without scroll */}
          <div className="flex-1 min-h-0 min-w-0 flex items-center justify-center">
            <div
              className={cn(
                'relative w-full overflow-hidden rounded-lg border bg-black/80 aspect-square max-h-full'
              )}
            >
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onMediaLoaded={(m) => setMedia(m)}
                showGrid={true}
                restrictPosition={true}
              />
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Zoom</div>
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.01}
                onValueChange={(v) => setZoom(v[0] ?? 1)}
              />
            </div>
            <Button type="button" variant="outline" className="shrink-0 min-h-[44px] font-semibold" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="ghost"
              className="min-h-[44px] font-semibold"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-[44px] font-semibold"
              disabled={!saveEnabled || saving}
              onClick={handleSave}
            >
              {saving ? 'Processing...' : 'Save & Continue'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
