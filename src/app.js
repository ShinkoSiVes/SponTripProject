import "./styles.css";
import {
  STEPS,
  INPUT_STEPS,
  loadState,
  saveState,
  emptyState,
  baselineForNextActivity,
  searchRadiusKm,
} from "./state.js";
import { findMatch } from "./match.js";
import { fetchLandmarks, loadCatalog } from "./landmarks.js";
import { PLACES } from "./places.js";
import { reverseLabel, searchLocations } from "./geocode.js";
import { initMap, setPin, updateCircle, refreshMapSize, setLandmarks, clearLandmarks } from "./map.js";
import { groupCopyFor, groupFitsTheme, groupLabel } from "./groups.js";

let state = loadState();

let landmarkToken = 0;
let landmarkTimer = null;
let searchTimer = null;
let searchToken = 0;

function updateLandmarkStatus(text) {
  const mapStatus = $("landmark-status");
  const radiusStatus = $("radius-landmark-status");
  if (mapStatus) mapStatus.textContent = text;
  if (radiusStatus) radiusStatus.textContent = text;
}

async function refreshLandmarks() {
  if (!state.coords || !state.theme) {
    clearLandmarks();
    updateLandmarkStatus("");
    return;
  }
  const token = ++landmarkToken;
  updateLandmarkStatus("Loading nearby spots…");
  try {
    const places = await fetchLandmarks(state);
    if (token !== landmarkToken) return;
    setLandmarks(places, state.match?.id);
    updateLandmarkStatus(
      places.length
        ? `${places.length} real ${state.theme} spots in this area`
        : "No mapped spots yet for this vibe"
    );
  } catch {
    if (token !== landmarkToken) return;
    clearLandmarks();
    updateLandmarkStatus("Live map is busy. Matching can still use the backup list.");
  }
}

function scheduleLandmarkRefresh() {
  clearTimeout(landmarkTimer);
  landmarkTimer = setTimeout(refreshLandmarks, 400);
}

let themeSlideIndex = 0;
let themeSlideTimer = null;
let slidingTheme = null;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function paintThemeTracks(index) {
  document.querySelectorAll(".theme-card").forEach((card) => {
    const track = card.querySelector(".theme-card-track");
    if (!track) return;
    const i = card.dataset.theme === state.theme ? index : 0;
    track.style.transform = `translateX(-${i * 100}%)`;
  });
}

function stopThemeSlider() {
  if (themeSlideTimer) {
    clearInterval(themeSlideTimer);
    themeSlideTimer = null;
  }
}

function startThemeSlider(theme) {
  stopThemeSlider();
  slidingTheme = theme;
  themeSlideIndex = 0;
  paintThemeTracks(0);
  if (!theme || prefersReducedMotion()) return;
  const card = document.querySelector(`.theme-card[data-theme="${theme}"]`);
  const slides = card?.querySelectorAll(".theme-card-track img").length || 3;
  themeSlideTimer = setInterval(() => {
    themeSlideIndex = (themeSlideIndex + 1) % slides;
    paintThemeTracks(themeSlideIndex);
  }, 2400);
}

function syncThemeSlider() {
  if (state.step !== STEPS.INTENT || !state.theme) {
    stopThemeSlider();
    slidingTheme = null;
    paintThemeTracks(0);
    return;
  }
  if (slidingTheme !== state.theme) startThemeSlider(state.theme);
}

function pickTheme(theme) {
  if (state.theme === theme) {
    slidingTheme = null;
    themeSlideIndex = 0;
    stopThemeSlider();
    setState({ theme: null });
    return;
  }
  slidingTheme = null;
  themeSlideIndex = 0;
  const groupSize = groupFitsTheme(state.groupSize, theme) ? state.groupSize : null;
  setState({ theme, groupSize });
}

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
      return Boolean(state.theme);
    case STEPS.GROUP:
      return Boolean(state.groupSize);
    case STEPS.MAP:
      return Boolean(state.coords);
    case STEPS.RADIUS:
      return state.radiusKm >= 0.5 && Boolean(state.transitMode);
    case STEPS.BUDGET:
      return Boolean(state.budget) || (state.budgetMax != null && state.budgetMax > 0);
    default:
      return false;
  }
}

function travelPreviewKm() {
  return searchRadiusKm(state);
}

function go(step) {
  setState({ step });
}

function isBaselineFilled(step) {
  if (state.loopCount === 0) return false;
  if (step === STEPS.GROUP) return Boolean(state.groupSize);
  if (step === STEPS.MAP) return Boolean(state.coords);
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
  if (state.step === STEPS.BUDGET) return runMatch();
  const following = nextInputStep(state.step);
  if (following) return go(following);
  if (INPUT_STEPS.includes(state.step)) return runMatch();
}

function back() {
  if (state.step === STEPS.INTENT) {
    if (state.loopCount > 0) return;
    return go(STEPS.START);
  }
  if (state.step === STEPS.RESULT) return go(STEPS.BUDGET);
  if (state.step === STEPS.LOOP) return go(STEPS.RESULT);
  const previous = prevInputStep(state.step);
  if (previous) go(previous);
}

async function runMatch() {
  const btn = $("next-btn");
  const label = $("next-label");
  if (btn) {
    btn.disabled = true;
    if (label) label.textContent = "Finding...";
  }
  try {
    const catalog = await loadCatalog(state);
    const result = findMatch(state, catalog);
    setLandmarks(catalog, result.place?.id);
    setState({
      step: STEPS.RESULT,
      match: result.place,
      matchMeta: { fallback: result.fallback, alternatives: result.alternatives },
    });
  } catch (err) {
    // Restore button so the user can try again
    if (btn) {
      btn.disabled = false;
      if (label) label.textContent = "Find match";
    }
    // Fall back to the curated list and try once more
    try {
      const result = findMatch(state, PLACES);
      setLandmarks([], null);
      setState({
        step: STEPS.RESULT,
        match: result.place,
        matchMeta: { fallback: result.fallback ?? "any-nearby", alternatives: result.alternatives },
      });
    } catch {
      // Last resort: show empty result screen
      setState({
        step: STEPS.RESULT,
        match: null,
        matchMeta: { fallback: "empty", alternatives: [] },
      });
    }
  }
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

async function onMapSelect(coords, knownLabel) {
  state = {
    ...state,
    coords,
    locationLabel: knownLabel || state.locationLabel || `Pin ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
  };
  persist();
  render();
  if (knownLabel) return;
  const locationLabel = await reverseLabel(coords);
  if (state.coords?.lat === coords.lat && state.coords?.lng === coords.lng) {
    state = { ...state, locationLabel };
    persist();
    render();
  }
}

function useMyLocation() {
  if (!navigator.geolocation) {
    updateLandmarkStatus("This browser cannot share location. Search or tap the map.");
    return;
  }
  updateLandmarkStatus("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPin(coords, searchRadiusKm(state));
      await onMapSelect(coords);
    },
    () => {
      updateLandmarkStatus("Location blocked. Search a place or tap the map.");
    }
  );
}

function hidePlaceResults() {
  const list = $("place-search-results");
  if (!list) return;
  list.innerHTML = "";
  list.classList.add("hidden");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function runPlaceSearch(query) {
  const token = ++searchToken;
  const list = $("place-search-results");
  if (!list) return;
  try {
    const hits = await searchLocations(query);
    if (token !== searchToken) return;
    if (!hits.length) {
      list.innerHTML = `<li><span class="place-search-detail">No places found</span></li>`;
      list.classList.remove("hidden");
      return;
    }
    list.innerHTML = hits
      .map(
        (hit, index) => `<li>
          <button type="button" data-search-index="${index}">
            <span class="place-search-name">${escapeHtml(hit.label)}</span>
            <span class="place-search-detail">${escapeHtml(hit.detail)}</span>
          </button>
        </li>`
      )
      .join("");
    list.classList.remove("hidden");
    list.querySelectorAll("[data-search-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hit = hits[Number(btn.dataset.searchIndex)];
        if (hit) pickSearchedPlace(hit);
      });
    });
  } catch {
    if (token !== searchToken) return;
    list.innerHTML = `<li><span class="place-search-detail">Search is busy. Try again or tap the map.</span></li>`;
    list.classList.remove("hidden");
  }
}

async function pickSearchedPlace(hit) {
  hidePlaceResults();
  const input = $("place-search");
  if (input) input.value = hit.label;
  const coords = { lat: hit.lat, lng: hit.lng };
  setPin(coords, searchRadiusKm(state));
  await onMapSelect(coords, hit.label);
}

function directionsUrl(place) {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
}

function fallbackCopy(kind) {
  if (kind === "widened") return "Nothing sat inside your radius. Closest same-theme stop nearby:";
  if (kind === "any-nearby") return "Nothing matched every filter. Nearby option instead:";
  if (kind === "empty") return "Nothing is inside that radius. Go back and widen it.";
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
  $("group-options").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group]");
    if (!btn) return;
    const groupSize = btn.dataset.group === state.groupSize ? null : btn.dataset.group;
    setState({ groupSize });
  });
  document.querySelectorAll("[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => pickTheme(btn.dataset.theme));
  });
  $("geo-btn").addEventListener("click", useMyLocation);
  $("place-search").addEventListener("input", (e) => {
    const query = e.target.value;
    clearTimeout(searchTimer);
    if (query.trim().length < 2) {
      hidePlaceResults();
      return;
    }
    searchTimer = setTimeout(() => runPlaceSearch(query), 350);
  });
  $("place-search").addEventListener("keydown", (e) => {
    if (e.key === "Escape") hidePlaceResults();
  });
  document.addEventListener("click", (e) => {
    const box = document.querySelector(".place-search");
    if (box && !box.contains(e.target)) hidePlaceResults();
  });
  $("radius-input").addEventListener("input", (e) => {
    const radiusKm = Number(e.target.value);
    state.radiusKm = radiusKm;
    persist();
    $("radius-value").textContent = String(radiusKm);
    if (state.coords) updateCircle(state.coords, travelPreviewKm());
    scheduleLandmarkRefresh();
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
  const screen = $(id);
  document.querySelectorAll(".screen").forEach((el) => {
    if (el !== screen) el.classList.remove("is-on", "is-entering");
  });
  if (!screen) return;
  if (screen.classList.contains("is-on")) return;
  screen.classList.add("is-on");
  void screen.offsetWidth;
  screen.classList.add("is-entering");
}

function renderGroupScreen() {
  const copy = groupCopyFor(state.theme);
  const box = $("group-options");
  const themeKey = state.theme || "";
  $("group-kicker").textContent = copy.kicker;
  $("group-heading").textContent = copy.heading;
  $("group-sub").textContent = copy.sub;
  if (box.dataset.theme === themeKey && box.childElementCount) return;
  box.dataset.theme = themeKey;
  box.innerHTML = copy.options
    .map(
      (option) => `
        <button type="button" data-group="${option.id}" class="w-full py-4 px-6 flex items-center gap-gutter border border-black bg-white hover:bg-surface-container text-left">
          <span class="material-symbols-outlined text-2xl">${option.icon}</span>
          <span class="flex flex-col">
            <span class="font-body-lg text-body-lg">${option.label}</span>
            <span class="font-label-sm text-label-sm text-on-surface-variant">${option.detail}</span>
          </span>
        </button>`
    )
    .join("");
}

function renderChoices() {
  renderGroupScreen();
  document.querySelectorAll("[data-group]").forEach((btn) => {
    btn.classList.toggle("is-picked", btn.dataset.group === state.groupSize);
  });
  document.querySelectorAll("[data-theme]").forEach((btn) => {
    const picked = btn.dataset.theme === state.theme;
    btn.classList.toggle("is-picked", picked);
    btn.setAttribute("aria-pressed", picked ? "true" : "false");
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
  const badge =
    place.rating != null ? `${place.rating}/5` : escapeHtml(place.osmType || "Live pin");
  const badgeIcon = place.rating != null ? "star" : "place";
  const name = escapeHtml(place.name);
  const blurb = escapeHtml(place.blurb || "");
  const area = escapeHtml(place.area || "");
  const cost = escapeHtml(place.costLabel || "Check on the spot");
  box.innerHTML = `
    <div class="flex flex-col gap-2 items-center text-center mt-4">
      <span class="material-symbols-outlined text-4xl text-neon-cyan" style="font-variation-settings: 'FILL' 1">celebration</span>
      <p class="font-label-bold text-label-bold text-slate-muted uppercase tracking-widest">Matched you with your perfect event</p>
      <h2 class="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg">${name}</h2>
      <p class="font-body-md text-on-surface-variant">${blurb}</p>
    </div>
    <div class="w-full h-40 md:h-52 border-2 border-black mt-4 mb-4 bg-electric-purple relative overflow-hidden">
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="font-headline-md text-white uppercase tracking-tight">${area}</span>
      </div>
      <div class="absolute top-2 left-2 bg-white border-2 border-black px-3 py-1 font-label-bold text-label-bold flex items-center gap-1 shadow-[4px_4px_0_#00FFFF]">
        <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1">${badgeIcon}</span>
        ${badge}
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
          <p class="font-body-md font-bold">${cost}</p>
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
    .map((stop) => `<li>${escapeHtml(stop.name)} (${escapeHtml(stop.area)})</li>`)
    .join("")}</ol>`;
}

function render() {
  const stepMap = {
    [STEPS.START]: "screen-start",
    [STEPS.INTENT]: "screen-intent",
    [STEPS.GROUP]: "screen-group",
    [STEPS.MAP]: "screen-map",
    [STEPS.RADIUS]: "screen-radius",
    [STEPS.BUDGET]: "screen-budget",
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
    const total = INPUT_STEPS.length;
    const n = state.step === STEPS.RESULT ? total : inputIndex() + 1;
    $("progress-label").textContent = `Step ${n} of ${total}`;
  }

  if (inFunnel) {
    $("back-btn").disabled = state.step === STEPS.INTENT && state.loopCount > 0;
    $("header-back").disabled = state.step === STEPS.INTENT && state.loopCount > 0;
    $("next-btn").disabled = !canAdvance();
    $("next-label").textContent = state.step === STEPS.BUDGET ? "Find match" : "Next";
  }

  $("intent-input").value = state.intent;
  $("radius-input").value = String(state.radiusKm);
  $("radius-value").textContent = String(state.radiusKm);
  $("budget-max").value = state.budgetMax ?? "";
  $("location-label").textContent = state.locationLabel || "No pin yet. Tap the map.";
  $("radius-location").textContent = state.locationLabel || "No pin yet";
  $("walk-cap-note").classList.toggle("hidden", state.transitMode !== "walk");
  $("baseline-note").classList.toggle("hidden", state.loopCount === 0);
  $("baseline-note").textContent =
    state.loopCount > 0
      ? `Keeping ${groupLabel(state.groupSize, state.theme)} near ${state.locationLabel || "your pin"}. Pick the next activity.`
      : "";

  renderChoices();
  syncThemeSlider();

  if (state.step !== STEPS.MAP) hidePlaceResults();

  if (state.step === STEPS.MAP || state.step === STEPS.RADIUS) {
    initMap("map", {
      coords: state.coords,
      radiusKm: state.step === STEPS.RADIUS ? travelPreviewKm() : state.radiusKm,
      onSelect: onMapSelect,
    });
    if (state.step === STEPS.RADIUS && state.coords) {
      setPin(state.coords, travelPreviewKm());
    }
    setTimeout(refreshMapSize, 50);
    scheduleLandmarkRefresh();
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
