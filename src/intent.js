export function intentKeywords(intent) {
  if (!intent) return [];
  return String(intent)
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
}

export function intentQuery(intent) {
  return intentKeywords(intent).join(" ").trim();
}
