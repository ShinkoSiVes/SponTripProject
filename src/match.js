import { PLACES } from "./places.js";
import { searchRadiusKm } from "./state.js";

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

function budgetFits(place, budget, budgetMax) {
  if (place.costPhp == null && !place.budget) return true;
  if (budgetMax != null && Number.isFinite(budgetMax) && place.costPhp != null) {
    return place.costPhp <= budgetMax;
  }
  if (!budget) return true;
  if (!place.budget) return true;
  const rank = { budget: 1, moderate: 2, splurge: 3 };
  return rank[place.budget] <= rank[budget];
}

function intentScore(place, intent) {
  if (!intent) return 0;
  const hay = `${place.name} ${place.blurb} ${(place.tags || []).join(" ")} ${place.area}`.toLowerCase();
  return intent
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2)
    .reduce((score, word) => score + (hay.includes(word) ? 1 : 0), 0);
}

function withinRadius(place, km) {
  return place.distanceKm <= km + 0.05;
}

function closestFirst(places) {
  return [...places].sort((a, b) => a.distanceKm - b.distanceKm);
}

export function findMatch(state, catalog = PLACES) {
  if (!state.coords) {
    return { place: null, fallback: "no-pin", alternatives: [] };
  }

  const origin = state.coords;
  const radius = searchRadiusKm(state);

  const scored = catalog
    .map((place) => ({
      ...place,
      distanceKm: distanceKm(origin, place),
      intentHits: intentScore(place, state.intent),
    }))
    .sort((a, b) => {
      if (b.intentHits !== a.intentHits) return b.intentHits - a.intentHits;
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
      budgetFits(p, state.budget, state.budgetMax) &&
      (state.transitMode !== "walk" || p.walkable)
  );

  if (exact.length) {
    return { place: exact[0], fallback: null, alternatives: exact.slice(1, 3) };
  }

  const loose = closestFirst(
    scored.filter(
      (p) =>
        p.theme === state.theme &&
        withinRadius(p, radius * 2) &&
        (state.transitMode !== "walk" || p.walkable)
    )
  );

  if (loose.length) {
    return { place: loose[0], fallback: "widened", alternatives: loose.slice(1, 3) };
  }

  const anyNearby = closestFirst(
    scored.filter(
      (p) =>
        withinRadius(p, radius * 3) && (state.transitMode !== "walk" || p.walkable)
    )
  );
  if (anyNearby.length) {
    return { place: anyNearby[0], fallback: "any-nearby", alternatives: anyNearby.slice(1, 3) };
  }

  return { place: null, fallback: "empty", alternatives: [] };
}
