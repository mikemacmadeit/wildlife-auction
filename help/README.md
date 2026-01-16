## Help / Tutorials system (edit guide)

This repo uses a lightweight native help system:

- **Help button**: global launcher (fixed top-right) that opens a **right-side slideover**.
- **Help panel**: contextual content based on the current route.
- **First-time banner**: “Want a 30-second tour?” (never auto-runs a tour).
- **Tours**: user-triggered steps that highlight elements via `data-tour="..."`.
- **Micro-help**: inline tooltips via `HelpTooltip`.

### Where to edit page help content
- **Help content registry**: `help/helpContent.ts`
  - Each page has: title, one-liner, checklist, common mistakes, quick actions.

### How pages map to help content
- **Route → help key mapping**: `lib/help/helpKeys.ts`
  - Add a new `HelpKey` and map it to a route/path prefix.

### How to add a tour (guided walkthrough)
- **Tours registry**: `help/tours.ts`
  - Add a tour definition under `TOURS[helpKey]`.
  - Each step uses a selector like: `[data-tour="your-anchor"]`
  - If a selector is missing at runtime, the system will **skip** steps (and close if none exist).

### How to add stable selectors in the UI
Add a `data-tour` attribute to the element you want to highlight:

```tsx
<Input data-tour="listing-title" ... />
```

### Micro-help tooltips (inline)
Use `HelpTooltip`:
- File: `components/help/HelpTooltip.tsx`

```tsx
<HelpTooltip text="Explain what this field means and what to choose." />
```

### Persistence (first-time banner)
- Prefers Firestore for signed-in users: `users/{uid}/helpFlags/{helpKey}`
- Falls back to localStorage if Firestore is unavailable/blocked
- Code: `lib/help/helpState.ts`

