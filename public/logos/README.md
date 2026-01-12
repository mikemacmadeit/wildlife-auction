# Logos Directory

Add your brand logos, icons, and brand assets here.

## Recommended Files

- `logo.png` - Main logo (light background)
- `logo-dark.png` - Logo for dark backgrounds
- `logo-icon.svg` - Icon-only version (favicon, app icons)
- `favicon.ico` - Browser favicon (16x16, 32x32, 48x48)
- `apple-touch-icon.png` - Apple touch icon (180x180)

## Usage in Components

### Navbar Logo Example

```tsx
import Image from 'next/image';
import Link from 'next/link';

<Link href="/" className="flex items-center gap-2">
  <Image
    src="/logos/logo.png"
    alt="Wildlife Exchange Logo"
    width={120}
    height={40}
    priority
    className="h-8 w-auto"
  />
  <span className="text-xl font-bold">Wildlife Exchange</span>
</Link>
```

### Icon-Only Logo

```tsx
<Image
  src="/logos/logo-icon.svg"
  alt="Wildlife Exchange"
  width={32}
  height={32}
/>
```

### Favicon Setup

In `app/layout.tsx`, uncomment the icons metadata:

```tsx
export const metadata: Metadata = {
  icons: {
    icon: '/logos/favicon.ico',
    apple: '/logos/apple-touch-icon.png',
  },
};
```

## File Specifications

- **Logo**: PNG with transparency, 300-600px width recommended
- **Favicon**: ICO format, multiple sizes (16x16, 32x32, 48x48)
- **Apple Touch Icon**: PNG, 180x180px
- **SVG**: Vector format, scalable, small file size

## Current Files

You currently have:
- `stag-head-silhouette-000000-lg.png` - Consider renaming to `logo.png` or `logo-icon.png` for easier reference