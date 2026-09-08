/** Original stationery artwork inspired by the supplied notebook reference. */
export function stationeryCoverSvg(title: string, color: string) {
  const safe = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
    );
  const base = /^#[0-9a-f]{6}$/i.test(color) ? color : "#f4ce75";
  const creamPlaid = base.toLowerCase() === "#f4ce75";

  // The奶黄格纹款 intentionally stays extremely clean: one even gingham surface,
  // a restrained brown cloth spine, and no label/snap/bookmark/page-edge decoration.
  if (creamPlaid) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <clipPath id="cover"><rect width="600" height="900" rx="28"/></clipPath>
    <pattern id="plaid" width="72" height="72" patternUnits="userSpaceOnUse">
      <rect width="72" height="72" fill="${base}"/>
      <path d="M6 0V72M0 6H72" stroke="#fff8dc" stroke-width="12"/>
      <path d="M13 0V72M0 13H72" stroke="#fffdf0" stroke-width="2" opacity=".42"/>
    </pattern>
    <linearGradient id="spine" x1="0" x2="1">
      <stop stop-color="#5d3b2c"/>
      <stop offset=".48" stop-color="#704b37"/>
      <stop offset="1" stop-color="#62402f"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#cover)">
    <rect width="600" height="900" fill="url(#plaid)"/>
    <rect width="74" height="900" fill="url(#spine)"/>
    <rect x="70" width="3" height="900" fill="#422a20" opacity=".34"/>
    <rect x="74" width="2" height="900" fill="#fff6db" opacity=".28"/>
  </g>
  </svg>`;
  }

  const label = safe(title || "拾光集");
  const size = Math.min(29, 230 / Math.max(1, [...title].length));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <defs>
    <pattern id="plaid" width="96" height="96" patternUnits="userSpaceOnUse"><rect width="96" height="96" fill="${base}"/><path d="M24 0V96M0 24H96" stroke="#fff4d2" stroke-width="17" opacity=".52"/><path d="M67 0V96M0 67H96" stroke="#ba8b42" stroke-width="2" opacity=".2"/><path d="M76 0V96M0 76H96" stroke="#fff9df" stroke-width="4" opacity=".5"/></pattern>
    <pattern id="weave" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 1H5M1 0V5" stroke="#fff" stroke-width=".5" opacity=".16"/></pattern>
    <linearGradient id="snap" x2=".8" y2="1"><stop stop-color="#fffff4"/><stop offset="1" stop-color="#d9d9c7"/></linearGradient>
    <clipPath id="cloth"><rect x="64" y="10" width="510" height="822" rx="43"/></clipPath>
  </defs>
  <rect x="14" y="12" width="562" height="878" rx="48" fill="#51402e"/>
  <rect x="23" y="19" width="552" height="860" rx="42" fill="#654c34"/>
  <g clip-path="url(#cloth)"><rect x="64" y="10" width="510" height="822" fill="url(#plaid)"/><rect x="64" y="10" width="510" height="822" fill="url(#weave)"/></g>
  <rect x="30" y="811" width="530" height="60" rx="28" fill="#fffbed"/>
  <path d="M49 826H547M47 837H541M52 848H531M65 858H514" stroke="#dbd5c5" stroke-width="2"/>
  <path d="M93 838H144V899L118 889L93 899Z" fill="#e9ad5a"/>
  <path d="M69 16V829" stroke="#b89959" stroke-width="3" stroke-dasharray="14 9" opacity=".8"/>
  <ellipse cx="329" cy="232" rx="152" ry="86" fill="#8c763b" opacity=".13"/>
  <ellipse cx="325" cy="224" rx="151" ry="84" fill="#fff6dc"/>
  <ellipse cx="325" cy="224" rx="142" ry="75" fill="none" stroke="#71838a" stroke-width="2.5"/>
  <text x="325" y="216" text-anchor="middle" fill="#506c78" font-family="Kaiti SC, KaiTi, cursive" font-size="${size}" letter-spacing="3">${label}</text>
  <path d="M225 243H425M259 266H391" stroke="#829092" stroke-width="2"/>
  <rect x="446" y="388" width="150" height="147" rx="25" fill="#8f6829" opacity=".16"/>
  <rect x="440" y="380" width="150" height="147" rx="25" fill="url(#plaid)"/>
  <rect x="440" y="380" width="150" height="147" rx="25" fill="url(#weave)"/>
  <path d="M454 390H578V515H454" fill="none" stroke="#fff2c8" stroke-width="2" stroke-dasharray="5 5" opacity=".8"/>
  <ellipse cx="504" cy="463" rx="33" ry="31" fill="#685537" opacity=".16"/>
  <circle cx="501" cy="452" r="31" fill="url(#snap)" stroke="#e6e3cb" stroke-width="2"/>
  <text x="324" y="752" text-anchor="middle" fill="#66512f" font-family="cursive" font-size="19" letter-spacing="2">shiguang</text>
  </svg>`;
}
export function stationeryCoverUrl(title: string, color: string) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(stationeryCoverSvg(title, color));
}
