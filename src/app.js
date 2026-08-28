import "./styles.css";
import {
  STEPS,
  INPUT_STEPS,
  loadState,
  saveState,
  emptyState,
  baselineForNextActivity,
} from "./state.js";
import { findMatch } from "./match.js";
import { initMap, setPin, updateCircle, refreshMapSize } from "./map.js";

let state = loadState();

const $ = (id) => document.getElementById(id);

function persist() {
  saveState(state);
}

function setState(patch) {
  state = { ...state, ...patch };
  persist();
  render();
}

function inputIndex() {
  return Math.max(0, INPUT_STEPS.indexOf(state.step));
}

function canAdvance() {
  switch (state.step) {
    case STEPS.START:
      return true;
    case STEPS.INTENT:
      return state.intent.trim().length > 0;
    case STEPS.GROUP:
      return Boolean(state.groupSize);
    case STEPS.THEME:
      return Boolean(state.theme);
    case STEPS.MAP:
      return Boolean(state.coords);
    case STEPS.RADIUS:
      return state.radiusKm >= 0.5;
    case STEPS.BUDGET:
      return Boolean(state.budget) || (state.budgetMax != null && state.budgetMax > 0);
    case STEPS.TRANSIT:
      return Boolean(state.transitMode);
    default:
      return false;
  }
}

function go(step) {
  setState({ step });
}

function isBaselineFilled(step) {
  if (state.loopCount === 0) return false;
  if (step === STEPS.GROUP) return Boolean(state.groupSize);
  if (step === STEPS.MAP || step === STEPS.RADIUS) return Boolean(state.coords);
  return false;
}

function nextInputStep(fromStep) {
  const i = INPUT_STEPS.indexOf(fromStep);
  if (i < 0) return null;
  for (let n = i + 1; n < INPUT_STEPS.length; n++) {
    if (!isBaselineFilled(INPUT_STEPS[n])) return INPUT_STEPS[n];
  }
  return null;
}

function prevInputStep(fromStep) {
  const i = INPUT_STEPS.indexOf(fromStep);
  if (i < 0) return null;
  for (let n = i - 1; n >= 0; n--) {
    if (!isBaselineFilled(INPUT_STEPS[n])) return INPUT_STEPS[n];
  }
  return null;
}

function next() {
  if (state.step === STEPS.START) return go(STEPS.INTENT);
  if (state.step === STEPS.TRANSIT) return runMatch();
  const following = nextInputStep(state.step);
  if (following) return go(following);
  if (INPUT_STEPS.includes(state.step)) return runMatch();
}

function back() {
  if (state.step === STEPS.INTENT) {
    if (state.loopCount > 0) return;
    return go(STEPS.START);
  }
  if (state.step === STEPS.RESULT) return go(STEPS.TRANSIT);
  if (state.step === STEPS.LOOP) return go(STEPS.RESULT);
  const previous = prevInputStep(state.step);
  if (previous) go(previous);
}

function runMatch() {
  const result = findMatch(state);
  setState({
    step: STEPS.RESULT,
    match: result.place,
    matchMeta: { fallback: result.fallback, alternatives: result.alternatives },
  });
}

function keepGoing() {
  if (state.match) {
    state = baselineForNextActivity({
      ...state,
      itinerary: [...state.itinerary, state.match],
    });
  } else {
    state = baselineForNextActivity(state);
  }
  persist();
  render();
}

function finishTrip() {
  const itinerary = state.match ? [...state.itinerary, state.match] : state.itinerary;
  setState({ itinerary, step: STEPS.THANKS, match: state.match });
}

function resetAll() {
  state = emptyState();
  persist();
  render();
}

async function reverseLabel(coords) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    const label =
      data.address?.suburb ||
      data.address?.city_district ||
      data.address?.city ||
      data.address?.town ||
      data.display_name?.split(",").slice(0, 2).join(",");
    return label || `Pin ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  } catch {
    return `Pin ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  }
}

async function onMapSelect(coords) {
  state = { ...state, coords, locationLabel: state.locationLabel || `Pin ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` };
  persist();
  render();
  const locationLabel = await reverseLabel(coords);
  if (state.coords?.lat === coords.lat && state.coords?.lng === coords.lng) {
    state = { ...state, locationLabel };
    persist();
    render();
  }
}

function useMyLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setPin(coords, state.radiusKm);
    await onMapSelect(coords);
    render();
  });
}

function directionsUrl(place) {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
}

function fallbackCopy(kind) {
  if (kind === "widened") return "No exact hit inside your radius. Closest same-theme match:";
  if (kind === "any-nearby") return "Nothing matched every filter. Nearby option instead:";
  if (kind === "best-effort") return "Filters were tight. Best available option:";
  if (kind === "no-pin") return "Drop a pin first so we can match a place.";
  return "";
}

function bindOnce() {
  $("start-btn").addEventListener("click", () => go(STEPS.INTENT));
  $("intent-input").addEventListener("input", (e) => {
    state.intent = e.target.value;
    persist();
    $("next-btn").disabled = !canAdvance();
  });
  document.querySelectorAll("[data-intent]").forEach((btn) => {
    btn.addEventListener("click", () => setState({ intent: btn.dataset.intent }));
  });
  document.querySelectorAll("[data-group]").forEach((btn) => {
    btn.addEventListener("click", () => setState({ groupSize: btn.dataset.group }));
  });
  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => setState({ theme: btn.dataset.theme }));
  });
  $("geo-btn").addEventListener("click", useMyLocation);
  $("radius-input").addEventListener("input", (e) => {
    const radiusKm = Number(e.target.value);
    state.radiusKm = radiusKm;
    persist();
    $("radius-value").textContent = String(radiusKm);
    if (state.coords) updateCircle(state.coords, radiusKm);
  });
  document.querySelectorAll("[data-budget]").forEach((btn) => {
    btn.addEventListener("click", () => setState({ budget: btn.dataset.budget, budgetMax: null }));
  });
  $("budget-max").addEventListener("input", (e) => {
    const value = e.target.value === "" ? null : Number(e.target.value);
    state.budgetMax = value;
    if (value) state.budget = null;
    persist();
    $("next-btn").disabled = !canAdvance();
  });
  document.querySelectorAll("[data-transit]").forEach((btn) => {
    btn.addEventListener("click", () => setState({ transitMode: btn.dataset.transit }));
  });
  $("back-btn").addEventListener("click", back);
  $("header-back").addEventListener("click", back);
  $("next-btn").addEventListener("click", next);
  $("keep-yes").addEventListener("click", keepGoing);
  $("keep-no").addEventListener("click", finishTrip);
  $("restart-btn").addEventListener("click", resetAll);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("is-on"));
  const screen = $(id);
  if (screen) screen.classList.add("is-on");
}

function renderChoices() {
  document.querySelectorAll("[data-intent]").forEach((btn) => {
    btn.classList.toggle("is-picked", btn.dataset.intent === state.intent);
  });
  document.querySelectorAll("[data-group]").forEach((btn) => {
    btn.classList.toggle("is-picked", btn.dataset.group === state.groupSize);
  });
  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.classList.toggle("is-picked", btn.dataset.theme === state.theme);
  });
  document.querySelectorAll("[data-budget]").forEach((btn) => {
    btn.classList.toggle("is-picked", btn.dataset.budget === state.budget);
  });
  document.querySelectorAll("[data-transit]").forEach((btn) => {
    btn.classList.toggle("is-picked", btn.dataset.transit === state.transitMode);
  });
}

function spinAgain() {
  const alts = state.matchMeta?.alternatives || [];
  if (!alts.length) return runMatch();
  const current = state.match;
  const nextPlace = alts[0];
  const remaining = [...alts.slice(1), current].filter(Boolean);
  setState({
    match: nextPlace,
    matchMeta: { ...state.matchMeta, alternatives: remaining, fallback: "reroll" },
  });
}

function renderResult() {
  const place = state.match;
  const box = $("result-card");
  const note = $("result-note");
  if (!place) {
    box.innerHTML = "<p class='font-body-md'>No place could be matched. Go back and widen the radius or budget.</p>";
    note.textContent = fallbackCopy(state.matchMeta?.fallback);
    return;
  }
  note.textContent = fallbackCopy(state.matchMeta?.fallback);
  const dist = place.distanceKm != null ? `${place.distanceKm.toFixed(1)} km` : "Nearby";
  box.innerHTML = `
    <div class="flex flex-col gap-2 items-center text-center mt-4">
      <span class="material-symbols-outlined text-4xl text-neon-cyan" style="font-variation-settings: 'FILL' 1">celebration</span>
      <p class="font-label-bold text-label-bold text-slate-muted uppercase tracking-widest">Matched you with your perfect event</p>
      <h2 class="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg">${place.name}</h2>
      <p class="font-body-md text-on-surface-variant">${place.blurb}</p>
    </div>
    <div class="w-full h-40 md:h-52 border-2 border-black mt-4 mb-4 bg-electric-purple relative overflow-hidden">
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="font-headline-md text-white uppercase tracking-tight">${place.area}</span>
      </div>
      <div class="absolute top-2 left-2 bg-white border-2 border-black px-3 py-1 font-label-bold text-label-bold flex items-center gap-1 shadow-[4px_4px_0_#00FFFF]">
        <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1">star</span>
        ${place.rating}/5
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4 mb-6">
      <div class="bg-surface border-2 border-black p-3 flex items-center gap-3 shadow-[4px_4px_0_#000]">
        <div class="bg-black text-white p-2 rounded-full flex items-center justify-center">
          <span class="material-symbols-outlined">near_me</span>
        </div>
        <div>
          <p class="font-label-sm text-label-sm text-slate-muted">Distance</p>
          <p class="font-body-md font-bold">${dist}</p>
        </div>
      </div>
      <div class="bg-surface border-2 border-black p-3 flex items-center gap-3 shadow-[4px_4px_0_#000]">
        <div class="bg-black text-white p-2 rounded-full flex items-center justify-center">
          <span class="material-symbols-outlined">payments</span>
        </div>
        <div>
          <p class="font-label-sm text-label-sm text-slate-muted">Est. Cost</p>
          <p class="font-body-md font-bold">${place.costLabel}</p>
        </div>
      </div>
    </div>
    <a href="${directionsUrl(place)}" target="_blank" rel="noreferrer" class="w-full bg-neon-cyan text-on-surface font-headline-md text-headline-md border-2 border-black py-4 shadow-[4px_4px_0_#000] hover:bg-electric-purple hover:text-white flex justify-center items-center gap-2">
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1">navigation</span>
      Instant Directions
    </a>
    <button id="spin-again" class="w-full mt-2 bg-white font-label-bold text-label-bold py-2 underline decoration-2 underline-offset-4" type="button">
      Not feeling it? Spin again
    </button>
    <button id="to-loop" class="w-full mt-4 bg-white border-2 border-black font-label-bold text-label-bold uppercase py-3 shadow-[4px_4px_0_#000]" type="button">
      Continue
    </button>
  `;
  $("to-loop").onclick = () => go(STEPS.LOOP);
  $("spin-again").onclick = spinAgain;
}

function renderItinerary(el, extra) {
  const stops = extra && extra.name ? [...state.itinerary, extra] : state.itinerary;
  if (!stops.length) {
    el.innerHTML = "<p>No stops yet.</p>";
    return;
  }
  el.innerHTML = `<ol class="itinerary">${stops
    .map((stop) => `<li>${stop.name} (${stop.area})</li>`)
    .join("")}</ol>`;
}

function render() {
  const stepMap = {
    [STEPS.START]: "screen-start",
    [STEPS.INTENT]: "screen-intent",
    [STEPS.GROUP]: "screen-group",
    [STEPS.THEME]: "screen-theme",
    [STEPS.MAP]: "screen-map",
    [STEPS.RADIUS]: "screen-radius",
    [STEPS.BUDGET]: "screen-budget",
    [STEPS.TRANSIT]: "screen-transit",
    [STEPS.RESULT]: "screen-result",
    [STEPS.LOOP]: "screen-loop",
    [STEPS.THANKS]: "screen-thanks",
  };

  showScreen(stepMap[state.step] || "screen-start");

  const inFunnel = INPUT_STEPS.includes(state.step);
  const showChrome =
    inFunnel || state.step === STEPS.RESULT || state.step === STEPS.LOOP;
  $("chrome").classList.toggle("hidden", !showChrome);
  $("footer").classList.toggle("hidden", !inFunnel);

  const mapPanel = $("map-panel");
  if (state.step === STEPS.MAP) {
    $("map-slot").appendChild(mapPanel);
    mapPanel.classList.remove("hidden");
  } else if (state.step === STEPS.RADIUS) {
    $("radius-map-slot").appendChild(mapPanel);
    mapPanel.classList.remove("hidden");
  } else {
    mapPanel.classList.add("hidden");
  }

  if (inFunnel || state.step === STEPS.RESULT) {
    const n = state.step === STEPS.RESULT ? 8 : inputIndex() + 1;
    $("progress-label").textContent = `Step ${n} of 8`;
  }

  if (inFunnel) {
    $("back-btn").disabled = state.step === STEPS.INTENT && state.loopCount > 0;
    $("header-back").disabled = state.step === STEPS.INTENT && state.loopCount > 0;
    $("next-btn").disabled = !canAdvance();
    $("next-label").textContent = state.step === STEPS.TRANSIT ? "Find match" : "Next";
  }

  $("intent-input").value = state.intent;
  $("radius-input").value = String(state.radiusKm);
  $("radius-value").textContent = String(state.radiusKm);
  $("budget-max").value = state.budgetMax ?? "";
  $("location-label").textContent = state.locationLabel || "No pin yet. Tap the map.";
  $("radius-location").textContent = state.locationLabel || "No pin yet";
  $("baseline-note").classList.toggle("hidden", state.loopCount === 0);
  $("baseline-note").textContent =
    state.loopCount > 0
      ? `Keeping ${state.groupSize || "your group"} near ${state.locationLabel || "your pin"}. Pick the next activity.`
      : "";

  renderChoices();

  if (state.step === STEPS.MAP || state.step === STEPS.RADIUS) {
    initMap("map", {
      coords: state.coords,
      radiusKm: state.radiusKm,
      onSelect: onMapSelect,
    });
    if (state.step === STEPS.RADIUS && state.coords) {
      setPin(state.coords, state.radiusKm);
    }
    setTimeout(refreshMapSize, 50);
  }

  if (state.step === STEPS.RESULT) {
    renderResult();
  }

  if (state.step === STEPS.LOOP || state.step === STEPS.THANKS) {
    renderItinerary($("loop-itinerary"), state.step === STEPS.LOOP ? state.match : null);
    renderItinerary($("final-itinerary"));
  }
}

bindOnce();
render();
