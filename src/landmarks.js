import { PLACES } from "./places.js";
import { searchRadiusKm } from "./state.js";
import { distanceKm } from "./match.js";
import { fetchFoursquareNearby, hasFoursquarePlaces } from "./foursquare.js";
import { fetchGoogleNearby, hasGooglePlaces } from "./googlePlaces.js";

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

const THEME_TAGS = {
  food: [
    ["amenity", "restaurant"],
    ["amenity", "cafe"],
    ["amenity", "fast_food"],
    ["amenity", "food_court"],
    ["amenity", "ice_cream"],
    ["shop", "bakery"],
  ],
  date: [
    ["amenity", "cafe"],
    ["amenity", "bar"],
    ["tourism", "viewpoint"],
    ["leisure", "park"],
    ["leisure", "garden"],
    ["tourism", "attraction"],
  ],
  activities: [
    ["leisure", "park"],
    ["tourism", "museum"],
    ["tourism", "attraction"],
    ["tourism", "theme_park"],
    ["leisure", "sports_centre"],
    ["leisure", "fitness_centre"],
    ["historic", "monument"],
    ["leisure", "nature_reserve"],
  ],
  entertainment: [
    ["amenity", "cinema"],
    ["amenity", "theatre"],
    ["amenity", "nightclub"],
    ["amenity", "arts_centre"],
    ["leisure", "amusement_arcade"],
    ["amenity", "pub"],
    ["amenity", "bar"],
  ],
};

const KIND_LABEL = {
  restaurant: "Restaurant",
  cafe: "Cafe",
  fast_food: "Fast food",
  food_court: "Food court",
  ice_cream: "Dessert",
  bakery: "Bakery",
  bar: "Bar",
  viewpoint: "Viewpoint",
  park: "Park",
  garden: "Garden",
  attraction: "Attraction",
  museum: "Museum",
  theme_park: "Theme park",
  sports_centre: "Sports",
  fitness_centre: "Fitness",
  monument: "Landmark",
  nature_reserve: "Nature",
  cinema: "Cinema",
  theatre: "Theatre",
  nightclub: "Nightlife",
  arts_centre: "Arts",
  amusement_arcade: "Arcade",
  pub: "Pub",
};

const cache = new Map();

function cacheKey(coords, radiusKm, theme, source) {
  return `${source}|${theme}|${coords.lat.toFixed(4)}|${coords.lng.toFixed(4)}|${radiusKm}`;
}

function prettyKind(kind) {
  return KIND_LABEL[kind] || kind.replace(/_/g, " ");
}

function buildQuery(coords, radiusKm, theme) {
  // Keep the Overpass query small so it fails fast when mirrors are slow.
  const meters = Math.round(Math.max(0.5, Math.min(radiusKm, 12)) * 1000);
  const pairs = (THEME_TAGS[theme] || THEME_TAGS.food).slice(0, 3);
  const around = `(around:${meters},${coords.lat},${coords.lng})`;
  const clauses = pairs
    .map(([key, value]) => `  node["${key}"="${value}"]${around};`)
    .join("\n");
  return `[out:json][timeout:8];\n(\n${clauses}\n);\nout center 40;`;
}

function toPlace(el, theme) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null || !tags.name) return null;
  const kind = tags.amenity || tags.tourism || tags.leisure || tags.shop || tags.historic || "spot";
  const cuisine = tags.cuisine ? tags.cuisine.replace(/_/g, " ").replace(/;/g, ", ") : "";
  return {
    id: `osm-${el.type}-${el.id}`,
    name: tags.name,
    area: tags["addr:suburb"] || tags["addr:city"] || tags["addr:district"] || tags["addr:quarter"] || "Nearby",
    theme,
    lat,
    lng,
    budget: null,
    costPhp: null,
    costLabel: "Check on the spot",
    rating: null,
    group: "any",
    tags: [kind, cuisine].filter(Boolean),
    blurb: cuisine ? `${prettyKind(kind)} · ${cuisine}` : prettyKind(kind),
    source: "osm",
    osmType: prettyKind(kind),
  };
}

function withTimeout(promise, ms, label = "timeout") {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

async function queryOverpass(query) {
  let lastError;
  // Try only the first two mirrors quickly so Matching never hangs.
  for (const url of OVERPASS_URLS.slice(0, 2)) {
    try {
      const res = await withTimeout(
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams({ data: query }),
        }),
        8000,
        "overpass timeout"
      );
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("overpass failed");
}

function rememberCache(key, places) {
  cache.set(key, places);
  if (cache.size <= 24) return;
  const oldest = cache.keys().next().value;
  cache.delete(oldest);
}

function nearbyBackup(state) {
  if (!state.coords) {
    return PLACES.filter((place) => !state.theme || place.theme === state.theme).map((place) => ({
      ...place,
      source: "backup",
    }));
  }

  // Be generous so Matching still works when live APIs are down.
  const radius = Math.max(searchRadiusKm(state) * 5, 30);
  const scored = PLACES.map((place) => ({
    ...place,
    distanceKm: distanceKm(state.coords, place),
    source: "backup",
  })).sort((a, b) => a.distanceKm - b.distanceKm);

  const themedNearby = scored.filter(
    (place) => (!state.theme || place.theme === state.theme) && place.distanceKm <= radius
  );
  if (themedNearby.length) return themedNearby;

  const themedAny = scored.filter((place) => !state.theme || place.theme === state.theme);
  if (themedAny.length) return themedAny.slice(0, 20);

  return scored.slice(0, 20);
}

async function fetchOverpassLandmarks(state) {
  const radiusKm = searchRadiusKm(state);
  const key = cacheKey(state.coords, radiusKm, state.theme, "osm");
  if (cache.has(key)) return cache.get(key);

  const query = buildQuery(state.coords, radiusKm, state.theme);
  const data = await queryOverpass(query);
  const seen = new Set();
  const places = [];
  for (const el of data.elements || []) {
    const place = toPlace(el, state.theme);
    if (!place || seen.has(place.name.toLowerCase())) continue;
    seen.add(place.name.toLowerCase());
    places.push(place);
  }
  rememberCache(key, places);
  return places;
}

export async function fetchLandmarks(state) {
  if (!state.coords || !state.theme) return [];

  const radiusKm = searchRadiusKm(state);

  // Prefer Google Places, then Foursquare, then OSM.
  if (hasGooglePlaces()) {
    const key = cacheKey(state.coords, radiusKm, state.theme, "google");
    if (cache.has(key)) return cache.get(key);
    try {
      const places = await fetchGoogleNearby(state);
      if (places.length) {
        rememberCache(key, places);
        return places;
      }
    } catch {
      // Fall through.
    }
  }

  if (hasFoursquarePlaces()) {
    const key = cacheKey(state.coords, radiusKm, state.theme, "foursquare");
    if (cache.has(key)) return cache.get(key);
    try {
      const places = await fetchFoursquareNearby(state);
      if (places.length) {
        rememberCache(key, places);
        return places;
      }
    } catch {
      // Fall through to OpenStreetMap.
    }
  }

  try {
    return await fetchOverpassLandmarks(state);
  } catch {
    return nearbyBackup(state);
  }
}

export async function loadCatalog(state) {
  try {
    const live = await withTimeout(fetchLandmarks(state), 10000, "catalog timeout");
    if (live.length) return live;
    return nearbyBackup(state);
  } catch {
    return nearbyBackup(state);
  }
}
