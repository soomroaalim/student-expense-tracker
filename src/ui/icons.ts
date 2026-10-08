/**
 * Inline SVG icon registry (24x24, stroke-based). Keeps the bundle tiny
 * and works fully offline — no icon fonts, no network.
 */

const PATHS: Record<string, string> = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  transport: '<rect x="4" y="3" width="16" height="13" rx="2"/><path d="M4 9h16"/><circle cx="8.5" cy="18.5" r="1.5"/><circle cx="15.5" cy="18.5" r="1.5"/>',
  education: '<path d="M22 9 12 4 2 9l10 5 10-5z"/><path d="M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5"/><path d="M22 9v5"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  shopping: '<path d="M6 7h12l1.5 14h-15L6 7z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  entertainment: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9z"/>',
  bills: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  health: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/><path d="M3.2 12h4.3l1.5-3 3 6 1.5-3h4.3"/>',
  other: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  scholarship: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-2 7 5.5-3 5.5 3-2-7"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  gift: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8C8 8 7 6 7 4c0-1.5 1-2.5 2.5-2.5C11 1.5 12 8 12 8z"/><path d="M12 8c4 0 5-2 5-4 0-1.5-1-2.5-2.5-2.5C13 1.5 12 8 12 8z"/>',
  income: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  snacks: '<path d="M4 10h12v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5z"/><path d="M16 11h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 7c0-1.2 1-1.3 1-2.5M12 7c0-1.2 1-1.3 1-2.5"/>',
  savings: '<rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="2.5"/><path d="M6.5 10h.01M17.5 16h.01"/>',
  laptop: '<rect x="4" y="4" width="16" height="11" rx="2"/><path d="M2 19h20"/>',
  flame: '<path d="M12 22c4.2 0 7-2.9 7-7 0-2.8-1.8-5.3-3.3-6.9C14.3 6.6 13 5 13 2.5 10 4.5 8 7 7.5 9.5 6 10.6 5 12.2 5 14.5c0 4.3 2.8 7.5 7 7.5z"/><path d="M12 22c-2 0-3.5-1.4-3.5-3.2 0-1.4.9-2.6 1.8-3.4.7 1 1.7 1.6 1.7 3 1-.4 2-1.4 2-2.7 1 .9 2 2.2 2 3.6 0 1.6-1.8 2.7-4 2.7z"/>',
  backspace: '<path d="M21 5H8l-5 7 5 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m12 10 5 5M17 10l-5 5"/>',
  tools: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5v-7z"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5"/><path d="M12 17.5h.01"/>',
  'trend-down': '<path d="m3 7 6 6 4-4 8 8"/><path d="M21 13v6h-6"/>',
  'trend-up': '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L8 20l-5 1 1-5L17 3z"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 21h16"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  'arrow-up': '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  'arrow-down': '<path d="m7 7 10 10"/><path d="M17 8v9H8"/>',
  filter: '<path d="M4 5h16l-6.5 8v5.5L10 21v-8L4 5z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  shield: '<path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4z"/><path d="m9 12 2 2 4-4"/>',
  minus: '<path d="M5 12h14"/>',
};

/** SVG markup for an icon. Unknown names fall back to 'other'. */
export function icon(name: string, cls = ''): string {
  const body = PATHS[name] ?? PATHS.other;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function iconNames(): string[] {
  return Object.keys(PATHS);
}
