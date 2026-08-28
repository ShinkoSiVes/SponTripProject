# Spontrip

A Metro Manila sponty-trip planner for friends who cannot pick a plan. Answer a short funnel, drop a pin, and get a matched stop in under two minutes.

**Live:** [spontrip-iota.vercel.app](https://spontrip-iota.vercel.app)

## How it works

1. Say what you want to do
2. Pick group size
3. Choose a theme: Food, Short Trips, Off Country, or Entertainment
4. Pin a starting point on the map
5. Set travel radius
6. Cap the budget
7. Choose walking vs vehicle
8. Get a match, then **keep it going** for the next stop or wrap the itinerary

Later loops keep the group, pin, and radius so you only re-pick theme, budget, and transit.

## Stack

- Vite + vanilla JavaScript
- Leaflet + OpenStreetMap (no Google Maps API key)
- Nominatim for reverse geocoding
- Tailwind via CDN
- LocalStorage for session restore (`spontrip-state-v1`)
- Curated Metro Manila + nearby catalog in `src/places.js`

Matching scores places by intent keywords, rating, and distance, then filters by theme, radius, budget, group size, and walkability. Walking caps the radius at 4 km. If nothing fits exactly, the engine widens the search instead of showing an empty result.

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
src/places.js       # curated places
src/match.js        # haversine + filters + fallbacks
src/map.js          # Leaflet pin + radius circle
src/styles.css      # screen show/hide and selected states
```

## Design

Visuals follow a neubrutalist Stitch kit: neon cyan, electric purple, 2px black borders, hard offset shadows. Inter for headlines, JetBrains Mono for labels, Material Symbols for icons.
