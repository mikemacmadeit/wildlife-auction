# PHASE 6 - EXACT CODE CHANGES NEEDED

## File: app/seller/orders/[orderId]/page.tsx

### Change 1: Update CardTitle and CardDescription (lines 206-207)
**FROM:**
```tsx
<CardTitle className="text-base">Delivery actions</CardTitle>
<CardDescription>Update the timeline so the buyer always knows what's next.</CardDescription>
```

**TO:**
```tsx
<CardTitle className="text-base">{transportOption === 'SELLER_TRANSPORT' ? 'Delivery Fulfillment' : 'Pickup Fulfillment'}</CardTitle>
<CardDescription>{transportOption === 'SELLER_TRANSPORT' ? 'Schedule and track delivery to the buyer.' : 'Set pickup location and windows for buyer pickup.'}</CardDescription>
```

### Change 2: Replace entire CardContent (lines 209-293)
Replace the entire `<CardContent className="space-y-3">` block with transport-aware content.

**The new content should:**
- Check `transportOption === 'SELLER_TRANSPORT'` or `'BUYER_TRANSPORT'`
- Use `txStatus` (already computed) to show appropriate actions
- For SELLER_TRANSPORT: Schedule Delivery → Mark Out → Mark Delivered → Waiting/Completed
- For BUYER_TRANSPORT: Set Pickup Info → Awaiting Buyer → Pickup Scheduled → Completed

See the full replacement code in the previous attempts - it's ready to use, just needs exact whitespace matching.
