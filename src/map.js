const WORLD_VIEW = [20, 0];

let map;
let marker;
let circle;
let poiLayer;
let onPin;
let activeRadiusKm = 8;

export function initMap(containerId, { coords, radiusKm, onSelect, showCircle = true }) {
  const el = document.getElementById(containerId);
  if (!el) return;

  activeRadiusKm = radiusKm;
  onPin = onSelect || null;

  if (map) {
    map.invalidateSize();
    setPin(coords, radiusKm, { showCircle });
    return;
  }

  map = L.map(el, { zoomControl: true }).setView(
    coords ? [coords.lat, coords.lng] : WORLD_VIEW,
    coords ? 14 : 2
  );

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  poiLayer = L.layerGroup().addTo(map);

  map.on("click", (event) => {
    if (!onPin) return;
    const next = { lat: event.latlng.lat, lng: event.latlng.lng };
    setPin(next, activeRadiusKm);
    onPin(next);
  });

  setPin(coords, radiusKm, { showCircle });
  requestAnimationFrame(() => map.invalidateSize());
}

function syncMarkerDrag() {
  if (!marker?.dragging) return;
  if (onPin) marker.dragging.enable();
  else marker.dragging.disable();
}

export function setPin(coords, radiusKm, { showCircle = true } = {}) {
  if (!map) return;
  if (radiusKm != null) activeRadiusKm = radiusKm;

  if (!coords) {
    if (marker) {
      map.removeLayer(marker);
      marker = null;
    }
    if (circle) {
      map.removeLayer(circle);
      circle = null;
    }
    return;
  }

  const latlng = [coords.lat, coords.lng];

  if (!marker) {
    marker = L.marker(latlng, { draggable: Boolean(onPin) }).addTo(map);
    marker.on("dragend", () => {
      if (!onPin) return;
      const pos = marker.getLatLng();
      const next = { lat: pos.lat, lng: pos.lng };
      updateCircle(next, activeRadiusKm);
      onPin(next);
    });
  } else {
    marker.setLatLng(latlng);
  }
  syncMarkerDrag();

  if (showCircle) {
    updateCircle(coords, activeRadiusKm);
  } else if (circle) {
    map.removeLayer(circle);
    circle = null;
  }
  map.panTo(latlng);
}

export function updateCircle(coords, radiusKm) {
  if (!map || !coords) return;
  const meters = Math.max(0.5, radiusKm) * 1000;

  if (!circle) {
    circle = L.circle([coords.lat, coords.lng], {
      radius: meters,
      color: "#000000",
      weight: 2,
      fillColor: "#A8E4DC",
      fillOpacity: 0.18,
    }).addTo(map);
  } else {
    circle.setLatLng([coords.lat, coords.lng]);
    circle.setRadius(meters);
  }
}

export function refreshMapSize() {
  if (map) map.invalidateSize();
}

export function focusPlaces(points, maxZoom = 16) {
  if (!map || !points?.length) return;
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!valid.length) return;
  try {
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], Math.min(maxZoom, 16), { animate: false });
      return;
    }
    const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds.pad(0.28), { maxZoom, animate: false });
  } catch {
    // Ignore invalid bounds.
  }
}

export function setLandmarks(places, highlightId, { fit = true } = {}) {
  if (!map) return;
  if (!poiLayer) poiLayer = L.layerGroup().addTo(map);
  poiLayer.clearLayers();
  const list = places || [];
  list.forEach((place) => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
    const picked = place.id === highlightId;
    const dot = L.circleMarker([place.lat, place.lng], {
      radius: picked ? 10 : 7,
      color: "#000000",
      weight: 2,
      fillColor: picked ? "#E8B5AB" : "#A8E4DC",
      fillOpacity: 0.92,
    });
    const tip = place.rating
      ? `${place.name} · ${place.rating.toFixed(1)}★`
      : place.name;
    dot.bindTooltip(tip, { direction: "top", offset: [0, -8] });
    poiLayer.addLayer(dot);
  });
  poiLayer.bringToFront();
  if (marker) marker.bringToFront();

  if (!fit) return;
  const container = map.getContainer?.();
  const mapVisible = container && container.offsetParent && container.clientWidth > 0;
  if (marker && list.length && mapVisible) {
    try {
      const bounds = L.latLngBounds([marker.getLatLng()]);
      list.slice(0, 12).forEach((place) => {
        if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
          bounds.extend([place.lat, place.lng]);
        }
      });
      map.fitBounds(bounds.pad(0.2), { maxZoom: 15, animate: false });
    } catch {
      // Don't block matching if the map is hidden or bounds are invalid.
    }
  }
}

export function clearLandmarks() {
  if (poiLayer) poiLayer.clearLayers();
}

