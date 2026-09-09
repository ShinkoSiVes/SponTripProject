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
import { findMatch, distanceKm } from "./match.js";
import { intentKeywords } from "./intent.js";
import { fetchLandmarks, loadCatalog } from "./landmarks.js";
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
      });
    try {
      setLandmarks(ranked.slice(0, 24), state.match?.id);
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
  const top = places.slice(0, 6);
  box.innerHTML = `
    <div class="nearby-list-head">Nearby for your vibe</div>
    <ul class="nearby-list-items">
      ${top
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
      const place = top.find((p) => p.id === btn.dataset.nearbyId);
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

  const finish = (result, catalog = [], extra = {}) => {
    try {
      setLandmarks(catalog, result.place?.id);
    } catch {
      // Map is often hidden on the result screen; never block the match.
    }
    const { statePatch = {}, autoWidenedTo } = extra;
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
    const catalog = await Promise.race([
      loadCatalog(state),
      new Promise((_, reject) => setTimeout(() => reject(new Error("match deadline")), 12000)),
    ]);

    let result = findMatch(state, catalog);
    if (result.place) {
      finish(result, catalog);
      return;
    }

    // Soft local widen before showing empty (no extra API spam).
    if (catalog.length) {
      let radiusKm = Number(state.radiusKm) || 8;
      for (let i = 0; i < 20 && radiusKm < 80; i += 1) {
        radiusKm = Math.min(80, radiusKm + 1);
        result = findMatch({ ...state, radiusKm }, catalog);
        if (result.place) {
          finish(result, catalog, {
            autoWidenedTo: radiusKm,
            statePatch: { radiusKm },
          });
          return;
        }
      }
    }

    finish({ place: null, fallback: "empty", alternatives: [] }, catalog);
  } catch {
    try {
      const result = findMatch(state, PLACES);
      finish(result, []);
    } catch {
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
    if (state.coords) updateCircle(state.coords, searchRadiusKm(state));
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

function pickDifferentLocation() {
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
  if (status) status.textContent = "Loading Google places…";

  const maxKm = 80;
  const fetchRadius = Math.min(maxKm, Math.max(Number(state.radiusKm) || 8, 20));

  try {
    const catalog = await Promise.race([
      loadCatalog({ ...state, radiusKm: fetchRadius }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("widen deadline")), 10000)),
    ]);

    if (!catalog.length) {
      if (note) note.textContent = "No live places came back. Try another pin.";
      if (status) status.textContent = "Nearby search returned 0 places.";
      return;
    }

    const trial = { ...state, radiusKm: fetchRadius };
    const result = findMatch(trial, catalog);
    if (!result.place) {
      if (note) note.textContent = "Places loaded, but none could be scored.";
      if (status) status.textContent = `${catalog.length} spots found, none usable.`;
      return;
    }

    const usedKm = Math.max(
      1,
      Math.ceil((result.place.distanceKm || distanceKm(state.coords, result.place) || fetchRadius) * 10) / 10
    );
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
    note.textContent = fallbackCopy(state.matchMeta?.fallback);
    if (mapWrap) mapWrap.classList.add("hidden");
    copy.innerHTML = "";
    body.innerHTML = `
      <div class="flex flex-col gap-4 items-stretch text-left">
        <p class="font-body-md text-center">No place could be matched near your pin.</p>
        <p id="widen-status" class="font-label-sm text-label-sm text-blush-ink text-center uppercase tracking-wider">
          Current radius: ${Number(state.radiusKm) || 8} km
        </p>
        <button id="widen-radius-btn" class="w-full bg-neon-cyan border-2 border-black shadow-[4px_4px_0_#000] font-label-bold text-label-bold uppercase py-4 px-6 flex justify-center items-center gap-2 hover:bg-electric-purple hover:text-on-surface" type="button">
          <span class="material-symbols-outlined">zoom_out_map</span>
          Increase radius automatically
        </button>
        <button id="pick-location-btn" class="w-full bg-white border-2 border-black shadow-[4px_4px_0_#000] font-label-bold text-label-bold uppercase py-4 px-6 flex justify-center items-center gap-2 hover:bg-surface-container" type="button">
          <span class="material-symbols-outlined">edit_location_alt</span>
          Pick a different location
        </button>
      </div>
    `;
    $("widen-radius-btn").onclick = () => autoWidenAndRematch();
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
    <div class="flex flex-col gap-2 items-center text-center mt-1">
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
    <div class="grid grid-cols-2 gap-4 mb-4 mt-2">
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
    $("next-label").textContent = state.step === STEPS.BUDGET ? "Find match" : "Next";
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
