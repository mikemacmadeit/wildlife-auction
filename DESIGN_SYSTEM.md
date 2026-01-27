# Wildlife Exchange Design System

Short reference for typography, spacing, badges, buttons, and shadows. Use these consistently across the app.

## Typography scale

| Class | Use | Size |
|-------|-----|------|
| `.we-h1` | Page title | `text-3xl md:text-4xl` font-bold |
| `.we-h2` | Section | `text-2xl md:text-3xl` font-semibold |
| `.we-h3` | Subsection | `text-xl md:text-2xl` font-semibold |
| `.we-h4` | Card title | `text-lg md:text-xl` font-semibold |

All use `font-founders` and `text-foreground`. Prefer these over ad hoc `text-2xl`, `text-3xl`, etc.

## Spacing scale

| Context | Gap | Space-y | Padding |
|---------|-----|---------|---------|
| **Tight** | `we-gap-tight` (gap-2) | `we-space-y-tight` (space-y-2) | `we-p-tight` (p-4) |
| **Default** | `we-gap-default` (gap-4) | `we-space-y-default` (space-y-4) | `we-p-default` (p-6) |
| **Loose** | `we-gap-loose` (gap-6) | `we-space-y-loose` (space-y-6) | `we-p-loose` (p-8) |

Use for cards, auth forms, browse grid, and listing sections. Avoid random `p-4`/`p-8`/`space-y-3`.

## Badge variants

| Variant | Use |
|---------|-----|
| `default` | Primary (sage) |
| `secondary` | Muted/chip |
| `destructive` | Errors, SOLD |
| `outline` | Neutral outline |
| `success` | Verified, Protected, positive status |
| `warning` | Reserved, pending, caution |
| `info` | Informational |

Use `<Badge variant="success">` etc. instead of `bg-green-600`, `bg-amber-500/20`, etc.

## Button usage

| Variant | Use |
|---------|-----|
| `default` | Primary CTA (Buy now, Place bid, Sign in) |
| `outline` | Secondary actions |
| `destructive` | Delete, remove |
| `ghost` | Tertiary, low emphasis |
| `link` | Inline links |

Primary CTAs use `default`; avoid mixing.

## Shadows

| Class | Use |
|-------|-----|
| `shadow-warm` | Cards, default elevated surface |
| `shadow-lifted` | Card hover, dialogs |
| `shadow-premium` | Premium emphasis, modals |

Cards: default `shadow-warm`, hover `shadow-lifted`. Dialogs: `shadow-2xl` or `shadow-premium`.

## Color tokens

Use CSS variables from `app/globals.css` (`:root` / `.dark`):

- `primary`, `primary-foreground` — brand/CTAs
- `destructive`, `destructive-foreground` — errors/danger
- `muted`, `muted-foreground` — metadata, secondary text
- `card`, `card-foreground`, `border`, `ring`

Avoid raw `red-500`, `green-600`, etc. except in badge variants that map to semantic use.

## Do / Don't

- **Do** use `.we-h1`–`.we-h4` for headings.
- **Do** use `we-gap-*`, `we-space-y-*`, `we-p-*` for layout spacing.
- **Do** use `Badge` with `variant="success"` / `warning` / `info` for status.
- **Do** use `Button` `default` for primary CTAs, `outline` for secondary.
- **Do** use `shadow-warm` / `shadow-lifted` on cards.

- **Don't** use arbitrary `text-2xl`, `text-3xl` without design-system alignment.
- **Don't** use `bg-green-600`, `bg-amber-500/20` directly for status badges.
- **Don't** use `shadow-md` or ad hoc shadows instead of `shadow-warm` / `shadow-lifted`.

## Touch targets and accessibility

- Interactive elements (buttons, icon-only buttons, links used as CTAs) must meet **≥44px** minimum touch target (e.g. `min-h-[44px] min-w-[44px]`).
- Use `Button` `size="icon"` for icon-only actions; it uses a 44×44px hit area.
- Ensure `aria-label` on icon-only buttons; use `focus-visible:ring-2` for focus visibility.

## Brand voice

- **Friendly, clear, professional.** Use plain language; avoid jargon.
- Error and empty-state copy should be helpful, not technical (e.g. “Please check your email” rather than “Invalid email”).
- CTAs: action-oriented (“Place bid”, “Buy now”, “Browse listings”).

See `app/globals.css` (typography, spacing, shadows) and `tailwind.config.ts` (colors).
