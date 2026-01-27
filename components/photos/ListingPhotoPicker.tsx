'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Star, ArrowLeft, ArrowRight, X, Trash2, RotateCcw, Crop, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listUserPhotos, restoreUserPhoto, softDeleteUserPhoto, uploadUserPhoto, type UserPhotoDoc } from '@/lib/firebase/photos';
import { useToast } from '@/hooks/use-toast';
import { PhotoCropDialog, type FocalPoint, type PhotoCropResult } from '@/components/photos/PhotoCropDialog';

export type ListingPhotoSnapshot = {
  photoId: string;
  url: string;
  width?: number;
  height?: number;
  sortOrder?: number;
  /**
   * Focal point for smart-cropping on listing cards (0..1 normalized).
   * This does not modify the underlying image; it only affects how it is positioned when using `object-fit: cover`.
   */
  focalPoint?: FocalPoint;
  /**
   * Optional zoom factor (>=1) used to match the crop the user chose in the crop dialog.
   * This is applied at render-time (CSS transform) for thumbnails/cards.
   */
  cropZoom?: number;
};

export function ListingPhotoPicker(props: {
  uid: string;
  selected: ListingPhotoSnapshot[];
  coverPhotoId?: string;
  max?: number;
  onChange: (next: { selected: ListingPhotoSnapshot[]; coverPhotoId?: string }) => void;
}) {
  const { uid, selected, coverPhotoId, max = 8, onChange } = props;
  const { toast } = useToast();
  const [manageOpen, setManageOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [manageLoading, setManageLoading] = useState(true);
  const [manageTab, setManageTab] = useState<'active' | 'deleted'>('active');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [photos, setPhotos] = useState<UserPhotoDoc[]>([]);
  const [activeUploads, setActiveUploads] = useState<UserPhotoDoc[]>([]);
  const [deletedUploads, setDeletedUploads] = useState<UserPhotoDoc[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cropResolveRef = useRef<null | ((res: PhotoCropResult | null) => void)>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<null | { photoId: string; url: string }>(null);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.photoId)), [selected]);

  const requestCrop = async (target: { photoId: string; url: string }): Promise<PhotoCropResult | null> => {
    setCropTarget(target);
    setCropOpen(true);
    return await new Promise<PhotoCropResult | null>((resolve) => {
      cropResolveRef.current = resolve;
    });
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const p = await listUserPhotos(uid, { includeDeleted: false });
      setPhotos(p);
    } catch (e: any) {
      // Make permission issues obvious during dev: the common cause is missing Firestore rules.
      // Still show a toast for the user.
      // eslint-disable-next-line no-console
      console.error('[ListingPhotoPicker] Failed to load uploads', {
        code: e?.code,
        message: e?.message,
      });
      toast({ title: 'Error', description: e?.message || 'Failed to load uploads.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const refreshManage = async () => {
    setManageLoading(true);
    try {
      const [a, d] = await Promise.all([
        listUserPhotos(uid, { includeDeleted: false }),
        listUserPhotos(uid, { includeDeleted: true }),
      ]);
      setActiveUploads(a.filter((p) => p.status !== 'deleted'));
      setDeletedUploads(d.filter((p) => p.status === 'deleted'));
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load uploads.', variant: 'destructive' });
      setActiveUploads([]);
      setDeletedUploads([]);
    } finally {
      setManageLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const setCover = (photoId: string) => {
    onChange({ selected, coverPhotoId: photoId });
  };

  const move = (fromIdx: number, toIdx: number) => {
    const next = [...selected];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    onChange({
      selected: next.map((p, i) => ({ ...p, sortOrder: i })),
      coverPhotoId,
    });
  };

  const removeSelected = (photoId: string) => {
    const next = selected.filter((s) => s.photoId !== photoId).map((x, i) => ({ ...x, sortOrder: i }));
    const nextCover = coverPhotoId && next.some((x) => x.photoId === coverPhotoId) ? coverPhotoId : next[0]?.photoId;
    onChange({ selected: next, coverPhotoId: nextCover });
  };

  const setCrop = (photoId: string, crop: { focalPoint?: FocalPoint; cropZoom?: number }) => {
    const next = selected.map((s) =>
      s.photoId === photoId ? { ...s, focalPoint: crop.focalPoint, cropZoom: crop.cropZoom } : s
    );
    onChange({ selected: next, coverPhotoId });
  };

  const toggleSelect = (p: UserPhotoDoc) => {
    if (selectedIds.has(p.photoId)) {
      removeSelected(p.photoId);
      return;
    }
    if (selected.length >= max) {
      toast({ title: 'Limit reached', description: `You can select up to ${max} photos.`, variant: 'destructive' });
      return;
    }
    const next = [
      ...selected,
      { photoId: p.photoId, url: p.downloadUrl, width: p.width, height: p.height, sortOrder: selected.length },
    ];
    onChange({ selected: next, coverPhotoId: coverPhotoId || p.photoId });
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setUploadPct(0);
    try {
      // IMPORTANT: `selected` is a prop and won't update inside this async loop.
      // Maintain a working copy so multi-file uploads append correctly.
      let workingSelected = [...selected];
      let workingCover = coverPhotoId;

      for (const f of files) {
        const res = await uploadUserPhoto(f, (pct) => setUploadPct(pct));
        // Auto-select newly uploaded photos until max is reached.
        if (workingSelected.length < max) {
          const added: ListingPhotoSnapshot = {
            photoId: res.photoId,
            url: res.downloadUrl,
            width: res.width,
            height: res.height,
            sortOrder: workingSelected.length,
          };
          workingSelected = [...workingSelected, added].map((x, i) => ({ ...x, sortOrder: i }));
          workingCover = workingCover || res.photoId;
          onChange({ selected: workingSelected, coverPhotoId: workingCover });

          // Smooth onboarding: if this becomes the cover, prompt the user to set the crop focal point once.
          if (workingCover === res.photoId) {
            const crop = await requestCrop({ photoId: res.photoId, url: res.downloadUrl });
            if (crop) {
              workingSelected = workingSelected.map((x) =>
                x.photoId === res.photoId ? { ...x, focalPoint: crop.focalPoint, cropZoom: crop.zoom } : x
              );
              onChange({ selected: workingSelected, coverPhotoId: workingCover });
            }
          }
        }
      }
      await refresh();
      toast({ title: 'Uploaded', description: 'Photos uploaded to your library.' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message || 'Failed to upload.', variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const startDeviceUpload = () => {
    inputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      {/* Shared hidden upload input so we can open the OS file picker without opening a modal first */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={uploading}
        aria-label="Upload photos"
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          await handleUploadFiles(files);
          e.target.value = '';
        }}
      />

      {/* Selected (single primary surface) */}
      <Card className="border-2 border-border/50 bg-card">
        <CardContent className="p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-sm font-extrabold">Selected photos</div>
                <Badge variant="secondary" className="font-semibold">
                  Required • {selected.length}/{max}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Your first photo is the cover. Drag to reorder on desktop • arrows on mobile.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-[40px] font-semibold"
                onClick={() => {
                  setManageOpen(true);
                  void refreshManage();
                }}
                disabled={uploading}
              >
                Manage uploads
              </Button>
            </div>
          </div>

          {uploading ? (
            <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              </div>
              <div className="flex-1 w-full space-y-2 min-w-0">
                <div className="font-semibold text-foreground">Uploading…</div>
                <p className="text-sm text-muted-foreground">Preparing and uploading your photo. This usually takes a few seconds.</p>
                <Progress value={uploadPct} className="h-2" />
                {uploadPct > 0 ? (
                  <div className="text-xs text-muted-foreground">{Math.round(uploadPct)}%</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {selected.length ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {selected.map((p, idx) => (
                  <SelectedTile
                    key={p.photoId}
                    p={p}
                    idx={idx}
                    total={selected.length}
                    isCover={coverPhotoId === p.photoId || (!coverPhotoId && idx === 0)}
                    onSetCover={() => setCover(p.photoId)}
                    onMoveLeft={() => idx > 0 && move(idx, idx - 1)}
                    onMoveRight={() => idx < selected.length - 1 && move(idx, idx + 1)}
                    onDragMove={(from, to) => move(from, to)}
                    onRemove={() => removeSelected(p.photoId)}
                    onEditCrop={async () => {
                      const crop = await requestCrop({ photoId: p.photoId, url: p.url });
                      if (crop) setCrop(p.photoId, { focalPoint: crop.focalPoint, cropZoom: crop.zoom });
                    }}
                  />
                ))}
              </div>

              <div className="flex justify-center">
                <Button
                  type="button"
                  className="min-h-[44px] font-semibold"
                  onClick={startDeviceUpload}
                  disabled={uploading}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Add photos
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-5 text-center space-y-2">
              <div className="font-semibold">Add at least 1 photo</div>
              <div className="text-sm text-muted-foreground">
                Listings with 4–8 photos get more buyer interest.
              </div>
              <Button
                type="button"
                className="min-h-[44px] font-semibold"
                onClick={startDeviceUpload}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                Add photos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manage uploads modal (no route change; keeps listing flow intact) */}
      <Dialog
        open={manageOpen}
        onOpenChange={(open) => {
          setManageOpen(open);
          if (open) void refreshManage();
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Manage uploads</DialogTitle>
            <DialogDescription>
              Upload, reuse, and manage your photo library. Use the tabs to switch between active uploads and trash.
            </DialogDescription>
          </DialogHeader>

          {/* Defensive: only render tabs while dialog is open to avoid Radix context edge cases during route transitions/prefetch. */}
          {manageOpen ? (
            <Tabs value={manageTab} onValueChange={(v) => setManageTab(v as any)}>
              <TabsList className="grid grid-cols-2 w-full sm:w-auto">
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="deleted">Trash</TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="mt-4">
                <ManageUploadsGrid
                  uid={uid}
                  loading={manageLoading}
                  photos={activeUploads}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onDelete={async (photoId) => {
                    await softDeleteUserPhoto(uid, photoId);
                    await refreshManage();
                    await refresh(); // keep picker library in sync too
                  }}
                />
              </TabsContent>

              <TabsContent value="deleted" className="mt-4">
                <ManageUploadsGrid
                  uid={uid}
                  loading={manageLoading}
                  photos={deletedUploads}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onRestore={async (photoId) => {
                    await restoreUserPhoto(uid, photoId);
                    await refreshManage();
                    await refresh();
                  }}
                />
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Crop dialog (focal point for listing cards) */}
      {cropTarget ? (
        <PhotoCropDialog
          open={cropOpen}
          onOpenChange={(open) => {
            setCropOpen(open);
            if (!open) {
              const resolve = cropResolveRef.current;
              cropResolveRef.current = null;
              setCropTarget(null);
              // Resolve as "cancel" if closed without saving.
              resolve?.(null);
            }
          }}
          imageSrc={cropTarget.url}
          aspect={4 / 3}
          onSave={(res) => {
            const resolve = cropResolveRef.current;
            cropResolveRef.current = null;
            setCropTarget(null);
            setCropOpen(false);
            resolve?.(res);
          }}
        />
      ) : null}
    </div>
  );
}

function ManageUploadsGrid(props: {
  uid: string;
  loading: boolean;
  photos: UserPhotoDoc[];
  selectedIds: Set<string>;
  onToggleSelect: (p: UserPhotoDoc) => void;
  onDelete?: (photoId: string) => Promise<void>;
  onRestore?: (photoId: string) => Promise<void>;
}) {
  const { toast } = useToast();

  if (props.loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg border bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!props.photos.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center space-y-2">
          <div className="text-sm font-semibold">No uploads here yet.</div>
          <div className="text-sm text-muted-foreground">
            Upload photos once, then reuse them across listings.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {props.photos.map((p) => {
        const isSelected = props.selectedIds.has(p.photoId);
        return (
          <div key={p.photoId} className="group relative aspect-square rounded-lg overflow-hidden border bg-muted/30">
            <button
              type="button"
              className={cn(
                'absolute inset-0 z-10',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                isSelected ? 'ring-2 ring-primary' : ''
              )}
              onClick={() => props.onToggleSelect(p)}
              aria-label={isSelected ? 'Unselect photo' : 'Select photo'}
            />
            <Image
              src={p.downloadUrl}
              alt="Upload"
              fill
              className={cn('object-cover', isSelected && 'opacity-90')}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              unoptimized
            />

            <div
              className={cn(
                'absolute inset-x-0 bottom-0 z-20 p-2 flex items-center justify-end gap-2',
                'bg-gradient-to-t from-black/60 via-black/20 to-transparent',
                'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity'
              )}
            >
              {props.onRestore ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-[40px] font-semibold"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      await props.onRestore?.(p.photoId);
                      toast({ title: 'Restored', description: 'Photo restored.' });
                    } catch (err: any) {
                      toast({ title: 'Error', description: err?.message || 'Failed to restore.', variant: 'destructive' });
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restore
                </Button>
              ) : null}

              {props.onDelete ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="min-h-[40px] font-semibold"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      await props.onDelete?.(p.photoId);
                      toast({ title: 'Moved to trash', description: 'Photo removed from active uploads.' });
                    } catch (err: any) {
                      toast({ title: 'Error', description: err?.message || 'Failed to delete.', variant: 'destructive' });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              ) : null}
            </div>

            {isSelected ? (
              <div className="absolute top-2 left-2 z-20">
                <Badge variant="secondary" className="font-semibold">
                  Selected
                </Badge>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SelectedTile(props: {
  p: ListingPhotoSnapshot;
  idx: number;
  total: number;
  isCover: boolean;
  onSetCover: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDragMove: (from: number, to: number) => void;
  onRemove: () => void;
  onEditCrop: () => void;
}) {
  const { p, idx, total } = props;
  const objectPosition =
    p.focalPoint && Number.isFinite(p.focalPoint.x) && Number.isFinite(p.focalPoint.y)
      ? `${Math.round(p.focalPoint.x * 100)}% ${Math.round(p.focalPoint.y * 100)}%`
      : '50% 50%';
  const cropZoom = Number.isFinite(p.cropZoom as any) ? Math.max(1, Math.min(3, Number(p.cropZoom))) : 1;
  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden border bg-muted/20',
        'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2'
      )}
      // Mobile QA: HTML5 drag isn't reliable on touch. We still keep `draggable` for desktop,
      // but provide explicit arrow buttons (min 40px) for mobile reordering.
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(idx));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/plain'));
        if (!Number.isFinite(from)) return;
        if (from === idx) return;
        props.onDragMove(from, idx);
      }}
    >
      <div className="relative aspect-square">
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              transform: cropZoom !== 1 ? `scale(${cropZoom})` : undefined,
              transformOrigin: objectPosition,
            }}
          >
            <Image
              src={p.url}
              alt="Selected"
              fill
              className="object-cover"
              style={{ objectPosition }}
              unoptimized
            />
          </div>
        </div>
      </div>

      {/* Controls BELOW the thumbnail (no overlays; easier to read + tap on small tiles) */}
      <div className="border-t border-border/40 bg-card/80 backdrop-blur p-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="secondary" className="font-semibold">
              {idx + 1}/{total}
            </Badge>
            {props.isCover ? (
              <Badge className="bg-primary text-primary-foreground">
                <Star className="h-3.5 w-3.5 mr-1" />
                Cover
              </Badge>
            ) : null}
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="min-h-[40px] min-w-[40px]"
            onClick={props.onRemove}
            aria-label="Remove photo"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="min-h-[40px] min-w-[40px]"
              onClick={props.onMoveLeft}
              disabled={idx === 0}
              aria-label="Move photo left"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="min-h-[40px] min-w-[40px]"
              onClick={props.onMoveRight}
              disabled={idx === total - 1}
              aria-label="Move photo right"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-[40px] font-semibold"
              onClick={props.onEditCrop}
              title="Adjust how this photo is cropped on listing cards"
            >
              <Crop className="h-4 w-4 mr-2" />
              Crop
            </Button>
            <Button
              type="button"
              size="sm"
              variant={props.isCover ? 'secondary' : 'outline'}
              className="min-h-[40px] font-semibold"
              onClick={props.onSetCover}
              disabled={props.isCover}
            >
              {props.isCover ? 'Cover' : 'Set cover'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

