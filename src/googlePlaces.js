import { searchRadiusKm } from "./state.js";

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

function apiKey() {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
}

export function hasGooglePlaces() {
  return Boolean(apiKey());
}

function toPlace(item, theme) {
  const lat = item.location?.latitude;
  const lng = item.location?.longitude;
  const name = item.displayName?.text;
  if (lat == null || lng == null || !name) return null;

  const price = PRICE_LABEL[item.priceLevel] || {
    budget: null,
    costLabel: "Check on the spot",
  };
  const kinds = (item.types || []).filter(
    (t) => !t.includes("point_of_interest") && !t.includes("establishment")
  );
  const kind = kinds[0] || theme;

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
    tags: kinds.slice(0, 4),
    blurb: item.rating
      ? `${kind.replace(/_/g, " ")} · ${item.rating.toFixed(1)}★`
      : kind.replace(/_/g, " "),
    source: "google",
    photoUrl: null,
  };
}

async function searchNearbyByType(state, includedType, key, meters) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    // Same-origin proxy avoids browser CORS issues in local/dev and Vercel.
    const res = await fetch("/api/google-places/v1/places:searchNearby", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.shortFormattedAddress",
          "places.location",
          "places.types",
          "places.rating",
          "places.userRatingCount",
          "places.priceLevel",
        ].join(","),
      },
      body: JSON.stringify({
        includedTypes: [includedType],
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: {
          circle: {
            center: {
              latitude: state.coords.lat,
              longitude: state.coords.lng,
            },
            radius: meters,
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`google places ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }

    const data = await res.json();
    const seen = new Set();
    const places = [];
    for (const item of data.places || []) {
      const place = toPlace(item, state.theme);
      if (!place || seen.has(place.name.toLowerCase())) continue;
      seen.add(place.name.toLowerCase());
      places.push(place);
    }
    return places;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGoogleNearby(state) {
  const key = apiKey();
  if (!key || !state.coords || !state.theme) return [];

  const radiusKm = searchRadiusKm(state);
  const meters = Math.round(Math.min(Math.max(radiusKm, 0.5), 50) * 1000);
  const types = THEME_TYPES[state.theme] || THEME_TYPES.food;

  let lastError;
  // Try primary type first, then one fallback type if empty.
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
