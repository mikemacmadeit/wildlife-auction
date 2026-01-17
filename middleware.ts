// NOTE:
// We cannot use Next.js middleware in this repo because production builds can fail resolving
// internal `next/server` exports. We gate the UI in `app/layout.tsx` instead.
export {};

