'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Star, GripVertical, ArrowLeft, ArrowRight, X, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { listUserPhotos, restoreUserPhoto, softDeleteUserPhoto, uploadUserPhoto, type UserPhotoDoc } from '@/lib/firebase/photos';
import { useToast } from '@/hooks/use-toast';

export type ListingPhotoSnapshot = {
  photoId: string;
  url: string;
  width?: number;
  height?: number;
  sortOrder?: number;
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

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.photoId)), [selected]);

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
      for (const f of files) {
        const res = await uploadUserPhoto(f, (pct) => setUploadPct(pct));
        // Auto-select newly uploaded photos until max is reached.
        if (selected.length < max) {
          const next = [
            ...selected,
            { photoId: res.photoId, url: res.downloadUrl, width: res.width, height: res.height, sortOrder: selected.length },
          ];
          onChange({ selected: next.map((x, i) => ({ ...x, sortOrder: i })), coverPhotoId: coverPhotoId || res.photoId });
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
              >
                Manage uploads
              </Button>
            </div>
          </div>

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
                  />
                ))}
              </div>

              <div className="flex justify-center">
                <Button
                  type="button"
                  className="min-h-[44px] font-semibold"
                  onClick={startDeviceUpload}
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
              <Button type="button" className="min-h-[44px] font-semibold" onClick={startDeviceUpload}>
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
          </DialogHeader>

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
        </DialogContent>
      </Dialog>
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
}) {
  const { p, idx, total } = props;
  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden border bg-muted/20',
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
        <Image src={p.url} alt="Selected" fill className="object-cover" unoptimized />
      </div>

      {/* Top-left: position + cover state (high-contrast, doesn't bleed on light mode) */}
      <div className="absolute top-2 left-2 flex items-center gap-2">
        <div className="rounded-md bg-background/85 backdrop-blur border border-border/60 text-foreground px-2 py-1 text-xs font-semibold flex items-center gap-1 shadow-sm">
          <GripVertical className="h-3.5 w-3.5" />
          {idx + 1}/{total}
        </div>
        {props.isCover && (
          <Badge className="bg-primary text-primary-foreground shadow-sm">
            <Star className="h-3.5 w-3.5 mr-1" />
            Cover
          </Badge>
        )}
      </div>

      {/* Top-right: remove */}
      <div className="absolute top-2 right-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className={cn(
            'min-h-[36px] min-w-[36px]',
            'bg-background/85 backdrop-blur border-border/60 shadow-sm',
            'hover:bg-background'
          )}
          onClick={props.onRemove}
          aria-label="Remove photo"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Bottom controls: kept inside tile with blurred surface + responsive label */}
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-md bg-background/85 backdrop-blur border border-border/60 p-1 shadow-sm">
          <Button
            type="button"
            size="icon"
            variant="ghost"
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
            variant="ghost"
            className="min-h-[40px] min-w-[40px]"
            onClick={props.onMoveRight}
            disabled={idx === total - 1}
            aria-label="Move photo right"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <Button
          type="button"
          size="sm"
          variant={props.isCover ? 'secondary' : 'outline'}
          className={cn(
            'min-h-[40px] font-semibold shadow-sm',
            'bg-background/85 backdrop-blur border-border/60 hover:bg-background'
          )}
          onClick={props.onSetCover}
          disabled={props.isCover}
        >
          <Star className={cn('h-4 w-4', 'sm:mr-2')} />
          <span className="hidden sm:inline">{props.isCover ? 'Cover' : 'Set cover'}</span>
        </Button>
      </div>
    </div>
  );
}

