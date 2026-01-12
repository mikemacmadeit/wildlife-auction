# Images Directory

Add your listing images, product photos, banners, and other images here.

## Usage Examples

### In Next.js Components (Recommended)

```tsx
import Image from 'next/image';

<Image
  src="/images/your-image.jpg"
  alt="Description"
  width={500}
  height={300}
  className="rounded-lg"
/>
```

### Direct Image Tag

```tsx
<img 
  src="/images/your-image.jpg" 
  alt="Description"
  className="rounded-lg"
/>
```

### Background Image in CSS

```css
background-image: url('/images/hero-background.jpg');
```

## Recommended Organization

- `listings/` - Individual listing images
- `banners/` - Hero images, promotional banners
- `placeholders/` - Default/fallback images

## File Formats

- **JPG** - For photos (smaller file size)
- **PNG** - For images with transparency
- **WebP** - Recommended for modern browsers (best compression)
- **SVG** - For simple graphics and icons

## Optimization Tips

- Compress images before uploading (use tools like TinyPNG, ImageOptim)
- Use appropriate dimensions (don't upload 4000px images if displaying at 800px)
- Consider responsive image sizes for different screen sizes