'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Trash2, RotateCcw, Loader2, ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { listUserPhotos, restoreUserPhoto, softDeleteUserPhoto, uploadUserPhoto, type UserPhotoDoc } from '@/lib/firebase/photos';
import { cn } from '@/lib/utils';

export default function UploadsLibraryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [tab, setTab] = useState<'active' | 'deleted'>('active');
  const [active, setActive] = useState<UserPhotoDoc[]>([]);
  const [deleted, setDeleted] = useState<UserPhotoDoc[]>([]);

  const refresh = async (uid: string) => {
    setLoading(true);
    try {
      const [a, d] = await Promise.all([
        listUserPhotos(uid, { includeDeleted: false }),
        listUserPhotos(uid, { includeDeleted: true }),
      ]);
      setActive(a.filter((p) => p.status !== 'deleted'));
      setDeleted(d.filter((p) => p.status === 'deleted'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    void refresh(user.uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const items = useMemo(() => (tab === 'active' ? active : deleted), [tab, active, deleted]);

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Uploads</CardTitle>
            <CardDescription>Sign in to manage your photo library.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold">Uploads</h1>
          <p className="text-muted-foreground">
            Your reusable photo library. Upload once, reuse across listings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="upload-photo-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length) return;
              setUploading(true);
              setUploadPct(0);
              try {
                for (const f of files) {
                  await uploadUserPhoto(f, (pct) => setUploadPct(pct));
                }
                toast({ title: 'Uploaded', description: 'Your uploads are ready to use in listings.' });
                await refresh(user.uid);
              } catch (err: any) {
                toast({
                  title: 'Upload failed',
                  description: err?.message || 'Failed to upload photo.',
                  variant: 'destructive',
                });
              } finally {
                setUploading(false);
                setUploadPct(0);
                e.target.value = '';
              }
            }}
          />

          <Button
            type="button"
            className="min-h-[44px] font-semibold"
            disabled={uploading}
            onClick={() => (document.getElementById('upload-photo-input') as HTMLInputElement | null)?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading {Math.round(uploadPct)}%
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload photos
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2 w-full sm:w-auto">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="deleted">Trash</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-6">
          <UploadsGrid
            loading={loading}
            photos={items}
            emptyLabel="No uploads yet."
            onDelete={async (photoId) => {
              await softDeleteUserPhoto(user.uid, photoId);
              await refresh(user.uid);
            }}
          />
        </TabsContent>

        <TabsContent value="deleted" className="mt-6">
          <UploadsGrid
            loading={loading}
            photos={items}
            emptyLabel="Trash is empty."
            onRestore={async (photoId) => {
              await restoreUserPhoto(user.uid, photoId);
              await refresh(user.uid);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UploadsGrid(props: {
  loading: boolean;
  photos: UserPhotoDoc[];
  emptyLabel: string;
  onDelete?: (photoId: string) => Promise<void>;
  onRestore?: (photoId: string) => Promise<void>;
}) {
  const { toast } = useToast();

  if (props.loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-lg border bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!props.photos.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ImageIcon className="h-6 w-6 text-primary" />
          </div>
          <div className="font-semibold">{props.emptyLabel}</div>
          <div className="text-sm text-muted-foreground">
            Upload photos once, then select them during listing creation.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {props.photos.map((p) => (
        <div key={p.photoId} className="group relative aspect-square rounded-lg overflow-hidden border bg-muted/30">
          <Image
            src={p.downloadUrl}
            alt="Upload"
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized
          />

          <div
            className={cn(
              'absolute inset-x-0 bottom-0 p-2 flex items-center justify-end gap-2',
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
                onClick={async () => {
                  try {
                    await props.onRestore?.(p.photoId);
                    toast({ title: 'Restored', description: 'Photo restored.' });
                  } catch (e: any) {
                    toast({ title: 'Error', description: e?.message || 'Failed to restore.', variant: 'destructive' });
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
                onClick={async () => {
                  try {
                    await props.onDelete?.(p.photoId);
                    toast({ title: 'Moved to trash', description: 'Photo removed from active uploads.' });
                  } catch (e: any) {
                    toast({ title: 'Error', description: e?.message || 'Failed to delete.', variant: 'destructive' });
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

