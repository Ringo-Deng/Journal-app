export type UserFont = {
  id: string;
  name: string;
  family: string;
  url: string;
  size: number;
  originalName?: string;
};

export const USER_FONTS_CHANGED_EVENT = 'journal-user-fonts-changed';

export function fontResponse(value: unknown): { fonts: UserFont[]; error?: string } {
  if (!value || typeof value !== 'object') throw Error('字体服务返回的数据无效。');
  const data = value as Record<string, unknown>;
  const fonts = Array.isArray(data.fonts) ? data.fonts.filter((font: unknown): font is UserFont => {
    if (!font || typeof font !== 'object') return false;
    const item = font as Record<string, unknown>;
    return ['id', 'name', 'family', 'url'].every(key => typeof item[key] === 'string' && item[key] !== '')
      && typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0
      && (item.originalName === undefined || typeof item.originalName === 'string');
  }) : [];
  return { fonts, error: typeof data.error === 'string' ? data.error : undefined };
}

export async function readUserFonts(): Promise<UserFont[]> {
  const response = await fetch('/api/fonts');
  const data = fontResponse(await response.json());
  if (!response.ok) throw Error(data.error || '读取字体失败。');
  return data.fonts;
}

export function refreshUserFonts() {
  const link = document.querySelector<HTMLLinkElement>('link[data-user-fonts="true"]');
  if (link) link.href = `/api/fonts.css?v=${Date.now()}`;
  window.dispatchEvent(new Event(USER_FONTS_CHANGED_EVENT));
}
