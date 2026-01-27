# Public Assets Directory

This folder contains static assets that are served directly by Next.js.

## Directory Structure

- `/images/` - Product photos, listing images, banners, and other images
- `/logos/` - Brand logos, icons, and brand assets

## Usage

### In Next.js Components

Use the `next/image` component for optimized images:

```tsx
import Image from 'next/image';

<Image
  src="/images/your-image.jpg"
  alt="Description"
  width={500}
  height={300}
/>
```

### Direct References

For logos or simple image tags:

```tsx
<img src="/logos/logo.png" alt="Agchange Logo" />
```

### Background Images in CSS

```css
background-image: url('/images/hero-background.jpg');
```

## Best Practices

1. **Optimize images** before adding them (compress, resize appropriately)
2. **Use descriptive filenames** (e.g., `wildlife-exchange-logo.png` instead of `logo1.png`)
3. **Organize by category** if needed (e.g., `/images/listings/`, `/images/banners/`)
4. **Use appropriate formats**:
   - PNG for logos with transparency
   - JPG for photos
   - SVG for scalable icons/logos
   - WebP for modern browsers (recommended)

## File Size Guidelines

- Logos: Typically under 100KB
- Product images: Under 500KB per image
- Hero/banner images: Under 1MB (consider lazy loading)

## Example Structure

```
public/
  ├── images/
  │   ├── listings/
  │   │   ├── listing-1-hero.jpg
  │   │   └── listing-2-hero.jpg
  │   ├── banners/
  │   │   └── featured-banner.jpg
  │   └── placeholders/
  │       └── default-listing.jpg
  └── logos/
      ├── logo.png
      ├── logo-dark.png
      ├── logo-icon.svg
      └── favicon.ico
```