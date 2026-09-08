export type PinterestResolvedImage = {
  id: string;
  previewUrl: string;
  downloadUrl: string;
};

export function normalizePinterestResolvePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const images: PinterestResolvedImage[] = [];

  if (Array.isArray(record.images)) {
    for (const [index, value] of record.images.entries()) {
      if (!value || typeof value !== 'object') continue;
      const image = value as Record<string, unknown>;
      const previewUrl = typeof image.previewUrl === 'string' ? image.previewUrl.trim() : '';
      const downloadUrl = typeof image.downloadUrl === 'string' ? image.downloadUrl.trim() : previewUrl;
      if (!previewUrl || !downloadUrl) continue;
      images.push({
        id: typeof image.id === 'string' && image.id ? image.id : String(index + 1),
        previewUrl,
        downloadUrl,
      });
    }
  }

  const fallbackUrl = typeof record.previewUrl === 'string' ? record.previewUrl.trim() : '';
  if (!images.length && fallbackUrl) {
    images.push({ id: '1', previewUrl: fallbackUrl, downloadUrl: fallbackUrl });
  }

  return { ...record, images };
}
