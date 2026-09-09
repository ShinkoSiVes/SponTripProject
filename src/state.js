import { groupFitsTheme } from "./groups.js";

const STORAGE_KEY = "spontrip-state-v1";

export const STEPS = {
  START: 1,
  INTENT: 2,
  GROUP: 3,
  THEME: 4, // old funnel step; remapped on load
  MAP: 5,
  RADIUS: 6,
  BUDGET: 7,
  TRANSIT: 8, // old funnel step; remapped on load
  RESULT: 10,
  LOOP: 11,
  THANKS: 12,
};

export const INPUT_STEPS = [
  STEPS.INTENT,
  STEPS.GROUP,
  STEPS.MAP,
  STEPS.RADIUS,
  STEPS.BUDGET,
];

const VALID_STEPS = new Set([
  STEPS.START,
  ...INPUT_STEPS,
  STEPS.RESULT,
  STEPS.LOOP,
  STEPS.THANKS,
]);

const VALID_THEMES = new Set(["food", "date", "activities", "entertainment"]);

export function searchRadiusKm(state) {
  const km = Number(state.radiusKm);
  return Number.isFinite(km) && km > 0 ? km : 8;
}

export function emptyState() {
  return {
    step: STEPS.START,
    intent: "",
    groupSize: null,
    theme: null,
    coords: null,
    locationLabel: "",
    radiusKm: 8,
    budget: null,
    budgetMax: null,
    match: null,
    matchMeta: null,
    itinerary: [],
    loopCount: 0,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const loaded = { ...emptyState(), ...JSON.parse(raw) };
    if (loaded.step === STEPS.THEME) loaded.step = STEPS.INTENT;
    if (loaded.step === STEPS.TRANSIT) loaded.step = STEPS.RADIUS;
    delete loaded.transitMode;
    if (loaded.theme === "trips") loaded.theme = "activities";
    if (loaded.theme === "travel") loaded.theme = "date";
    if (loaded.theme && !VALID_THEMES.has(loaded.theme)) loaded.theme = null;
    if (loaded.groupSize && !groupFitsTheme(loaded.groupSize, loaded.theme)) {
      loaded.groupSize = null;
    }
    if (!VALID_STEPS.has(loaded.step)) loaded.step = STEPS.START;
    return loaded;
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function baselineForNextActivity(state) {
  return {
    ...emptyState(),
    step: STEPS.INTENT,
    groupSize: state.groupSize,
    coords: state.coords,
    locationLabel: state.locationLabel,
    radiusKm: state.radiusKm,
    itinerary: state.itinerary,
    loopCount: state.loopCount + 1,
  };
}
