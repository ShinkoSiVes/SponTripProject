const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = { Accept: "application/json" };

function shortLabel(hit) {
  const address = hit.address || {};
  return (
    hit.name ||
    address.suburb ||
    address.city_district ||
    address.city ||
    address.town ||
    hit.display_name?.split(",").slice(0, 2).join(",") ||
    "Pinned place"
  );
}

export async function reverseLabel(coords) {
  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    return shortLabel(data) || `Pin ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  } catch {
    return `Pin ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  }
}

export async function searchLocations(query) {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    format: "jsonv2",
    q,
    limit: "6",
    addressdetails: "1",
  });

  const res = await fetch(`${NOMINATIM}/search?${params}`, { headers: HEADERS });
  if (!res.ok) throw new Error("search failed");
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((hit) => ({
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    label: shortLabel(hit),
    detail: hit.display_name,
  }));
}
