## Firebase Storage CORS setup (Required for uploads from `https://wildlife.exchange`)

**Internal ops doc — not marketing — not legal advice.**

If you see browser console errors like:
- `blocked by CORS policy: Response to preflight request doesn't pass access control check`
- `POST https://firebasestorage.googleapis.com/v0/b/<bucket>/o?... net::ERR_FAILED`

…then **Firebase Storage bucket CORS is not configured** (or was reset) for your site origin. This cannot be fixed in app code alone.

### What uploads are affected in this repo
- **Breeder permits**: `seller-permits/{sellerId}/...` via `lib/firebase/storage-documents.ts#uploadSellerPermitDocument`
- **User photos library**: `users/{uid}/uploads/...` via `lib/firebase/photos.ts#uploadUserPhoto`
- **Profile avatar**: `users/{uid}/profile/avatar.jpg` via `lib/firebase/profile-media.ts#uploadUserAvatar`
- **Listing images**: `listings/{listingId}/images/...` via `lib/firebase/storage.ts#uploadListingImage`

All of these use the Firebase Storage Web SDK, which requires bucket-level CORS to allow browser preflight from your domain.

### Target bucket
For this repo/project, the bucket is:
- **`wildlife-exchange.firebasestorage.app`**

Note: some older Firebase projects use `${projectId}.appspot.com`, but this project uses the newer `${projectId}.firebasestorage.app` bucket.

### Option A (recommended): set CORS via `gcloud` / `gsutil`
Prereqs:
- Install Google Cloud SDK (includes `gcloud` + `gsutil`)
- Authenticate: `gcloud auth login`
- Select project (optional): `gcloud config set project <YOUR_PROJECT_ID>`

From repo root:

```bash
gsutil cors set scripts/storage-cors.json gs://wildlife-exchange.firebasestorage.app
gsutil cors get gs://wildlife-exchange.firebasestorage.app
```

### Option B: set CORS in Google Cloud Console
1. Go to Google Cloud Console → Cloud Storage → Buckets
2. Open bucket: `wildlife-exchange.firebasestorage.app`
3. Find CORS configuration and apply the JSON from `scripts/storage-cors.json`

### After applying
1. Hard refresh the site (or open a new incognito window)
2. Retry uploading:
   - `/seller/overview` breeder permit upload
   - `/dashboard/account` avatar upload
   - listing photo uploads

If it still fails, confirm:
- You edited the **correct bucket**
- Your CORS `origin` includes `https://wildlife.exchange` (and `https://www.wildlife.exchange` if used)
- Your site isn’t using a different production domain than expected

