const STORAGE_KEY = "spontrip-state-v1";

export const STEPS = {
  START: 1,
  INTENT: 2,
  GROUP: 3,
  THEME: 4,
  MAP: 5,
  RADIUS: 6,
  BUDGET: 7,
  TRANSIT: 8,
  RESULT: 10,
  LOOP: 11,
  THANKS: 12,
};

export const INPUT_STEPS = [
  STEPS.INTENT,
  STEPS.GROUP,
  STEPS.THEME,
  STEPS.MAP,
  STEPS.RADIUS,
  STEPS.BUDGET,
  STEPS.TRANSIT,
];

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
    transitMode: null,
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
    return { ...emptyState(), ...JSON.parse(raw) };
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
