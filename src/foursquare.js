import { searchRadiusKm } from "./state.js";

const THEME_QUERY = {
  food: "restaurant",
  date: "cafe",
  activities: "park",
  entertainment: "cinema",
};

const PRICE_MAP = {
  1: { budget: "budget", costLabel: "Budget-friendly" },
  2: { budget: "moderate", costLabel: "Moderate" },
  3: { budget: "splurge", costLabel: "Upscale" },
  4: { budget: "splurge", costLabel: "Splurge" },
};

function apiKey() {
  return (import.meta.env.VITE_FOURSQUARE_API_KEY || "").trim();
}

export function hasFoursquarePlaces() {
  return Boolean(apiKey());
}

function toPlace(item, theme) {
  const name = item.name;
  const lat =
    item.latitude ??
    item.geocodes?.main?.latitude ??
    item.geocodes?.roof?.latitude ??
    item.location?.lat;
  const lng =
    item.longitude ??
    item.geocodes?.main?.longitude ??
    item.geocodes?.roof?.longitude ??
    item.location?.lng;
  if (!name || lat == null || lng == null) return null;

  const categories = item.categories || [];
  const kind = categories[0]?.name || theme;
  const price = PRICE_MAP[item.price] || {
    budget: null,
    costLabel: "Check on the spot",
  };
  const area =
    item.location?.locality ||
    item.location?.neighborhood?.[0] ||
    item.location?.formatted_address ||
    item.location?.address ||
    "Nearby";
  const id = item.fsq_place_id || item.fsq_id || `${lat},${lng}`;

  return {
    id: `fsq-${id}`,
    name,
    area,
    theme,
    lat: Number(lat),
    lng: Number(lng),
    budget: price.budget,
    costPhp: null,
    costLabel: price.costLabel,
    rating: typeof item.rating === "number" ? item.rating : null,
    ratingCount: item.stats?.total_ratings || item.rating_count || 0,
    group: "any",
    tags: categories
      .slice(0, 4)
      .map((c) => c.name)
      .filter(Boolean),
    blurb: item.rating ? `${kind} · ${Number(item.rating).toFixed(1)}★` : kind,
    source: "foursquare",
    distanceKm: typeof item.distance === "number" ? item.distance / 1000 : null,
  };
}

async function requestSearch(url, headers, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`foursquare ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parsePlaces(data, theme) {
  const rows = data.results || data.places || [];
  const seen = new Set();
  const places = [];
  for (const item of rows) {
    const place = toPlace(item, theme);
    if (!place || seen.has(place.name.toLowerCase())) continue;
    seen.add(place.name.toLowerCase());
    places.push(place);
  }
  return places;
}

export async function fetchFoursquareNearby(state) {
  const key = apiKey();
  if (!key || !state.coords || !state.theme) return [];

  const radiusKm = searchRadiusKm(state);
  const meters = Math.round(Math.min(Math.max(radiusKm, 0.5), 50) * 1000);
  const ll = `${state.coords.lat},${state.coords.lng}`;
  // Use theme keywords for nearby search. Free-text intent is for ranking only.
  const query = THEME_QUERY[state.theme] || THEME_QUERY.food;

  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${key}`,
    "X-Places-Api-Version": "2025-06-17",
  };

  // One fast attempt only so matching never stalls on "Finding..."
  const params = new URLSearchParams({
    ll,
    radius: String(meters),
    query,
    sort: "DISTANCE",
    limit: "15",
  });
  // Same-origin proxy in Vite/Vercel avoids browser CORS hangs.
  const base = "/api/foursquare";
  const url = `${base}/places/search?${params}`;
  const data = await requestSearch(url, headers, 7000);
  return parsePlaces(data, state.theme);
}
