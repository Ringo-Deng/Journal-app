/** Clean stationery face used by the physical notebook renderers. */
const safeText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

const STATIONERY_PALETTES = {
  '#f4ce75': {
    base: '#f4ce75',
    band: '#e7bb55',
    light: '#fff8dc',
    label: '#fffaf0',
    spine: '#684631',
  },
  '#e8b9ba': {
    base: '#e8b9ba',
    band: '#d99ea2',
    light: '#fff2f2',
    label: '#fffaf0',
    spine: '#6c596b',
  },
  '#91a9b5': {
    base: '#91a9b5',
    band: '#7898a8',
    light: '#f2f7f7',
    label: '#fffaf0',
    spine: '#3c5b6a',
  },
} as const;

export function stationeryPaletteForColor(color: string) {
  const key = color.trim().toLowerCase() as keyof typeof STATIONERY_PALETTES;
  return STATIONERY_PALETTES[key];
}

export function stationerySpineColor(color: string) {
  return stationeryPaletteForColor(color)?.spine;
}

function paletteFor(color: string) {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#f4ce75';
  const stationery = stationeryPaletteForColor(base);
  if (stationery) return stationery;
  return { base, band: base, light: '#fff8e8', label: '#fffaf0' };
}

/**
 * Front-face artwork only. The editor/reader supplies the real spine, page block,
 * clasp and depth around this face, so those physical parts must not be baked into
 * the SVG again. The visible label is deliberately the unbranded word NOTES.
 */
export function stationeryCoverSvg(title: string, color: string) {
  const p = paletteFor(color);
  const accessibleTitle = safeText(title || '拾光集');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <title>${accessibleTitle}</title>
  <defs>
    <clipPath id="cover"><rect width="600" height="900" rx="24"/></clipPath>
    <pattern id="plaid" width="96" height="96" patternUnits="userSpaceOnUse">
      <rect width="96" height="96" fill="${p.base}"/>
      <rect x="0" y="31" width="96" height="20" fill="${p.light}" opacity=".68"/>
      <rect x="30" y="0" width="20" height="96" fill="${p.light}" opacity=".68"/>
      <path d="M0 8H96M8 0V96M0 79H96M79 0V96" stroke="${p.band}" stroke-width="2" opacity=".24"/>
    </pattern>
  </defs>
  <g clip-path="url(#cover)">
    <rect width="600" height="900" fill="url(#plaid)"/>
    <path d="M0 0H600V900H0Z" fill="none" stroke="#ffffff" stroke-width="3" opacity=".12"/>
    <rect x="181" y="176" width="238" height="116" rx="17" fill="${p.label}" opacity=".98"/>
    <rect x="190" y="185" width="220" height="98" rx="13" fill="none" stroke="#8f8171" stroke-width="2.5" opacity=".48"/>
    <text x="300" y="248" text-anchor="middle" fill="#687579" font-family="Georgia, Times New Roman, serif" font-size="37" letter-spacing="9">NOTES</text>
    <path d="M247 266H353" stroke="#788588" stroke-width="2" opacity=".8"/>
  </g>
  </svg>`;
}

export function stationeryCoverUrl(title: string, color: string) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(stationeryCoverSvg(title, color));
}
