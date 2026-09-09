/** Original stationery artwork inspired by the supplied notebook reference. */
export function stationeryCoverSvg(title: string, color: string) {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#f4ce75";
  const palette =
    base === "#f4ce75"
      ? { base: "#f8e99b", band: "#edd36c", light: "#fffbe4" }
      : base === "#e8b9ba"
        ? { base: "#efc9cb", band: "#dfaeb0", light: "#fff3f3" }
        : base === "#91a9b5"
          ? { base: "#bfd1da", band: "#9fb9c5", light: "#eef7fa" }
          : { base, band: "#ffffff", light: "#ffffff" };

  // Keep this image to the clean front-cover artwork only. The surrounding notebook
  // geometry owns the real spine, page block, clasp and depth, so none of those parts
  // are baked into this SVG. Built-in regular covers stay generic and unbranded.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <clipPath id="cover"><rect width="600" height="900" rx="22"/></clipPath>
    <pattern id="plaid" width="112" height="112" patternUnits="userSpaceOnUse">
      <rect width="112" height="112" fill="${palette.base}"/>
      <path d="M28 0V112M0 28H112" stroke="${palette.band}" stroke-width="56" opacity=".24"/>
      <path d="M0 0H112M0 56H112M0 112H112M0 0V112M56 0V112M112 0V112" stroke="${palette.light}" stroke-width="16" opacity=".78"/>
    </pattern>
  </defs>
  <g clip-path="url(#cover)">
    <rect width="600" height="900" fill="url(#plaid)"/>
    <rect x="170" y="165" width="260" height="112" rx="18" fill="#fffaf0" opacity=".96"/>
    <rect x="178" y="173" width="244" height="96" rx="14" fill="none" stroke="#8f8171" stroke-width="2.5" opacity=".52"/>
    <text x="300" y="235" text-anchor="middle" fill="#6d6258" font-family="Georgia, Times New Roman, serif" font-size="38" letter-spacing="8">NOTES</text>
  </g>
  </svg>`;
}
export function stationeryCoverUrl(title: string, color: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(stationeryCoverSvg(title, color));
}
