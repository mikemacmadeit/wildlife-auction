# Enable Places API (New) for address search

The address search widget uses **Places API (New)** (the new Places API). This is **not** the same as the legacy **Places API**.

If you see:

- `403 (Forbidden)` on `places.googleapis.com/.../AutocompletePlaces`
- "Places API (New) has not been used in project ... before or it is disabled"

then the **Places API (New)** is not enabled for the project that owns your API key.

## Steps

1. **Open the correct project**  
   The error message includes a project number (e.g. `997321283928`). Your API key (e.g. `NEXT_PUBLIC_GOOGLE_MAPS_KEY` or `NEXT_PUBLIC_FIREBASE_API_KEY`) must belong to this same project. In [Google Cloud Console](https://console.cloud.google.com/), select that project in the top bar.

2. **Enable Places API (New)**  
   - Go to **APIs & Services** → **Library** (or use [this link](https://console.cloud.google.com/apis/library)).  
   - Search for **"Places API (New)"** (not just "Places API").  
   - Open **Places API (New)** and click **Enable**.

   Direct link to the API (replace `YOUR_PROJECT_ID` with your project number if needed):  
   https://console.developers.google.com/apis/api/places.googleapis.com/overview

3. **Wait a few minutes**  
   After enabling, wait 2–5 minutes and try the address search again.

## Summary

| API                    | Used by                         | Enable in Cloud Console      |
|------------------------|----------------------------------|------------------------------|
| **Places API**         | Legacy Places / old Autocomplete | "Places API"                 |
| **Places API (New)**   | New address search widget       | **"Places API (New)"**       |

You need **Places API (New)** enabled for the address search on the Set delivery address flow to work.

---

## If Geo, Places, and Maps are already enabled

**1. Project-level API**  
In **APIs & Services → Library**, enable **"Places API (New)"** as well. It is a different API from **"Places API"**. Having "Places API", "Maps JavaScript API", and "Geocoding API" enabled is not enough; **Places API (New)** must be enabled in the same project.

**2. API key restrictions**  
If your API key uses **API restrictions** (restrict key to specific APIs):

- Go to **APIs & Services → Credentials** → open your API key.
- Under **API restrictions**, ensure **"Places API (New)"** is in the list of allowed APIs.
- In the dropdown, **"Places API"** and **"Places API (New)"** are separate. Add **Places API (New)** if it’s missing.
- Save.

If the key is restricted to "Maps JavaScript API", "Places API", "Geocoding API" only, requests to Places API (New) will return 403 until **Places API (New)** is both enabled for the project and allowed on the key.
