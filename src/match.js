import { PLACES } from "./places.js";
import { searchRadiusKm } from "./state.js";
import { intentKeywords } from "./intent.js";

const EARTH_KM = 6371;

export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function groupFits(place, groupSize) {
  if (!groupSize) return true;
  if (place.group === "any") return true;
  if (groupSize === "5+" && place.group === "small") return false;
  if (groupSize === "1" && place.group === "large") return false;
  return true;
}

const BUDGET_RANK = { budget: 1, moderate: 2, splurge: 3 };

function budgetFits(place, budget, budgetMax) {
  // Unknown live prices are allowed so coverage stays high.
  if (place.costPhp == null && !place.budget) return true;

  if (budgetMax != null && Number.isFinite(budgetMax) && place.costPhp != null) {
    // Soft peso cap: prefer under max, allow up to +25% as stretch.
    return place.costPhp <= budgetMax * 1.25;
  }

  if (!budget) return true;
  if (!place.budget) return true;

  const preferred = BUDGET_RANK[budget] || 1;
  const actual = BUDGET_RANK[place.budget] || 1;
  // Flexible: selected tier + one step up (Budget can also take Moderate).
  return actual <= preferred + 1;
}

function budgetScore(place, budget, budgetMax) {
  // Higher score = closer to what the user asked for.
  if (budgetMax != null && Number.isFinite(budgetMax) && place.costPhp != null) {
    if (place.costPhp <= budgetMax) return 2;
    if (place.costPhp <= budgetMax * 1.25) return 1;
    return 0;
  }
  if (!budget || !place.budget) return 1;
  const preferred = BUDGET_RANK[budget] || 1;
  const actual = BUDGET_RANK[place.budget] || 1;
  if (actual <= preferred) return 2;
  if (actual === preferred + 1) return 1;
  return 0;
}

function intentScore(place, intent) {
  const words = intentKeywords(intent);
  if (!words.length) return 0;
  const hay = `${place.name} ${place.blurb} ${(place.tags || []).join(" ")} ${place.area}`.toLowerCase();
  return words.reduce((score, word) => score + (hay.includes(word) ? 1 : 0), 0);
}

function withinRadius(place, km) {
  return place.distanceKm <= km + 0.05;
}

function closestFirst(places) {
  return [...places].sort((a, b) => a.distanceKm - b.distanceKm);
}

function withSpinPool(list, fallback) {
  if (!list.length) return { place: null, fallback: "empty", alternatives: [] };
  return {
    place: list[0],
    fallback,
    alternatives: list.slice(1),
  };
}

export function findMatch(state, catalog = PLACES, exclude = {}) {
  if (!state.coords) {
    return { place: null, fallback: "no-pin", alternatives: [] };
  }

  const origin = {
    lat: Number(state.coords.lat),
    lng: Number(state.coords.lng),
  };
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    return { place: null, fallback: "no-pin", alternatives: [] };
  }

  const excludeIds = new Set(exclude.ids || []);
  const excludeNames = new Set(exclude.names || []);
  const open = catalog.filter((place) => {
    if (place?.id && excludeIds.has(place.id)) return false;
    const name = String(place?.name || "").trim().toLowerCase();
    if (name && excludeNames.has(name)) return false;
    return true;
  });

  const radius = searchRadiusKm(state);

  const scored = open
    .map((place) => {
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      const point = { ...place, lat, lng };
      return {
        ...point,
        distanceKm: Number.isFinite(lat) && Number.isFinite(lng) ? distanceKm(origin, point) : NaN,
        intentHits: intentScore(place, state.intent),
        budgetHits: budgetScore(place, state.budget, state.budgetMax),
      };
    })
    .sort((a, b) => {
      // Optional detail wins when it matches a place name/tag.
      if (b.intentHits !== a.intentHits) return b.intentHits - a.intentHits;
      if (b.budgetHits !== a.budgetHits) return b.budgetHits - a.budgetHits;
      const ratingA = a.rating ?? 0;
      const ratingB = b.rating ?? 0;
      if (ratingB !== ratingA) return ratingB - ratingA;
      return a.distanceKm - b.distanceKm;
    });

  const exact = scored.filter(
    (p) =>
      p.theme === state.theme &&
      withinRadius(p, radius) &&
      groupFits(p, state.groupSize) &&
      budgetFits(p, state.budget, state.budgetMax)
  );

  if (exact.length) {
    const stretch = exact[0].budgetHits === 1;
    return withSpinPool(exact, stretch ? "budget-flex" : null);
  }

  const loose = scored.filter((p) => p.theme === state.theme && withinRadius(p, radius * 2));

  if (loose.length) {
    return withSpinPool(loose, "widened");
  }

  const anyNearby = scored.filter((p) => withinRadius(p, radius * 3));
  if (anyNearby.length) {
    return withSpinPool(anyNearby, "any-nearby");
  }

  const closest = closestFirst(
    scored.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.distanceKm))
  );
  if (closest.length) {
    return withSpinPool(closest, "any-nearby");
  }

  return { place: null, fallback: "empty", alternatives: [] };
}
