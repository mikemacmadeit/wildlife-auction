/**
 * Motion tokens - single source of truth for Framer Motion and JS-driven animations.
 * Values match CSS variables in app/globals.css for consistency.
 */
export const MOTION = {
  durationFast: 0.15,
  durationNormal: 0.25,
  durationSlow: 0.35,
  easeOut: [0.16, 1, 0.3, 1] as const,
  easeInOut: [0.65, 0, 0.35, 1] as const,
} as const;
