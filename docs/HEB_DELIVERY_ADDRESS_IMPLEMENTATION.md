# HEB-Style Delivery Address Implementation

## Current State (What Exists)

### Checkout & delivery flow
- **Checkout**: Buyer clicks "Buy Now" on the listing page → payment method dialog → Stripe checkout. Orders are created in the webhook when payment completes.
- **Delivery address**: Stored in two places:
  1. **`users/{uid}/checkout/current`** – `{ deliveryAddressId, updatedAt }`. Used at order creation: the webhook reads this and snapshots the selected address into the new order.
  2. **`users/{uid}/addresses/{addressId}`** – Saved addresses (label, formattedAddress, line1, city, state, postalCode, lat, lng, placeId, etc.).
- **Order creation** (`app/api/stripe/webhook/handlers.ts`): On `checkout.session.completed`, the webhook reads `users/{buyerId}/checkout/current.deliveryAddressId`, fetches the address from `users/{buyerId}/addresses/{id}`, and writes:
  - `order.deliveryAddress` (full snapshot for immutability)
  - `order.delivery.buyerAddress` (line1, city, state, zip, lat, lng, etc.) and `order.delivery.buyerAddressSetAt`.
- **Set delivery address (after payment)**: On the buyer order detail page (`app/dashboard/orders/[orderId]/page.tsx`), when status is `FULFILLMENT_REQUIRED` and there is no `order.delivery.buyerAddress`, a "Set delivery address" action is shown. If `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is set, **AddressPickerModal** is used (saved addresses + Places search + map confirm). Otherwise a manual form is used. Submitting calls `POST /api/orders/[orderId]/set-delivery-address` with inline address fields.

### Already implemented
- **Firestore**: `lib/firebase/addresses.ts` – `getAddresses`, `saveAddress`, `setCheckoutDeliveryAddress`, `getCheckoutDeliveryAddress`, `getAddressById`.
- **Types**: `lib/types.ts` – `SavedAddress`, `CheckoutCurrent`, `DeliveryAddressSnapshot`.
- **Google Maps**: `lib/google-maps/loader.ts` – singleton loader with `places` library.
- **parseGooglePlace**: `lib/address/parseGooglePlace.ts` – normalizes Place result to `ParsedGoogleAddress`.
- **AddressSearch**: `components/address/AddressSearch.tsx` – debounced input, AutocompleteService, session token, `types: ['address']`, Place Details on select.
- **AddressMapConfirm**: `components/address/AddressMapConfirm.tsx` – map, draggable marker, reverse geocode on dragend, Confirm button.
- **AddressPickerModal**: `components/address/AddressPickerModal.tsx` – saved list, "Add new address" → search → map confirm → save + set checkout (+ set order when on order page).
- **Firestore rules**: `users/{userId}/addresses/{addressId}` and `users/{userId}/checkout/{docId}` – read/write for owner only.

## Changes Made (This Pass)

1. **AddressPickerModal** (`components/address/AddressPickerModal.tsx`)
   - **Checkout-only mode**: `orderId` and `onSetDeliveryAddress` are now optional. When omitted, the modal only updates `users/{uid}/checkout/current` (no order API call). Used on the listing page before payment.
   - **Default selection**: On open, loads `getCheckoutDeliveryAddress(userId)` and sets `selectedAddressId`. The currently selected address is shown with a checkmark and "Default" where applicable; its button uses `variant="secondary"`.

2. **Listing page** (`app/listing/[id]/ListingDetailInteractiveClient.tsx`)
   - **"Set delivery address" link**: When `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is set and the user is signed in, a "Set delivery address" link is shown below the Buy Now button (mobile and desktop).
   - **AddressPickerModal**: Rendered with `userId={user.uid}` only (no `orderId`, no `onSetDeliveryAddress`). User can set or change the checkout delivery address before completing purchase; the webhook then snapshots it onto the new order.

3. **Order page** (`app/dashboard/orders/[orderId]/page.tsx`)
   - No code changes. It already passes `orderId` and `onSetDeliveryAddress`; the modal still sets checkout and calls the set-delivery-address API for that order.

## Data Model (Reference)

- **`users/{uid}/addresses/{addressId}`**: label, isDefault, formattedAddress, line1, line2?, city, state, postalCode, country, lat, lng, provider, placeId, notes?, gateCode?, createdAt, updatedAt.
- **`users/{uid}/checkout/current`**: deliveryAddressId, updatedAt.
- **`orders/{orderId}`**: existing fields plus `deliveryAddress` (snapshot at purchase) and `delivery.buyerAddress` (set from snapshot or from set-delivery-address API).

## How to Run Locally

1. **Env**: Set `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in `.env.local` (Maps JavaScript API + Places API, restrict by HTTP referrer or app).
2. **Dev server**: `npm run dev` (e.g. `http://localhost:3000`).
3. **Flow**:
   - **At checkout**: Open a listing → sign in → click "Set delivery address" → choose saved or add new (search → map → confirm) → click "Buy Now" and complete payment. The new order will have the selected address snapshot.
   - **After payment**: Open the order → "Set address" opens AddressPickerModal (same flow); selection is saved to Firestore and sent to the order via `POST /api/orders/[orderId]/set-delivery-address`.

## Tests

- No new automated tests were added. Key flows (load addresses, select saved, add new with Places + map, set checkout, order snapshot in webhook) can be verified manually and with console logs in `lib/firebase/addresses.ts` and the webhook handler if needed.
