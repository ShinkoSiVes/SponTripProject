# Spontrip

A sponty-trip planner for friends who cannot pick a plan. Answer a short funnel, drop a pin, and get a matched stop in under two minutes.

**Live:** [spontrip-iota.vercel.app](https://spontrip-iota.vercel.app)

## How it works

1. Pick a vibe: Food, Date, Activities, or Entertainment. Optional: add a specific detail
2. Pick who is coming (the options follow the vibe you chose)
3. Search or pin a starting point on the map
4. Set how far you will go from your pin
5. Cap the budget
6. Get a match, then **keep it going** for the next stop or wrap the itinerary

Later loops keep the group and pin so you only re-pick vibe, distance, and budget.

Matching prefers live nearby places for the selected vibe (**Google → Foursquare → OpenStreetMap → backup list**). Optional Step 1 detail is sent into Google Text Search and Foursquare query, then used again to rank results. Radius is the only travel filter. The match screen shows the real map. If nothing fits, you can auto-widen the search or pick a different pin.

## Stack

- Vite + vanilla JavaScript
- Leaflet + OpenStreetMap tiles
- **Google Places API (New)** for nearby venues (recommended)
- Foursquare Places as optional fallback
- Overpass API fallback if no Places key is set
- Nominatim for location search and reverse geocoding
- Tailwind via CDN
- LocalStorage for session restore (`spontrip-state-v1`)
- Curated backup catalog in `src/places.js` if live APIs fail

## Run locally

```bash
npm install
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and add at least a Google Places key (see below). Then:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Restart the dev server after any `.env` change.

```bash
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## API keys

Vite only reads variables that start with `VITE_`. Keys are baked in at **build** time, so a new deploy is required after changing them on Vercel.

### Recommended: Google Places API (New)

Without this key, nearby search falls back to Foursquare, then OpenStreetMap, then the backup list.

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Places API (New)** (not the legacy Places API)
3. Create an API key
4. Restrict it by HTTP referrer:
   - `http://localhost:5173/*`
   - `https://your-vercel-domain.vercel.app/*`
5. Put it in `.env`:

```bash
VITE_GOOGLE_MAPS_API_KEY=your_key_here
```

Local and Vercel traffic goes through `/api/google-places` so the browser does not call Google directly (avoids CORS). The key still ships in the client bundle, so keep referrer restrictions on.

### Optional: Foursquare Places

Used only if Google is missing or returns nothing.

```bash
VITE_FOURSQUARE_API_KEY=your_key_here
```

Create a key in the [Foursquare Places console](https://foursquare.com/developers/). Local and Vercel traffic goes through `/api/foursquare`.

### Vercel

In the Vercel project: **Settings → Environment Variables**. Add the same `VITE_` names for Production (and Preview if you want keys on preview deploys), then **redeploy** so the build picks them up.

```bash
vercel env add VITE_GOOGLE_MAPS_API_KEY
vercel env add VITE_FOURSQUARE_API_KEY   # optional
```

Do not commit `.env`. `.env.example` is the template.

## Project layout

```
index.html          # screens
.env.example        # API key template
src/app.js          # wizard, loop, match flow
src/state.js        # state + LocalStorage
src/groups.js       # Step 2 copy that follows the vibe
src/places.js       # curated backup places
src/match.js        # distance + budget + ranking
src/intent.js       # optional-detail keyword parsing
src/landmarks.js    # Google + Foursquare + Overpass live POIs
src/googlePlaces.js # Google Text Search + Nearby Search
src/foursquare.js   # Foursquare Places Nearby Search
src/geocode.js      # Nominatim search and reverse geocoding
src/map.js          # Leaflet pin, radius, landmark dots
src/styles.css      # screen show/hide and selected states
vite.config.js      # local API proxies
vercel.json         # production API rewrites
```

## Design

Visuals follow a neubrutalist Stitch kit: pastel teal, pastel blush, 2px black borders, hard offset shadows. Inter for headlines, JetBrains Mono for labels, Material Symbols for icons.
