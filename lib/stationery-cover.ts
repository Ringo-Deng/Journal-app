/** Original stationery artwork inspired by the supplied notebook reference. */
export function stationeryCoverSvg(title: string, color: string) {
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : "#f4ce75";
  const palette =
    base === "#f4ce75"
      ? { base: "#f8e99b", band: "#edd36c", light: "#fffbe4" }
      : base === "#d7a8ad"
        ? { base: "#edc6cb", band: "#dca9b0", light: "#fff2f3" }
        : base === "#9db8c9"
          ? { base: "#c5d8e5", band: "#9fbccd", light: "#eef7fb" }
          : { base, band: "#ffffff", light: "#ffffff" };

  // Standard notebook artwork is intentionally limited to a clean front-cover panel.
  // The real spine, page block, clasp and book depth are rendered by the surrounding
  // notebook geometry, so they must never be baked into this front image.
  // The label is intentionally generic and unbranded for all built-in regular covers.
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
