# Firestore Reviews Index

The seller reviews API requires a composite index. If you see `FAILED_PRECONDITION` or "The query requires an index", use one of these options:

## Option 1: Create via Console (1 click)

Click this link and click **Create Index**:
https://console.firebase.google.com/v1/r/project/wildlife-exchange/firestore/indexes?create_composite=ClFwcm9qZWN0cy93aWxkbGlmZS1leGNoYW5nZS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvcmV2aWV3cy9pbmRleGVzL18QA

The index will build in 1–2 minutes.

## Option 2: Deploy via Firebase CLI

The index is defined in `firestore.indexes.json`. Deploy with:

```bash
firebase deploy --only firestore:indexes
```

## Fallback

The reviews API includes a fallback: if the composite index is not deployed, it queries by `sellerId` only and filters/sorts in memory. Reviews will still load, but the primary indexed query is preferred for performance.
