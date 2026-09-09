/** Original stationery artwork inspired by the supplied notebook reference. */
const safeText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

function paletteFor(color: string) {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#f4ce75";
  if (base === "#f4ce75") return { base: "#f8e99b", band: "#edd36c", light: "#fffbe4", ribbon: "#dfa72f" };
  if (base === "#e8b9ba") return { base: "#efc9cb", band: "#dfaeb0", light: "#fff3f3", ribbon: "#cf8f98" };
  if (base === "#91a9b5") return { base: "#bfd1da", band: "#9fb9c5", light: "#eef7fa", ribbon: "#7698aa" };
  return { base, band: "#ffffff", light: "#ffffff", ribbon: base };
}

function plaidDefs(color: string) {
  const p = paletteFor(color);
  return `<pattern id="plaid" width="112" height="112" patternUnits="userSpaceOnUse">
    <rect width="112" height="112" fill="${p.base}"/>
    <path d="M28 0V112M0 28H112" stroke="${p.band}" stroke-width="56" opacity=".24"/>
    <path d="M0 0H112M0 56H112M0 112H112M0 0V112M56 0V112M112 0V112" stroke="${p.light}" stroke-width="16" opacity=".78"/>
  </pattern>`;
}

/** Front-face artwork used by the real 3D reading cover. */
export function stationeryCoverSvg(_title: string, color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <clipPath id="cover"><rect width="600" height="900" rx="22"/></clipPath>
    ${plaidDefs(color)}
  </defs>
  <g clip-path="url(#cover)">
    <rect width="600" height="900" fill="url(#plaid)"/>
    <rect x="170" y="165" width="260" height="112" rx="18" fill="#fffaf0" opacity=".97"/>
    <rect x="178" y="173" width="244" height="96" rx="14" fill="none" stroke="#8f8171" stroke-width="2.5" opacity=".48"/>
    <text x="300" y="235" text-anchor="middle" fill="#6d6258" font-family="Georgia, Times New Roman, serif" font-size="38" letter-spacing="8">NOTES</text>
  </g>
  </svg>`;
}

/** Complete regular-notebook preview used in the library and cover picker. */
export function stationeryBookPreviewSvg(color: string) {
  const p = paletteFor(color);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    ${plaidDefs(color)}
    <filter id="shadow" x="-20%" y="-20%" width="150%" height="160%"><feDropShadow dx="8" dy="14" stdDeviation="14" flood-color="#3f3328" flood-opacity=".18"/></filter>
    <linearGradient id="spine" x2="1"><stop stop-color="#453528"/><stop offset=".48" stop-color="#5b4433"/><stop offset="1" stop-color="#3d2f25"/></linearGradient>
  </defs>
  <g filter="url(#shadow)">
    <rect x="67" y="43" width="462" height="794" rx="38" fill="#fffaf0"/>
    <rect x="67" y="43" width="72" height="794" rx="35" fill="url(#spine)"/>
    <path d="M106 63V817" stroke="#aa9278" stroke-width="3" stroke-dasharray="11 9" opacity=".65"/>
    <path d="M139 45H496Q527 45 527 76V768H139Z" fill="url(#plaid)"/>
    <rect x="139" y="756" width="388" height="80" fill="#fffaf0"/>
    <path d="M151 774H515M151 788H511M151 802H508M151 816H503" stroke="#ddd5c7" stroke-width="2" opacity=".95"/>
    <path d="M176 791H220V856L198 844L176 856Z" fill="${p.ribbon}"/>
    <rect x="229" y="174" width="220" height="102" rx="17" fill="#fffaf0" opacity=".98"/>
    <rect x="237" y="182" width="204" height="86" rx="13" fill="none" stroke="#8f8171" stroke-width="2.5" opacity=".5"/>
    <text x="339" y="239" text-anchor="middle" fill="#6d6258" font-family="Georgia, Times New Roman, serif" font-size="36" letter-spacing="8">NOTES</text>
    <rect x="469" y="384" width="94" height="142" rx="22" fill="${p.base}"/>
    <path d="M482 397H550V513H482" fill="none" stroke="${p.light}" stroke-width="3" stroke-dasharray="6 6" opacity=".9"/>
    <circle cx="509" cy="455" r="25" fill="#fffaf0" stroke="#ded8ca" stroke-width="3"/>
    <circle cx="509" cy="455" r="9" fill="#d9d1c3" opacity=".55"/>
  </g>
  </svg>`;
}

/** Travel Notes keeps its previous title-based preview until its own artwork is designed. */
export function stationeryTravelPreviewSvg(title: string, color: string) {
  const label = safeText(title || "拾光集");
  const size = Math.min(29, 230 / Math.max(1, [...(title || "拾光集")].length));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>${plaidDefs(color)}</defs>
  <rect width="600" height="900" rx="22" fill="url(#plaid)"/>
  <ellipse cx="300" cy="230" rx="151" ry="84" fill="#fff6dc"/>
  <ellipse cx="300" cy="230" rx="142" ry="75" fill="none" stroke="#71838a" stroke-width="2.5"/>
  <text x="300" y="222" text-anchor="middle" fill="#506c78" font-family="Kaiti SC, KaiTi, cursive" font-size="${size}" letter-spacing="3">${label}</text>
  <path d="M200 249H400M234 272H366" stroke="#829092" stroke-width="2"/>
  </svg>`;
}

const dataUrl = (svg: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
export function stationeryCoverUrl(title: string, color: string) {
  return dataUrl(stationeryCoverSvg(title, color));
}
export function stationeryBookPreviewUrl(color: string) {
  return dataUrl(stationeryBookPreviewSvg(color));
}
export function stationeryTravelPreviewUrl(title: string, color: string) {
  return dataUrl(stationeryTravelPreviewSvg(title, color));
}
