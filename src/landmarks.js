import { PLACES } from "./places.js";
import { searchRadiusKm } from "./state.js";

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

function cacheKey(coords, radiusKm, theme) {
  return `${theme}|${coords.lat.toFixed(4)}|${coords.lng.toFixed(4)}|${radiusKm}`;
}

function prettyKind(kind) {
  return KIND_LABEL[kind] || kind.replace(/_/g, " ");
}

function buildQuery(coords, radiusKm, theme) {
  const meters = Math.round(Math.max(0.5, Math.min(radiusKm, 25)) * 1000);
  const pairs = THEME_TAGS[theme] || THEME_TAGS.food;
  const around = `(around:${meters},${coords.lat},${coords.lng})`;
  const clauses = pairs
    .map(([key, value]) => `  node["${key}"="${value}"]${around};\n  way["${key}"="${value}"]${around};`)
    .join("\n");
  return `[out:json][timeout:25];\n(\n${clauses}\n);\nout center 80;`;
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
    walkable: true,
    group: "any",
    tags: [kind, cuisine].filter(Boolean),
    blurb: cuisine ? `${prettyKind(kind)} · ${cuisine}` : prettyKind(kind),
    source: "osm",
    osmType: prettyKind(kind),
  };
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("overpass timeout")), ms)
    ),
  ]);
}

async function queryOverpass(query) {
  let lastError;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await withTimeout(
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams({ data: query }),
        }),
        8000
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

export async function fetchLandmarks(state) {
  if (!state.coords || !state.theme) return [];
  const radiusKm = searchRadiusKm(state);
  const key = cacheKey(state.coords, radiusKm, state.theme);
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

export async function loadCatalog(state) {
  try {
    return await fetchLandmarks(state);
  } catch {
    // Overpass down/blocked only. An empty live result stays empty.
    return PLACES;
  }
}
