export const regularCoverPreviews = [
  {
    coverId: 'linen-oat',
    color: '#f4ce75',
    name: '奶黄格纹',
    src: '/notebook-covers/regular-yellow-notes.svg',
  },
  {
    coverId: 'linen-forest',
    color: '#e8b9ba',
    name: '柔粉格纹',
    src: '/notebook-covers/regular-pink-notes.svg',
  },
  {
    coverId: 'linen-blue',
    color: '#91a9b5',
    name: '雾蓝格纹',
    src: '/notebook-covers/regular-blue-notes.svg',
  },
] as const;

export function regularCoverPreviewForColor(color: string) {
  const normalized = color.trim().toLowerCase();
  return regularCoverPreviews.find((preview) => preview.color === normalized);
}
