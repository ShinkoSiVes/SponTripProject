import "./styles.css";
import {
  STEPS,
  INPUT_STEPS,
  saveState,
  clearState,
  emptyState,
  baselineForNextActivity,
  searchRadiusKm,
} from "./state.js";
import { findMatch, distanceKm } from "./match.js";
import { intentKeywords } from "./intent.js";
import { fetchLandmarks, loadCatalog, peekCachedLandmarks } from "./landmarks.js";
import { PLACES } from "./places.js";
import { reverseLabel, searchLocations } from "./geocode.js";
import { initMap, setPin, updateCircle, refreshMapSize, setLandmarks, clearLandmarks, focusPlaces } from "./map.js";
import { groupCopyFor, groupFitsTheme, groupLabel } from "./groups.js";
import { hasFoursquarePlaces } from "./foursquare.js";
import { hasGooglePlaces } from "./googlePlaces.js";

function nearbyProviderLabel() {
  if (hasGooglePlaces()) return "Google";
  if (hasFoursquarePlaces()) return "Foursquare";
  return "OpenStreetMap";
}

function hasPlacesApiKey() {
  return hasGooglePlaces() || hasFoursquarePlaces();
}

clearState();
let state = emptyState();

let landmarkToken = 0;
let landmarkTimer = null;
let searchTimer = null;
let searchToken = 0;
let lastNearbyPlaces = [];
let previousMatchId = null;
let resumeMatchAfterRadius = false;
let resumeMatchAfterLocation = false;
const skippedPlaceIds = new Set();
const skippedPlaceNames = new Set();

function skipName(place) {
  return String(place?.name || "").trim().toLowerCase();
}

function rememberSkip(place) {
  if (place?.id) skippedPlaceIds.add(place.id);
  const name = skipName(place);
  if (name) skippedPlaceNames.add(name);
}

function isSkipped(place) {
  if (!place) return true;
  if (place.id && skippedPlaceIds.has(place.id)) return true;
  const name = skipName(place);
  return Boolean(name && skippedPlaceNames.has(name));
}

function clearSkipped() {
  skippedPlaceIds.clear();
  skippedPlaceNames.clear();
}

function matchExclude() {
  return { ids: [...skippedPlaceIds], names: [...skippedPlaceNames] };
}

function updateLandmarkStatus(text) {
  const mapStatus = $("landmark-status");
  const radiusStatus = $("radius-landmark-status");
  if (mapStatus) mapStatus.textContent = text;
  if (radiusStatus) radiusStatus.textContent = text;
}

async function refreshLandmarks() {
  if (!state.coords || !state.theme) {
    lastNearbyPlaces = [];
    clearLandmarks();
    renderNearbyList([]);
    updateLandmarkStatus("");
    return;
  }
  const token = ++landmarkToken;
  updateLandmarkStatus(`Finding nearby places with ${nearbyProviderLabel()}…`);
  try {
    const places = await fetchLandmarks(state);
    if (token !== landmarkToken) return;
    const ranked = [...places]
      .map((place) => ({
        ...place,
        distanceKm:
          place.distanceKm != null
            ? place.distanceKm
            : distanceKm(state.coords, place),
      }))
      .sort((a, b) => {
        const words = intentKeywords(state.intent);
        if (words.length) {
          const hay = (p) => `${p.name} ${p.blurb} ${(p.tags || []).join(" ")}`.toLowerCase();
          const hits = (p) => words.reduce((n, w) => n + (hay(p).includes(w) ? 1 : 0), 0);
          const d = hits(b) - hits(a);
          if (d) return d;
        }
        return a.distanceKm - b.distanceKm;
      })
      .filter((place) => !isSkipped(place));
    lastNearbyPlaces = ranked;
    try {
      setLandmarks(ranked, state.match?.id);
    } catch {
      // Dots are optional; the list below the map still shows.
    }
    renderNearbyList(ranked);
    const sourceLabel =
      ranked[0]?.source === "google"
        ? "Google"
        : ranked[0]?.source === "foursquare"
          ? "Foursquare"
          : ranked[0]?.source === "backup"
            ? "backup list"
            : "OpenStreetMap";
    updateLandmarkStatus(
      ranked.length
        ? `${ranked.length} nearby ${state.theme} spots from ${sourceLabel}`
        : "No mapped spots yet for this vibe. Try widening the radius."
    );
  } catch (err) {
    if (token !== landmarkToken) return;
    lastNearbyPlaces = [];
    clearLandmarks();
    renderNearbyList([]);
    const msg = String(err?.message || "");
    if (/credits remaining|429|401|403/i.test(msg)) {
      updateLandmarkStatus("Foursquare is blocked (credits/auth). Falling back…");
    } else {
      updateLandmarkStatus("Live nearby search is busy. Try again in a moment.");
    }
  }
}

function renderNearbyList(places) {
  const box = $("nearby-list");
  if (!box) return;
  if (!places?.length) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }
  box.innerHTML = `
    <div class="nearby-list-head">Nearby for your vibe</div>
    <ul class="nearby-list-items">
      ${places
        .map((place) => {
          const rating =
            place.rating != null && Number.isFinite(place.rating)
              ? `<span class="nearby-rating">${place.rating.toFixed(1)}★${
                  place.ratingCount ? ` (${place.ratingCount})` : ""
                }</span>`
              : "";
          const dist =
            place.distanceKm != null && Number.isFinite(place.distanceKm)
              ? `<span class="nearby-dist">${place.distanceKm.toFixed(1)} km</span>`
              : "";
          return `<li>
            <button type="button" class="nearby-item" data-nearby-id="${escapeHtml(place.id)}">
              <span class="nearby-name">${escapeHtml(place.name)}</span>
              <span class="nearby-meta">${escapeHtml(place.area)}${rating ? " · " : ""}${rating}${
            dist ? ` · ${dist}` : ""
          }</span>
              <span class="nearby-blurb">${escapeHtml(place.blurb || "")}</span>
            </button>
          </li>`;
        })
        .join("")}
    </ul>
  `;
  box.classList.remove("hidden");
  box.querySelectorAll("[data-nearby-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const place = places.find((p) => p.id === btn.dataset.nearbyId);
      if (!place) return;
      setPin({ lat: place.lat, lng: place.lng }, searchRadiusKm(state));
      setLandmarks(places, place.id);
    });
  });
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
    lastNearbyPlaces = [];
    previousMatchId = null;
    resumeMatchAfterRadius = false;
    resumeMatchAfterLocation = false;
    clearSkipped();
    setState({ theme: null, match: null, matchMeta: null });
    return;
  }
  slidingTheme = null;
  themeSlideIndex = 0;
  const groupSize = groupFitsTheme(state.groupSize, theme) ? state.groupSize : null;
  lastNearbyPlaces = [];
  previousMatchId = null;
  resumeMatchAfterRadius = false;
  resumeMatchAfterLocation = false;
  clearSkipped();
  setState({ theme, groupSize, match: null, matchMeta: null });
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
      return state.radiusKm >= 0.5;
    case STEPS.BUDGET:
      return Boolean(state.budget) || (state.budgetMax != null && state.budgetMax > 0);
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
  if (state.step === STEPS.RADIUS && resumeMatchAfterRadius) {
    resumeMatchAfterRadius = false;
    lastNearbyPlaces = [];
    return runMatch();
  }
  if (state.step === STEPS.MAP && resumeMatchAfterLocation) {
    resumeMatchAfterLocation = false;
    lastNearbyPlaces = [];
    return runMatch();
  }
  const following = nextInputStep(state.step);
  if (following) return go(following);
  if (INPUT_STEPS.includes(state.step)) return runMatch();
}

function back() {
  if (state.step === STEPS.INTENT) {
    if (state.loopCount > 0) return;
    return go(STEPS.START);
  }
  if (state.step === STEPS.RESULT) {
    previousMatchId = state.match?.id || previousMatchId;
    return setState({ step: STEPS.BUDGET, match: null, matchMeta: null });
  }
  if (state.step === STEPS.LOOP) return go(STEPS.RESULT);
  if (state.step === STEPS.RADIUS && resumeMatchAfterRadius) {
    resumeMatchAfterRadius = false;
    return showSkipExhausted();
  }
  if (state.step === STEPS.MAP && resumeMatchAfterLocation) {
    resumeMatchAfterLocation = false;
    return showSkipExhausted();
  }
  const previous = prevInputStep(state.step);
  if (previous) go(previous);
}

function preferFreshMatch(result) {
  if (!result?.place || !previousMatchId || result.place.id !== previousMatchId) return result;
  const nextPlace = result.alternatives?.[0];
  if (!nextPlace) return result;
  return {
    ...result,
    place: nextPlace,
    alternatives: [...result.alternatives.slice(1), result.place],
  };
}

function placesForMatch() {
  const seen = new Set();
  const merged = [];
  for (const place of [...lastNearbyPlaces, ...peekCachedLandmarks(state)]) {
    const key = place.id || String(place.name || "").toLowerCase();
    if (!key || seen.has(key) || isSkipped(place)) continue;
    seen.add(key);
    merged.push(place);
  }
  return merged;
}

async function runMatch() {
  const btn = $("next-btn");
  const label = $("next-label");
  if (btn) {
    btn.disabled = true;
    if (label) label.textContent = "Finding...";
  }

  const finish = (result, catalog = [], extra = {}) => {
    try {
      setLandmarks(catalog, result.place?.id);
    } catch {
      // Map is often hidden on the result screen; never block the match.
    }
    const { statePatch = {}, autoWidenedTo } = extra;
    if (result.place?.id) previousMatchId = result.place.id;
    setState({
      step: STEPS.RESULT,
      match: result.place,
      matchMeta: {
        fallback: result.fallback,
        alternatives: result.alternatives,
        ...(autoWidenedTo != null ? { autoWidenedTo } : {}),
      },
      ...statePatch,
    });
  };

  try {
    let catalog = placesForMatch();
    if (!catalog.length) {
      catalog = await loadCatalog(state);
    }

    let result = preferFreshMatch(findMatch(state, catalog, matchExclude()));
    if (result.place) {
      finish(result, catalog);
      return;
    }

    if (!lastNearbyPlaces.length) {
      catalog = await loadCatalog(state);
      result = preferFreshMatch(findMatch(state, catalog, matchExclude()));
      if (result.place) {
        finish(result, catalog);
        return;
      }
    }

    // Soft local widen before showing empty (no extra API spam).
    // If the user already skipped every remaining spot, let them choose
    // to widen the radius or pick a new pin instead of auto-jumping.
    const stillOpen = catalog.some((place) => !isSkipped(place));
    if (stillOpen) {
      let radiusKm = Number(state.radiusKm) || 8;
      for (let i = 0; i < 20 && radiusKm < 80; i += 1) {
        radiusKm = Math.min(80, radiusKm + 1);
        result = preferFreshMatch(findMatch({ ...state, radiusKm }, catalog, matchExclude()));
        if (result.place) {
          finish(result, catalog, {
            autoWidenedTo: radiusKm,
            statePatch: { radiusKm },
          });
          return;
        }
      }
    }

    finish({ place: null, fallback: skippedPlaceIds.size ? "skipped" : "empty", alternatives: [] }, catalog);
  } catch {
    const catalog = placesForMatch();
    const result = preferFreshMatch(findMatch(state, catalog.length ? catalog : PLACES, matchExclude()));
    finish(result, catalog);
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
  lastNearbyPlaces = [];
  previousMatchId = null;
  resumeMatchAfterRadius = false;
  resumeMatchAfterLocation = false;
  clearSkipped();
  state = emptyState();
  persist();
  render();
}

async function onMapSelect(coords, knownLabel) {
  lastNearbyPlaces = [];
  previousMatchId = null;
  clearSkipped();
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
    const hits = await searchLocations(query, state.coords);
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
  if (kind === "budget-flex") return "Closest fit was one step above your budget pick:";
  if (kind === "empty" && !hasPlacesApiKey()) {
    return "No API key is set. Live nearby search is off.";
  }
  if (kind === "skipped") return "You skipped every nearby option.";
  if (kind === "empty") return "Nothing is inside that radius. Go back and widen it.";
  if (kind === "no-pin") return "Drop a pin first so we can match a place.";
  return "";
}

function bindOnce() {
  $("start-btn").addEventListener("click", () => go(STEPS.INTENT));
  $("intent-input").addEventListener("input", (e) => {
    const intent = e.target.value;
    if (intent !== state.intent) {
      lastNearbyPlaces = [];
      previousMatchId = null;
      clearSkipped();
    }
    state.intent = intent;
    persist();
    $("next-btn").disabled = !canAdvance();
  });
  $("group-options").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group]");
    if (!btn) return;
    const groupSize = btn.dataset.group === state.groupSize ? null : btn.dataset.group;
    setState({ groupSize, match: null, matchMeta: null });
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
    if (state.coords) updateCircle(state.coords, searchRadiusKm(state));
    scheduleLandmarkRefresh();
  });
  document.querySelectorAll("[data-budget]").forEach((btn) => {
    btn.addEventListener("click", () =>
      setState({ budget: btn.dataset.budget, budgetMax: null, match: null, matchMeta: null })
    );
  });
  $("budget-max").addEventListener("input", (e) => {
    const value = e.target.value === "" ? null : Number(e.target.value);
    state.budgetMax = value;
    if (value) state.budget = null;
    state.match = null;
    state.matchMeta = null;
    persist();
    $("next-btn").disabled = !canAdvance();
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
}

function spinAgain() {
  rememberSkip(state.match);
  const alts = (state.matchMeta?.alternatives || []).filter((place) => !isSkipped(place));
  if (!alts.length) return showSkipExhausted();
  const nextPlace = alts[0];
  setState({
    match: nextPlace,
    matchMeta: { ...state.matchMeta, alternatives: alts.slice(1), fallback: "reroll" },
  });
}

function showSkipExhausted() {
  setState({
    step: STEPS.RESULT,
    match: null,
    matchMeta: { fallback: "skipped", alternatives: [] },
  });
}

function goIncreaseRadius() {
  resumeMatchAfterLocation = false;
  resumeMatchAfterRadius = true;
  lastNearbyPlaces = [];
  const current = Number(state.radiusKm) || 8;
  const radiusKm = current >= 80 ? 80 : Math.min(80, Math.round((current + 5) * 2) / 2);
  setState({
    step: STEPS.RADIUS,
    match: null,
    matchMeta: null,
    radiusKm,
  });
}

function pickDifferentLocation() {
  resumeMatchAfterRadius = false;
  resumeMatchAfterLocation = true;
  lastNearbyPlaces = [];
  setState({
    step: STEPS.MAP,
    match: null,
    matchMeta: null,
  });
}

async function autoWidenAndRematch() {
  const note = $("result-note");
  const widenBtn = $("widen-radius-btn");
  const locationBtn = $("pick-location-btn");
  const status = $("widen-status");

  if (widenBtn) widenBtn.disabled = true;
  if (locationBtn) locationBtn.disabled = true;
  if (note) note.textContent = "Searching nearby places…";
  if (status) {
    status.textContent = hasPlacesApiKey()
      ? "Loading Google places…"
      : "No API key is set. Trying OpenStreetMap…";
  }

  const maxKm = 80;
  const fetchRadius = Math.min(maxKm, Math.max(Number(state.radiusKm) || 8, 20));
  const trial = { ...state, radiusKm: fetchRadius };

  try {
    const local = placesForMatch();
    if (local.length) {
      const localResult = preferFreshMatch(findMatch(trial, local, matchExclude()));
      if (localResult.place) {
        const usedKm = Math.max(
          1,
          Math.ceil(
            (localResult.place.distanceKm ||
              distanceKm(state.coords, localResult.place) ||
              fetchRadius) * 10
          ) / 10
        );
        if (localResult.place?.id) previousMatchId = localResult.place.id;
        setState({
          step: STEPS.RESULT,
          radiusKm: Math.min(maxKm, usedKm),
          match: localResult.place,
          matchMeta: {
            fallback: localResult.fallback || "widened",
            alternatives: localResult.alternatives,
            autoWidenedTo: usedKm,
          },
        });
        return;
      }
    }

    const catalog = await loadCatalog({ ...state, radiusKm: fetchRadius });

    if (!catalog.length) {
      if (!hasPlacesApiKey()) {
        if (note) note.textContent = "No API key is set. Live nearby search is off.";
        if (status) status.textContent = "Add a Google Places key, or try a different pin.";
      } else {
        if (note) note.textContent = "No live places came back. Try another pin.";
        if (status) status.textContent = "Nearby search returned 0 places.";
      }
      return;
    }

    const result = preferFreshMatch(findMatch(trial, catalog, matchExclude()));
    if (!result.place) {
      if (note) note.textContent = "Places loaded, but none could be scored.";
      if (status) status.textContent = `${catalog.length} spots found, none usable.`;
      return;
    }

    const usedKm = Math.max(
      1,
      Math.ceil((result.place.distanceKm || distanceKm(state.coords, result.place) || fetchRadius) * 10) / 10
    );
    if (result.place?.id) previousMatchId = result.place.id;
    setState({
      step: STEPS.RESULT,
      radiusKm: Math.min(maxKm, usedKm),
      match: result.place,
      matchMeta: {
        fallback: result.fallback || "widened",
        alternatives: result.alternatives,
        autoWidenedTo: usedKm,
      },
    });
  } catch {
    if (note) note.textContent = "Search timed out. Try a different location.";
    if (status) status.textContent = "Could not finish the nearby search.";
  } finally {
    if (widenBtn) widenBtn.disabled = false;
    if (locationBtn) locationBtn.disabled = false;
  }
}

function renderResult() {
  const place = state.match;
  const copy = $("result-copy");
  const body = $("result-body");
  const note = $("result-note");
  const mapWrap = $("result-map-wrap");
  const caption = $("result-map-caption");
  const badgeEl = $("result-map-badge");
  if (!copy || !body) return;

  if (!place) {
    const noKey = !hasPlacesApiKey();
    note.textContent = fallbackCopy(state.matchMeta?.fallback);
    if (mapWrap) mapWrap.classList.add("hidden");
    copy.innerHTML = "";
    const skippedOut = Boolean(skippedPlaceIds.size || skippedPlaceNames.size);
    const emptyLead = noKey
      ? `<p class="font-body-md text-center">No API key is set, so live nearby search is off. OpenStreetMap and the backup list could not match a place near this pin.</p>
        <p class="font-label-sm text-label-sm text-blush-ink text-center uppercase tracking-wider">Add VITE_GOOGLE_MAPS_API_KEY in .env or Vercel, then restart / redeploy.</p>`
      : skippedOut
        ? `<p class="font-body-md text-center">You skipped every nearby match. Increase the radius to look farther, or select a different location.</p>`
      : `<p class="font-body-md text-center">No place could be matched near your pin.</p>`;
    body.innerHTML = `
      <div class="flex flex-col gap-4 items-stretch text-left">
        ${emptyLead}
        <p id="widen-status" class="font-label-sm text-label-sm text-blush-ink text-center uppercase tracking-wider">
          Current radius: ${Number(state.radiusKm) || 8} km
        </p>
        <button id="widen-radius-btn" class="w-full bg-neon-cyan border-2 border-black shadow-[4px_4px_0_#000] font-label-bold text-label-bold uppercase py-4 px-6 flex justify-center items-center gap-2 hover:bg-electric-purple hover:text-on-surface" type="button">
          <span class="material-symbols-outlined">zoom_out_map</span>
          ${skippedOut ? "Increase radius" : "Increase radius automatically"}
        </button>
        <button id="pick-location-btn" class="w-full bg-white border-2 border-black shadow-[4px_4px_0_#000] font-label-bold text-label-bold uppercase py-4 px-6 flex justify-center items-center gap-2 hover:bg-surface-container" type="button">
          <span class="material-symbols-outlined">edit_location_alt</span>
          Select different location
        </button>
      </div>
    `;
    $("widen-radius-btn").onclick = skippedOut ? goIncreaseRadius : autoWidenAndRematch;
    $("pick-location-btn").onclick = () => pickDifferentLocation();
    return;
  }

  const widenNote =
    state.matchMeta?.autoWidenedTo != null
      ? ` Found after widening to ${state.matchMeta.autoWidenedTo} km.`
      : "";
  note.textContent = `${fallbackCopy(state.matchMeta?.fallback)}${widenNote}`.trim();
  const dist = place.distanceKm != null ? `${place.distanceKm.toFixed(1)} km` : "Nearby";
  const badge =
    place.rating != null ? `${place.rating}/5` : escapeHtml(place.osmType || "Live pin");
  const badgeIcon = place.rating != null ? "star" : "place";
  const name = escapeHtml(place.name);
  const blurb = escapeHtml(place.blurb || "");
  const area = escapeHtml(place.area || "");
  const cost = escapeHtml(place.costLabel || "Check on the spot");

  copy.innerHTML = `
    <div class="flex flex-col items-center text-center">
      <span class="material-symbols-outlined text-4xl text-neon-cyan" style="font-variation-settings: 'FILL' 1">celebration</span>
      <p class="font-label-bold text-label-bold text-slate-muted uppercase tracking-widest">Matched you with your perfect event</p>
      <h2 class="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg">${name}</h2>
      <p class="font-body-md text-on-surface-variant">${blurb}</p>
    </div>
  `;
  if (mapWrap) mapWrap.classList.remove("hidden");
  if (caption) caption.textContent = area || "Matched stop";
  if (badgeEl) {
    badgeEl.classList.remove("hidden");
    badgeEl.innerHTML = `<span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1">${badgeIcon}</span>${badge}`;
  }
  body.innerHTML = `
    <div class="result-stats grid grid-cols-2 gap-4">
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
    <a href="${directionsUrl(place)}" target="_blank" rel="noreferrer" class="w-full bg-neon-cyan text-on-surface font-headline-md text-headline-md border-2 border-black py-4 shadow-[4px_4px_0_#000] hover:bg-electric-purple hover:text-on-surface flex justify-center items-center gap-2">
      <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1">navigation</span>
      Instant Directions
    </a>
    <button id="spin-again" class="w-full bg-white font-label-bold text-label-bold underline decoration-2 underline-offset-4" type="button">
      Not feeling it? Spin again
    </button>
    <button id="to-loop" class="w-full bg-white border-2 border-black font-label-bold text-label-bold uppercase py-3 shadow-[4px_4px_0_#000]" type="button">
      Continue
    </button>
  `;
  $("to-loop").onclick = () => go(STEPS.LOOP);
  $("spin-again").onclick = spinAgain;
}

function showResultMap() {
  const slot = $("result-map-slot");
  const mapPanel = $("map-panel");
  const place = state.match;
  if (!slot || !mapPanel || !place) return;

  slot.appendChild(mapPanel);
  mapPanel.classList.remove("hidden");
  initMap("map", {
    coords: state.coords || place,
    radiusKm: searchRadiusKm(state),
    onSelect: null,
    showCircle: false,
  });
  setLandmarks([place], place.id, { fit: false });
  const points = [];
  if (state.coords) points.push(state.coords);
  if (place.lat != null && place.lng != null) points.push(place);
  setTimeout(() => {
    refreshMapSize();
    focusPlaces(points, 16);
  }, 50);
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

  if (state.step !== STEPS.RESULT) {
    const copy = $("result-copy");
    const body = $("result-body");
    const note = $("result-note");
    if (copy) copy.innerHTML = "";
    if (body) body.innerHTML = "";
    if (note) note.textContent = "";
  }

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
  } else if (state.step === STEPS.RESULT && state.match) {
    const resultSlot = $("result-map-slot");
    if (resultSlot) {
      resultSlot.appendChild(mapPanel);
      mapPanel.classList.remove("hidden");
    }
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
    $("next-label").textContent =
      state.step === STEPS.BUDGET ||
      (state.step === STEPS.RADIUS && resumeMatchAfterRadius) ||
      (state.step === STEPS.MAP && resumeMatchAfterLocation)
        ? "Find match"
        : "Next";
  }

  $("intent-input").value = state.intent;
  $("radius-input").value = String(state.radiusKm);
  $("radius-value").textContent = String(state.radiusKm);
  $("budget-max").value = state.budgetMax ?? "";
  const budgetApiNote = $("budget-api-note");
  if (budgetApiNote) {
    budgetApiNote.classList.toggle("hidden", hasPlacesApiKey());
  }
  $("location-label").textContent = state.locationLabel || "No pin yet. Tap the map.";
  $("radius-location").textContent = state.locationLabel || "No pin yet";
  $("baseline-note").classList.toggle("hidden", state.loopCount === 0);
  $("baseline-note").textContent =
    state.loopCount > 0
      ? `Keeping ${groupLabel(state.groupSize, state.theme)} near ${state.locationLabel || "your pin"}. Pick the next activity.`
      : "";

  renderChoices();
  syncThemeSlider();

  if (state.step !== STEPS.MAP) {
    hidePlaceResults();
    renderNearbyList([]);
  }

  if (state.step === STEPS.MAP || state.step === STEPS.RADIUS) {
    initMap("map", {
      coords: state.coords,
      radiusKm: searchRadiusKm(state),
      onSelect: onMapSelect,
      showCircle: true,
    });
    if (state.step === STEPS.RADIUS && state.coords) {
      setPin(state.coords, searchRadiusKm(state), { showCircle: true });
    }
    setTimeout(refreshMapSize, 50);
    scheduleLandmarkRefresh();
  }

  if (state.step === STEPS.RESULT) {
    renderResult();
    if (state.match) showResultMap();
  }

  if (state.step === STEPS.LOOP || state.step === STEPS.THANKS) {
    renderItinerary($("loop-itinerary"), state.step === STEPS.LOOP ? state.match : null);
    renderItinerary($("final-itinerary"));
  }
}

bindOnce();
render();
