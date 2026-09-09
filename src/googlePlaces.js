import { searchRadiusKm } from "./state.js";
import { intentKeywords, intentQuery } from "./intent.js";

// Google Nearby Search (New) works best with one included type per request.
const THEME_TYPES = {
  food: ["restaurant", "cafe", "bakery"],
  date: ["cafe", "restaurant", "bar", "park"],
  activities: ["park", "museum", "tourist_attraction", "gym"],
  entertainment: ["movie_theater", "night_club", "bowling_alley", "bar"],
};

const PRICE_LABEL = {
  PRICE_LEVEL_FREE: { budget: "budget", costLabel: "Free / cheap" },
  PRICE_LEVEL_INEXPENSIVE: { budget: "budget", costLabel: "Budget-friendly" },
  PRICE_LEVEL_MODERATE: { budget: "moderate", costLabel: "Moderate" },
  PRICE_LEVEL_EXPENSIVE: { budget: "splurge", costLabel: "Upscale" },
  PRICE_LEVEL_VERY_EXPENSIVE: { budget: "splurge", costLabel: "Splurge" },
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
].join(",");

function apiKey() {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
}

export function hasGooglePlaces() {
  return Boolean(apiKey());
}

function toPlace(item, theme, extraTags = []) {
  const lat = Number(item.location?.latitude);
  const lng = Number(item.location?.longitude);
  const name = item.displayName?.text;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) return null;

  const price = PRICE_LABEL[item.priceLevel] || {
    budget: null,
    costLabel: "Check on the spot",
  };
  const kinds = (item.types || []).filter(
    (t) => !t.includes("point_of_interest") && !t.includes("establishment")
  );
  const kind = kinds[0] || theme;
  const tags = [...kinds.slice(0, 4), ...extraTags].filter(Boolean);

  return {
    id: `google-${item.id || `${lat},${lng}`}`,
    name,
    area: item.shortFormattedAddress || item.formattedAddress || "Nearby",
    theme,
    lat,
    lng,
    budget: price.budget,
    costPhp: null,
    costLabel: price.costLabel,
    rating: typeof item.rating === "number" ? item.rating : null,
    ratingCount: item.userRatingCount || 0,
    group: "any",
    tags,
    blurb: item.rating
      ? `${kind.replace(/_/g, " ")} · ${item.rating.toFixed(1)}★`
      : kind.replace(/_/g, " "),
    source: "google",
    photoUrl: null,
  };
}

function parsePlaces(data, theme, extraTags = []) {
  const seen = new Set();
  const places = [];
  for (const item of data.places || []) {
    const place = toPlace(item, theme, extraTags);
    if (!place || seen.has(place.name.toLowerCase())) continue;
    seen.add(place.name.toLowerCase());
    places.push(place);
  }
  return places;
}

function mergePlaces(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const place of list || []) {
      const key = place.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(place);
    }
  }
  return merged;
}

async function googlePost(path, key, body, extraTags, theme) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`/api/google-places/v1/places:${path}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`google places ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }

    return parsePlaces(await res.json(), theme, extraTags);
  } finally {
    clearTimeout(timer);
  }
}

function circle(state, meters) {
  return {
    circle: {
      center: {
        latitude: state.coords.lat,
        longitude: state.coords.lng,
      },
      radius: meters,
    },
  };
}

async function searchText(state, query, key, meters) {
  return googlePost(
    "searchText",
    key,
    {
      textQuery: query,
      languageCode: "en",
      maxResultCount: 20,
      rankPreference: "RELEVANCE",
      locationBias: circle(state, meters),
    },
    intentKeywords(state.intent),
    state.theme
  );
}

async function searchNearbyByType(state, includedType, key, meters) {
  return googlePost(
    "searchNearby",
    key,
    {
      includedTypes: [includedType],
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: circle(state, meters),
    },
    [],
    state.theme
  );
}

async function fetchNearbyByTheme(state, key, meters) {
  const types = THEME_TYPES[state.theme] || THEME_TYPES.food;
  let lastError;
  for (const type of types.slice(0, 2)) {
    try {
      const places = await searchNearbyByType(state, type, key, meters);
      if (places.length) return places;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return [];
}

export async function fetchGoogleNearby(state) {
  const key = apiKey();
  if (!key || !state.coords || !state.theme) return [];

  const radiusKm = searchRadiusKm(state);
  const meters = Math.round(Math.min(Math.max(radiusKm, 0.5), 50) * 1000);
  const query = intentQuery(state.intent);

  if (query) {
    const [textPlaces, nearbyPlaces] = await Promise.all([
      searchText(state, query, key, meters).catch(() => []),
      fetchNearbyByTheme(state, key, meters).catch(() => []),
    ]);
    const merged = mergePlaces(textPlaces, nearbyPlaces);
    if (merged.length) return merged;
    return nearbyPlaces;
  }

  try {
    return await fetchNearbyByTheme(state, key, meters);
  } catch {
    return [];
  }
}
