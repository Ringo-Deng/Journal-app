import type { Piece } from './journal';

export const DEFAULT_VELLUM_COLOR = '#edf1f0';
export const DEFAULT_VELLUM_OPACITY = 0.72;
export const VELLUM_BORDER_COLOR = '#9fa9a466';

const LEGACY_WARM_FILL = '#f6f0e3bb';
const HEX_COLOR = /^#([a-f0-9]{6})([a-f0-9]{2})?$/i;

type VellumAppearance = Pick<Piece, 'color' | 'opacity' | 'drawing'>;

function boundedOpacity(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function isVellumSheet(piece: Pick<Piece, 'kind' | 'frame'>) {
  return piece.kind === 'doodle' && piece.frame === 'vellum-sheet';
}

export function vellumColor(piece: VellumAppearance) {
  const saved = HEX_COLOR.exec(piece.color || '');
  if (saved && !saved[2]) return `#${saved[1].toLowerCase()}`;

  const legacyFill = piece.drawing?.[0]?.fill || '';
  if (legacyFill.toLowerCase() === LEGACY_WARM_FILL) return DEFAULT_VELLUM_COLOR;
  const legacy = HEX_COLOR.exec(legacyFill);
  return legacy ? `#${legacy[1].toLowerCase()}` : DEFAULT_VELLUM_COLOR;
}

export function vellumDisplayOpacity(piece: VellumAppearance) {
  const savedOpacity = Number.isFinite(piece.opacity)
    ? boundedOpacity(piece.opacity as number)
    : undefined;
  const savedColor = HEX_COLOR.exec(piece.color || '');
  if (savedColor && !savedColor[2]) return savedOpacity ?? DEFAULT_VELLUM_OPACITY;

  const legacy = HEX_COLOR.exec(piece.drawing?.[0]?.fill || '');
  if (legacy?.[2]) {
    return boundedOpacity((savedOpacity ?? 1) * (Number.parseInt(legacy[2], 16) / 255));
  }
  return savedOpacity ?? DEFAULT_VELLUM_OPACITY;
}

export function vellumVisual(piece: VellumAppearance) {
  const strength = vellumDisplayOpacity(piece);
  return {
    strength,
    blurCqw: strength * 0.14,
    saturation: 1 - strength * 0.12,
    contrast: 1 - strength * 0.03,
    grainOpacity: strength * 0.11,
    edgeOpacity: strength * 0.32,
  };
}

export function pieceDisplayOpacity(piece: Piece) {
  // Vellum applies its saved opacity to the tint, grain and haze separately.
  // Keeping the wrapper opaque lets backdrop-filter soften the layers below it.
  return isVellumSheet(piece) ? 1 : piece.opacity ?? 1;
}
