const S = (b) => `<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
export const ICONS = {
  globe: S('<circle cx="32" cy="30" r="18"/><ellipse cx="32" cy="30" rx="8" ry="18"/><path d="M14 30h36M18 20h28M18 40h28M20 56h24M32 48v8"/>'),
  molecule: S('<circle cx="32" cy="32" r="8" fill="currentColor"/><circle cx="12" cy="16" r="5"/><circle cx="52" cy="18" r="5"/><circle cx="30" cy="54" r="5"/><path d="M26 27L16 19M38 28l10-7M31 40v9"/>'),
  dummy: S('<circle cx="32" cy="12" r="6"/><path d="M32 18v22M18 26h28M32 40L22 56M32 40l10 16"/><circle cx="32" cy="12" r="2" fill="currentColor"/>'),
  particles: S('<circle cx="14" cy="14" r="4"/><circle cx="30" cy="12" r="4"/><circle cx="46" cy="16" r="4"/><circle cx="20" cy="30" r="4"/><circle cx="40" cy="34" r="4"/><circle cx="52" cy="48" r="4"/><circle cx="12" cy="50" r="4"/><circle cx="30" cy="52" r="4"/><path d="M52 40l-4-4M12 40l4-4" />'),
  foodweb: S('<circle cx="32" cy="10" r="5"/><circle cx="14" cy="32" r="5"/><circle cx="50" cy="32" r="5"/><circle cx="32" cy="54" r="5"/><path d="M28 14L17 28M36 14l11 14M18 36l11 14M46 36L35 50M19 32h26"/>'),
  watercycle: S('<path d="M8 50c8-6 12 6 20 0s12 6 20 0"/><path d="M14 30a8 8 0 0 1 4-14 12 12 0 0 1 22-2 8 8 0 0 1 4 16z"/><path d="M50 20v14m-4-4l4 4 4-4M16 40V54m-4-4l4-4 4 4"/>'),
  speed: S('<path d="M10 44h44"/><path d="M20 34h24M20 34l6-6M20 34l6 6M44 34l-6-6M44 34l-6 6"/><path d="M12 18h16M36 18h16M32 14v8"/>'),
  bestfit: S('<path d="M8 8v48h48"/><circle cx="18" cy="42" r="2.5"/><circle cx="26" cy="38" r="2.5"/><circle cx="34" cy="32" r="2.5"/><circle cx="42" cy="26" r="2.5"/><circle cx="50" cy="20" r="2.5"/><path d="M12 46L54 16"/>'),
  markrecap: S('<ellipse cx="22" cy="34" rx="10" ry="6"/><path d="M32 34l8-6v12zM18 32h.1"/><ellipse cx="44" cy="46" rx="8" ry="5"/><rect x="38" y="10" width="18" height="14" rx="2"/><path d="M42 17h10"/>'),
  weather: S('<path d="M18 40a8 8 0 0 1 2-16 12 12 0 0 1 22 0 8 8 0 0 1 2 16z"/><path d="M22 48l-3 8M32 48l-3 8M42 48l-3 8"/>'),
  bushfire: S('<path d="M32 8c4 10 14 14 14 28a14 14 0 0 1-28 0c0-8 6-10 6-18 4 2 6 6 8-10z"/><path d="M32 56c-4 0-6-3-6-6 0-4 6-6 6-12 4 4 6 8 6 12 0 3-2 6-6 6z"/>'),
  sharkmap: S('<rect x="6" y="10" width="52" height="44" rx="4"/><path d="M12 40c10-12 16 6 26-6s12 0 14-8"/><path d="M36 22l4-6 4 6z" fill="currentColor"/><circle cx="14" cy="22" r="2" fill="currentColor"/>'),
};
