const GROUP_COPY = {
  food: {
    kicker: "FOOD TRIP",
    heading: "Who are you eating with?",
    sub: "Solo kainan, a small table, or a full barkada.",
    options: [
      { id: "1", icon: "person", label: "Solo", detail: "Just you" },
      { id: "2-4", icon: "group", label: "Small table", detail: "2–4 friends" },
      { id: "5+", icon: "groups", label: "Barkada", detail: "5 or more" },
    ],
  },
  date: {
    kicker: "DATE",
    heading: "Who's on the date?",
    sub: "Solo treat, just the two of you, or a small group.",
    options: [
      { id: "1", icon: "person", label: "Solo", detail: "Just you" },
      { id: "2", icon: "favorite", label: "Just us two", detail: "Couple date" },
      { id: "2-4", icon: "group", label: "Double date", detail: "3–4 people" },
      { id: "5+", icon: "groups", label: "Group outing", detail: "5 or more" },
    ],
  },
  activities: {
    kicker: "GALA",
    heading: "Who's coming on the gala?",
    sub: "A solo wander, a small barkada, or a full squad.",
    options: [
      { id: "1", icon: "person", label: "Solo", detail: "Just you" },
      { id: "2-4", icon: "group", label: "Barkada", detail: "2–4 friends" },
      { id: "5+", icon: "groups", label: "Squad", detail: "5 or more" },
    ],
  },
  entertainment: {
    kicker: "GIMMICK",
    heading: "Who's coming to the gimmick?",
    sub: "Solo treat, a small barkada, or a loud crew.",
    options: [
      { id: "1", icon: "person", label: "Solo", detail: "Just you" },
      { id: "2-4", icon: "group", label: "Barkada", detail: "2–4 friends" },
      { id: "5+", icon: "groups", label: "Squad", detail: "5 or more" },
    ],
  },
};

export function groupCopyFor(theme) {
  return GROUP_COPY[theme] || GROUP_COPY.food;
}

export function groupFitsTheme(groupSize, theme) {
  if (!groupSize) return false;
  return groupCopyFor(theme).options.some((option) => option.id === groupSize);
}

export function groupLabel(groupSize, theme) {
  const option = groupCopyFor(theme).options.find((item) => item.id === groupSize);
  return option?.label || "your group";
}
