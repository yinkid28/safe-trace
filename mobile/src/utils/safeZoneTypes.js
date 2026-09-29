/**
 * Safe zone category definitions with inline SVG icons for Leaflet divIcon rendering.
 */

export const ZONE_TYPES = [
  { value: "home", label: "Home" },
  { value: "office", label: "Office/Work" },
  { value: "school", label: "School" },
  { value: "hospital", label: "Hospital" },
  { value: "park", label: "Park" },
  { value: "event", label: "Event Place" },
  { value: "religious", label: "Religious Place" },
  { value: "other", label: "Other" },
];

/** Inline SVG markup (24×24 viewBox) for each zone type */
const ZONE_ICON_SVGS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  office: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  school: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm0 12.55L5 12.35v-1.26L12 14.3l7-3.2v1.25L12 15.55z"/></svg>`,
  hospital: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M3 3h18v18H3z"/><path d="M12 8v8m-4-4h8"/></svg>`,
  park: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17 12h2L12 2 5 12h2l-3 6h7v4h2v-4h7l-3-6z"/></svg>`,
  event: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  religious: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M18 7V4h-2v3h-3v2h3v12h2V9h3V7h-3zM6 11V4H4v7H1v2h3v7h2v-7h3v-2H6z"/></svg>`,
  other: `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>`,
};

/**
 * Returns HTML markup for a safe zone Leaflet divIcon.
 * @param {string} type - Zone type value (e.g., "home", "office")
 * @param {boolean} isShared - Whether this is a family-shared zone (blue vs green)
 */
export function getZoneIconHtml(type, isShared = false) {
  const safeType = ZONE_ICON_SVGS[type] ? type : "other";
  const svg = ZONE_ICON_SVGS[safeType];
  const bgColor = isShared ? "#3b82f6" : "#22c55e";
  return `<div class="zone-marker-icon" style="background:${bgColor}">${svg}</div>`;
}

/**
 * Get display label for a zone type value.
 * @param {string} typeValue
 * @returns {string}
 */
export function getZoneTypeLabel(typeValue) {
  const found = ZONE_TYPES.find((t) => t.value === typeValue);
  return found ? found.label : "Other";
}
