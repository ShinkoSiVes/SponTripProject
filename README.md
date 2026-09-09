# Spontrip

A sponty-trip planner for friends who cannot pick a plan. Answer a short funnel, drop a pin, and get a matched stop in under two minutes.

**Live:** [spontrip-iota.vercel.app](https://spontrip-iota.vercel.app)

## How it works

1. Pick a vibe: Food, Date, Activities, or Entertainment. Optional: add a specific detail
2. Pick who is coming (the options follow the vibe you chose)
3. Search or pin a starting point on the map
4. Choose walking or vehicle, and set how far you will go
5. Cap the budget
6. Get a match, then **keep it going** for the next stop or wrap the itinerary

Later loops keep the group and pin so you only re-pick vibe, travel, and budget.

## Stack

- Vite + vanilla JavaScript
- Leaflet + OpenStreetMap tiles (no Google Maps JS key)
- Overpass API for live landmarks (restaurants, parks, cinemas, and similar)
- Nominatim for location search and reverse geocoding
- Tailwind via CDN
- LocalStorage for session restore (`spontrip-state-v1`)
- Curated backup catalog in `src/places.js` if Overpass is down

Matching uses live OpenStreetMap places inside your pin + radius for the selected vibe, then ranks by optional intent keywords and distance. Walking caps the radius at 4 km. If nothing fits inside the radius, the engine only widens to 2× then 3× that radius. If still nothing, it shows an empty result instead of a far-away place.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

```bash
npm run build    # production build to dist/
npm run preview  # preview the production build
```

No env vars or API keys required.

## Project layout

```
index.html          # screens and Stitch UI
src/app.js          # wizard, loop, spin-again
src/state.js        # state + LocalStorage
src/groups.js       # Step 2 copy that follows the vibe
src/places.js       # curated backup places
src/match.js        # haversine + filters + fallbacks
src/landmarks.js    # Overpass live POIs
src/geocode.js      # Nominatim search and reverse geocoding
src/map.js          # Leaflet pin, radius, landmark dots
src/styles.css      # screen show/hide and selected states
```

## Design

Visuals follow a neubrutalist Stitch kit: neon cyan, electric purple, 2px black borders, hard offset shadows. Inter for headlines, JetBrains Mono for labels, Material Symbols for icons.
