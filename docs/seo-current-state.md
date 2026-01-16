# Wildlife.Exchange SEO — Current State (Evidence-Based)

## Executive summary (founder-friendly)
Right now, **your content SEO (Field Notes) is in decent shape**, but **your marketplace SEO (listings + browse) is not indexable in a way that can win organic search**, because the key marketplace pages are **client-rendered and fetch core content in `useEffect`** (Google *can* execute JS, but it’s slower/less reliable and you lose most SEO upside).

The single biggest unlock is: **move listing detail + browse/category pages to server-rendered, crawlable HTML with unique metadata + schema, and put them in the sitemap**.

---

## Step 0 — Repo-level SEO architecture map (with file paths)

### Routing system
- **Next.js App Router**: `project/app/**` (e.g., `project/app/layout.tsx`, `project/app/listing/[id]/page.tsx`)

### Global metadata handling
- **Implemented**: global defaults + `metadataBase`
  - `project/app/layout.tsx` sets:
    - `metadataBase: new URL(getSiteUrl())`
    - global `title`, `description`, `openGraph`, `twitter`

### Page-level metadata handling
- **Implemented for some pages** via `export const metadata`
  - Example: `project/app/field-notes/page.tsx`
  - Example: `project/app/contact/page.tsx`
- **Implemented for dynamic Field Notes posts** via `generateMetadata`
  - `project/app/field-notes/[slug]/page.tsx`
- **Missing for key marketing pages** (homepage, browse, how-it-works)
  - `project/app/page.tsx` has no `metadata` export (uses global defaults only)
  - `project/app/browse/page.tsx` has no `metadata` export
  - `project/app/how-it-works/page.tsx` has no `metadata` export

### Open Graph / Twitter
- **Partially implemented**
  - Global OG/Twitter set in `project/app/layout.tsx`, but **no `images` configured** (commented out)
  - Field Notes posts set `openGraph.images` from `coverImage` in `project/app/field-notes/[slug]/page.tsx`

### Canonical URL handling
- **Implemented for Field Notes + tag/author hubs**:
  - `project/app/field-notes/[slug]/page.tsx` (`alternates.canonical`)
  - `project/app/field-notes/tags/page.tsx`
  - `project/app/field-notes/tags/[tag]/page.tsx`
  - `project/app/field-notes/authors/page.tsx`
  - `project/app/field-notes/authors/[slug]/page.tsx`
- **Partially implemented for marketing**:
  - `/how-it-works/plans` and `/how-it-works/trust` set canonicals:
    - `project/app/how-it-works/plans/page.tsx`
    - `project/app/how-it-works/trust/page.tsx`
- **Not implemented for marketplace pages**:
  - No canonicals for `/browse` (query params) or `/listing/[id]`

### robots.txt generation
- **Implemented**: `project/app/robots.ts` allows all and points to sitemap

### sitemap.xml generation
- **Implemented**: `project/app/sitemap.ts`
- **Included URLs (current)**:
  - `/`, `/browse`, `/how-it-works`, `/how-it-works/plans`, `/how-it-works/trust`
  - Field Notes index + posts + tags + authors
  - `/contact`, `/terms`, `/privacy`
- **Not included (critical)**:
  - **Listing detail pages** (`/listing/[id]`) — not present in sitemap generator
  - **Category-specific browse pages** (you have routes like `/browse/wildlife-exotics`, etc., but they are not listed in sitemap)

### RSS feeds
- **Implemented**: `project/app/field-notes/rss.xml/route.ts`

### JSON-LD / structured data
- **Implemented for Field Notes posts**:
  - `BlogPosting` JSON-LD in `project/app/field-notes/[slug]/page.tsx`
- **Not implemented for marketplace**:
  - No `Product`, `Offer`, `Organization`, `BreadcrumbList`, or auction schemas found for listing pages.

### SSR vs static generation vs client-only rendering
- **Field Notes posts** are statically generated:
  - `generateStaticParams()` in `project/app/field-notes/[slug]/page.tsx`
- **Listing detail page is client-driven** (**P0 SEO issue**):
  - `project/app/listing/[id]/page.tsx` is `'use client'` and loads listing data in `useEffect` via Firestore subscription.
- **Browse is client-driven** (**P0 SEO issue**):
  - `project/app/browse/page.tsx` is `'use client'` and loads listings in `useEffect` via Firestore queries.

---

## Step 1 — Page types audit

### A) Marketing pages

#### Homepage (`/`)
- **Entry**: `project/app/page.tsx` (`'use client'`)
- **Metadata**: **NOT implemented per-page** (falls back to global defaults in `project/app/layout.tsx`)
- **Indexable**: Yes (HTML exists), but **title/description are generic site-level**
- **Canonical**: Not explicitly set
- **Structured data**: Not found
- **Risk**: homepage can rank, but you’re missing structured organization signals + rich social previews.

#### How It Works (`/how-it-works`)
- **Entry**: `project/app/how-it-works/page.tsx` (`'use client'`)
- **Metadata**: **NOT implemented per-page** (global defaults only)
- **Indexable**: Yes (static content), but lacks page-specific meta
- **Canonical**: Not set

#### Plans (`/how-it-works/plans`)
- **Entry**: `project/app/how-it-works/plans/page.tsx` (sets metadata, renders `project/app/pricing/page.tsx`)
- **Metadata**: **Implemented** (title/description + canonical)
- **Indexable**: Yes

#### Trust & Compliance (`/how-it-works/trust`)
- **Entry**: `project/app/how-it-works/trust/page.tsx` (sets metadata, renders `project/app/trust/page.tsx`)
- **Metadata**: **Implemented** (title/description + canonical)
- **Indexable**: Yes

> Note: `/trust` still exists as a separate route (`project/app/trust/page.tsx`) and **does not set canonical metadata**. This creates potential duplication unless you standardize one URL.

### B) Marketplace pages

#### Listing detail (`/listing/[id]`)
- **Entry**: `project/app/listing/[id]/page.tsx` is **`'use client'`**
- **How it renders content**: data is loaded in `useEffect` via `subscribeToListing(...)` (Firestore client)
- **Metadata**: **NOT implemented** (`generateMetadata` not present)
- **Canonical**: Not set
- **Indexable**: **High risk**
  - The HTML response can be thin until JS runs; crawlers may miss or delay indexing.
- **Structured data**: Not implemented (no Product/Offer schema)

#### Browse (`/browse`)
- **Entry**: `project/app/browse/page.tsx` is **`'use client'`**
- **How it renders content**: data is loaded in `useEffect` via Firestore queries
- **Metadata**: **NOT implemented**
- **Canonical**: Not set (query params can create duplicates)
- **Indexable**: **High risk**
  - It’s not a crawlable category/collection page in the SEO sense today.

#### Category browse pages (`/browse/wildlife-exotics`, etc.)
- **Exists** (Next build output confirms multiple `/browse/...` pages), but **not included in sitemap** (`project/app/sitemap.ts`)
- Need verification: those pages’ metadata/canonical patterns are not shown in this audit snapshot.

### C) Content (Field Notes)

#### Field Notes index (`/field-notes`)
- **Entry**: `project/app/field-notes/page.tsx`
- **Metadata**: **Implemented**
- **Indexable**: Yes (server component)
- **Canonical**: implied via `metadataBase`, but canonical isn’t explicitly set on the index page
- **RSS**: yes (`/field-notes/rss.xml`)

#### Field Notes posts (`/field-notes/[slug]`)
- **Entry**: `project/app/field-notes/[slug]/page.tsx`
- **Metadata**: **Implemented dynamically** via `generateMetadata`
- **Canonical**: **Implemented** (`alternates.canonical`)
- **Structured data**: **Implemented** (`BlogPosting` JSON-LD)

#### Tag pages (`/field-notes/tags`, `/field-notes/tags/[tag]`)
- **Entry**: `project/app/field-notes/tags/page.tsx`, `project/app/field-notes/tags/[tag]/page.tsx`
- **Metadata**: **Implemented**
- **Canonical**: **Implemented**

#### Author pages (`/field-notes/authors`, `/field-notes/authors/[slug]`)
- **Entry**: `project/app/field-notes/authors/page.tsx`, `project/app/field-notes/authors/[slug]/page.tsx`
- **Metadata**: **Implemented**
- **Canonical**: **Implemented**

---

## Step 2 — Technical SEO checks

### sitemap.xml
- **Where**: `project/app/sitemap.ts`
- **What’s included**: core marketing + Field Notes (posts/tags/authors)
- **What’s missing (P0)**:
  - **All listing detail pages** (`/listing/[id]`)
  - Category browse pages (`/browse/*`) are not explicitly listed

### robots.txt
- **Where**: `project/app/robots.ts`
- **Rules**: allows `/` with no disallows
- **Risk**:
  - You are not explicitly preventing indexing of `/dashboard`, `/seller`, etc. (some may redirect behind auth, but don’t rely on that).

### metadataBase
- **Where**: `project/app/layout.tsx` uses `getSiteUrl()`
- **Env resolution**: `project/lib/site-url.ts` (APP_URL / NEXT_PUBLIC_APP_URL / NETLIFY_URL / VERCEL_URL)
- **Status**: Good, and it prevents localhost OG URL warnings when envs are set.

### Crawlability / rendering
- **P0 issue**: marketplace pages are client-first + fetch in `useEffect`
  - `project/app/listing/[id]/page.tsx` (`subscribeToListing` in `useEffect`)
  - `project/app/browse/page.tsx` (queries in `useEffect`)
- Field Notes is crawlable (server-rendered / SSG)

### Duplicate content risks
- **Browse query params**: `/browse?category=...&sort=...` can create many URL variants; there is **no canonical strategy** today for these.
- **Duplicate trust/plan routes**:
  - `/trust` exists and `/how-it-works/trust` exists (canonical only on the latter).

---

## Step 3 — Structured data (JSON-LD)

### Implemented
- `BlogPosting` on Field Notes posts:
  - `project/app/field-notes/[slug]/page.tsx` embeds `<script type="application/ld+json">`

### Not implemented (high value)
- **Organization schema** on the homepage / global layout (brand entity)
- **Product + Offer schema** for listings (price, availability, category, seller)
- **Auction schema** (or at minimum Offer + availability states) for auction listings
- **BreadcrumbList** for browse → listing hierarchies

---

## Step 4 — Internal linking & IA (evidence-based)

### Main nav / footer
- Main nav links: `project/components/navigation/Navbar.tsx`
  - Home, Browse, How It Works (dropdown), Field Notes
- Footer links: `project/components/navigation/Footer.tsx`
  - Includes Browse, How It Works, Plans, Field Notes, Trust (nested)

### Issues / missed links
- **Contact page links to `/trust`**, not the canonical `/how-it-works/trust`:
  - `project/app/contact/page.tsx`
- Marketplace → Field Notes linking exists on homepage module, but Field Notes → Listings is not yet a defined strategy.

### Orphan/weakly linked pages
- Listing pages are not in sitemap and are only discoverable via client-rendered browsing; that’s weak for crawlers.

---

## Step 5 — SEO risks (P0 / P1 / P2)

### P0 (must fix before scaling)
1) **Listings are not crawlable / not in sitemap**
   - **Evidence**: listing page is client-only (`project/app/listing/[id]/page.tsx`) + sitemap excludes listings (`project/app/sitemap.ts`)
   - **Impact**: you cannot win long-tail “buy [species] in Texas” or “used [equipment] for sale” searches.
   - **Fix**: implement server-rendered listing pages with `generateMetadata`, canonical, Product/Offer schema, and include listing URLs in sitemap.

2) **Browse is client-rendered and not an SEO category system**
   - **Evidence**: `project/app/browse/page.tsx` is `'use client'` and loads listings in `useEffect`
   - **Impact**: category pages won’t rank; Google sees thin HTML.
   - **Fix**: implement server-rendered category pages (static + dynamic facets) with unique metadata and stable URLs.

3) **No canonical strategy for query-param browse URLs**
   - **Evidence**: no canonicals on browse
   - **Impact**: duplicate content / crawl waste.
   - **Fix**: decide canonical rules (e.g., canonical to clean category pages; noindex for deep filter combos; or parameter handling).

### P1 (should fix soon)
1) **Missing OG/Twitter images site-wide**
   - **Evidence**: `project/app/layout.tsx` has OG images commented out.
   - **Impact**: poor social sharing CTR and brand previews.
   - **Fix**: add a real OG image in `/public/images/` and configure metadata images globally.

2) **Marketing pages lack page-specific meta**
   - **Evidence**: `project/app/page.tsx`, `project/app/how-it-works/page.tsx`, `project/app/browse/page.tsx` have no `metadata` export.
   - **Impact**: weaker relevance signals for queries like “Texas exotic animal marketplace”.
   - **Fix**: add metadata per page.

3) **/trust vs /how-it-works/trust duplication**
   - **Evidence**: `project/app/trust/page.tsx` exists; canonical is on `project/app/how-it-works/trust/page.tsx`.
   - **Impact**: duplicate indexing / split signals.
   - **Fix**: choose one canonical route and redirect the other (301), or set canonical consistently.

### P2 (later optimizations)
1) **Add Organization/Website schema globally**
2) **Add Breadcrumb schema**
3) **RSS discoverability** (link tag in `<head>` for `/field-notes/rss.xml`)

---

## Step 6 — “How we win” roadmap (execution-ready)

### Phase 1 — Foundation (2–3 weeks)
- Ship global OG image + Twitter image in `project/app/layout.tsx`
- Add page-level `metadata` to:
  - `project/app/page.tsx`
  - `project/app/how-it-works/page.tsx`
  - `project/app/browse/page.tsx`
- Decide canonical + index rules for browse/filter URLs
- Standardize Trust/Plans canonical URLs (redirect or canonical fix)
- Add `/pricing` and category browse routes into sitemap if they are meant to be indexed

### Phase 2 — Authority & Scale (marketplace SEO)
- Convert **listing detail** to server-rendered:
  - `generateMetadata` with title/description per listing
  - `Product` + `Offer` schema (and auction logic)
  - Include all active listing URLs in sitemap
- Convert **category/browse pages** to server-rendered “collection pages”
  - `/browse/whitetail-breeder`, `/browse/wildlife-exotics`, etc.
  - Unique meta + internal links to top listings

### Phase 3 — Moat (programmatic SEO for high-ticket marketplace)
- Programmatic pages:
  - Species pages (Axis deer, Blackbuck, etc.)
  - Location pages (Texas cities/regions)
  - “Price guide” + “transport” guide pages
- Schema expansion:
  - Seller profile schema signals (where appropriate)
  - FAQ schema on trust/compliance pages

