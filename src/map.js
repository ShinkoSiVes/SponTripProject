const MAKATI = [14.5547, 121.0244];

let map;
let marker;
let circle;
let poiLayer;
let onPin;
let activeRadiusKm = 8;

export function initMap(containerId, { coords, radiusKm, onSelect }) {
  const el = document.getElementById(containerId);
  if (!el) return;

  activeRadiusKm = radiusKm;
  onPin = onSelect;

  if (map) {
    map.invalidateSize();
    setPin(coords, radiusKm);
    return;
  }

  map = L.map(el, { zoomControl: true }).setView(coords ? [coords.lat, coords.lng] : MAKATI, 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  poiLayer = L.layerGroup().addTo(map);

  map.on("click", (event) => {
    const next = { lat: event.latlng.lat, lng: event.latlng.lng };
    setPin(next, activeRadiusKm);
    if (onPin) onPin(next);
  });

  setPin(coords, radiusKm);
  requestAnimationFrame(() => map.invalidateSize());
}

export function setPin(coords, radiusKm) {
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
    marker = L.marker(latlng, { draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      const next = { lat: pos.lat, lng: pos.lng };
      updateCircle(next, activeRadiusKm);
      if (onPin) onPin(next);
    });
  } else {
    marker.setLatLng(latlng);
  }

  updateCircle(coords, activeRadiusKm);
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
      fillColor: "#00FFFF",
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

export function setLandmarks(places, highlightId) {
  if (!map) return;
  if (!poiLayer) poiLayer = L.layerGroup().addTo(map);
  poiLayer.clearLayers();
  (places || []).forEach((place) => {
    const picked = place.id === highlightId;
    const dot = L.circleMarker([place.lat, place.lng], {
      radius: picked ? 10 : 7,
      color: "#000000",
      weight: 2,
      fillColor: picked ? "#9D00FF" : "#00FFFF",
      fillOpacity: 0.92,
    });
    dot.bindTooltip(place.name, { direction: "top", offset: [0, -8] });
    poiLayer.addLayer(dot);
  });
  poiLayer.bringToFront();
  if (marker) marker.bringToFront();
}

export function clearLandmarks() {
  if (poiLayer) poiLayer.clearLayers();
}

export function destroyMap() {
  if (map) {
    map.remove();
    map = null;
    marker = null;
    circle = null;
    poiLayer = null;
  }
}
