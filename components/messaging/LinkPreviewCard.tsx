import { ExternalLink } from 'lucide-react';
import { SafeImage } from '@/components/shared/SafeImage';
import { cn } from '@/lib/utils';

export type LinkPreview = {
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

export function LinkPreviewCard(props: { preview: LinkPreview; className?: string }) {
  const { preview, className } = props;
  const href = preview.finalUrl || preview.url;
  const host = (() => {
    try {
      return new URL(href).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  const title = preview.title || host || href;
  const desc = preview.description || '';
  const img = preview.image || '';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'mt-2 block overflow-hidden rounded-lg border bg-background/60 hover:bg-background/80 transition-colors',
        className
      )}
    >
      <div className={cn('grid', img ? 'grid-cols-[96px_1fr]' : 'grid-cols-1')}>
        {img ? (
          <div className="relative h-[96px] w-[96px] bg-muted">
            <Image
              src={img}
              alt={title}
              fill
              className="object-cover"
              sizes="96px"
              unoptimized={img.startsWith('http')}
            />
          </div>
        ) : null}
        <div className="p-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{title}</div>
              {desc ? <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{desc}</div> : null}
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          </div>
          <div className="text-[11px] text-muted-foreground mt-2 truncate">{preview.siteName || host || href}</div>
        </div>
      </div>
    </a>
  );
}

