# Stripe submission framing

Short reference for how to describe the marketplace when submitting to Stripe.

## Listings removed from examples

Test users had created listings that payment processors commonly restrict. Those are removed from Firestore via `scripts/delete-stripe-risky-listings.ts` (titles: "Lion", "Frank the Zebro"). Do not use Lion or zebra as example listings in the Stripe application or on the live site.

## Elk and fallow

**Elk and fallow** (and axis, blackbuck, aoudad, nilgai, etc.) are **privately owned ranch animals in the state of Texas**. They are raised and traded as livestock / alternative livestock on permitted Texas ranches, not as wild-caught wildlife. When describing the marketplace to Stripe, use language like:

- “Texas-only marketplace for **registered livestock**, horses, and ranch assets.”
- “Whitetail breeder deer (TPWD-permitted), **ranch exotics** (axis, fallow, elk, blackbuck, etc.), cattle, horses, working dogs, and ranch equipment.”

This makes it clear the animals are part of the regulated Texas ranch/livestock sector, not wildlife trade or exotic pets.
