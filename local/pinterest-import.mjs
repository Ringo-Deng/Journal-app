const PIN_ID_RE = /^\d{6,30}$/;
const ALLOWED_IMAGE_HOST = /(^|\.)pinimg\.com$/i;
const IMAGE_SIZE_PATH_RE = /\/(?:originals|\d{1,5}x(?:\d{1,5})?)\//i;

export function parsePinterestInput(value) {
  const raw = String(value || '').trim();
  if (!raw) throw Object.assign(new Error('请粘贴 Pinterest 链接、Pin ID 或嵌入代码。'), { status: 400 });
  if (PIN_ID_RE.test(raw)) return { pinId: raw, originalUrl: `https://www.pinterest.com/pin/${raw}/` };

  const iframe = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/i.exec(raw);
  const candidate = iframe ? iframe[1] : raw;
  let url;
  try { url = new URL(candidate.replace(/&amp;/gi, '&')); } catch { throw Object.assign(new Error('没有识别到有效的 Pinterest 素材代码或链接。'), { status: 400 }); }
  const host = url.hostname.toLowerCase();
  if (!(host === 'pinterest.com' || host.endsWith('.pinterest.com') || host === 'assets.pinterest.com'))
    throw Object.assign(new Error('目前只支持 Pinterest 的 Pin 链接或嵌入代码。'), { status: 400 });

  let pinId = '';
  if (host === 'assets.pinterest.com' && url.pathname === '/ext/embed.html') pinId = url.searchParams.get('id') || '';
  if (!pinId) {
    const parts = url.pathname.split('/').filter(Boolean);
    const pinIndex = parts.findIndex((part) => part.toLowerCase() === 'pin');
    if (pinIndex >= 0) {
      const tail = parts.slice(pinIndex + 1).join('/');
      const direct = /^(\d{6,30})(?:\/|$)/.exec(tail);
      const slugged = /(?:^|--)(\d{6,30})(?:\/|$)/.exec(tail);
      pinId = direct?.[1] || slugged?.[1] || '';
    }
  }
  if (!PIN_ID_RE.test(pinId)) throw Object.assign(new Error('没有从这段内容中识别到 Pinterest Pin ID。'), { status: 400 });
  return { pinId, originalUrl: `https://www.pinterest.com/pin/${pinId}/` };
}

function decode(value) {
  return String(value || '')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;/gi, '"')
    .replace(/\\u0026/gi, '&');
}
function isPinImageUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ALLOWED_IMAGE_HOST.test(u.hostname); } catch { return false; }
}
function score(url) {
  if (/\/originals\//i.test(url)) return 1_000_000;
  const width = /\/(\d{1,5})x(?:\d{1,5})?\//i.exec(url)?.[1];
  return Number(width || 0);
}
function imageIdentity(url) {
  return new URL(url).pathname.replace(IMAGE_SIZE_PATH_RE, '/SIZE/');
}
function originalVariant(url) {
  try {
    const u = new URL(url);
    if (!ALLOWED_IMAGE_HOST.test(u.hostname)) return null;
    u.pathname = u.pathname.replace(IMAGE_SIZE_PATH_RE, '/originals/');
    return u.toString();
  } catch { return null; }
}

export function extractPinterestMetadata(html, pinId) {
  const text = String(html || '');
  const video = /<meta[^>]+property=["']og:video(?::url)?["'][^>]*>/i.test(text) ||
    /["']is_video["']\s*:\s*true/i.test(text) ||
    /["']content_type["']\s*:\s*["']video["']/i.test(text);
  if (video) return { pinId, video: true, candidates: [] };

  const groups = new Map();
  const addCandidate = (value, priority = 0) => {
    const url = decode(value);
    if (!isPinImageUrl(url)) return;
    const key = imageIdentity(url);
    if (!groups.has(key)) groups.set(key, { priority, observed: new Set() });
    const group = groups.get(key);
    group.priority = Math.max(group.priority, priority);
    group.observed.add(url);
  };
  for (const [re, priority] of [
    [/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi, 2],
    [/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi, 2],
    [/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi, 1],
    [/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/gi, 1],
  ]) {
    let match; while ((match = re.exec(text))) addCandidate(match[1], priority);
  }
  const contentText = text.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  const urlPattern = /https:(?:\\u002F|\\\/|\/){2}i\.pinimg\.com(?:\\u002F|\\\/|\/)[^"'<>\s(){}[\]]+/gi;
  for (const match of contentText.matchAll(urlPattern)) {
    const url = decode(match[0]).replace(/[},\]]+$/, '');
    addCandidate(url);
  }
  // Rank image identities before adding speculative original URLs, so page
  // recommendations and synthesized sizes cannot outrank the Pin's main image.
  const ranked = [...groups.values()].map((group) => ({
    priority: group.priority,
    observed: [...group.observed].sort((a, b) => score(b) - score(a)),
  })).sort((a, b) => b.priority - a.priority || score(b.observed[0]) - score(a.observed[0]));
  const images = ranked.map(({ observed }, index) => {
    const originals = observed.map(originalVariant).filter((url) => url && /\/originals\//i.test(url));
    const candidates = [...new Set([...originals, ...observed])];
    return {
      id: String(index + 1),
      previewUrl: observed[0],
      downloadUrl: candidates[0],
      candidates,
    };
  });
  return { pinId, video: false, candidates: images.flatMap((image) => image.candidates), images, previewUrl: images[0]?.previewUrl || '' };
}

async function fetchText(url, timeoutMs = 15000) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (e) { last = e; if (attempt === 0) await new Promise((r) => setTimeout(r, 350)); }
  }
  throw Object.assign(new Error('Pinterest 暂时无法访问，请检查网络后重试。'), { status: 502, cause: last });
}

export async function resolvePinterestPin(pinId) {
  const urls = [
    `https://www.pinterest.com/pin/${pinId}/`,
    `https://assets.pinterest.com/ext/embed.html?id=${pinId}`,
  ];
  let last;
  for (const url of urls) {
    try {
      const metadata = extractPinterestMetadata(await fetchText(url), pinId);
      if (metadata.video) throw Object.assign(new Error('暂不支持 Pinterest 视频 Pin。'), { status: 422 });
      if (metadata.candidates.length) return metadata;
    } catch (e) {
      if (e?.status === 422) throw e;
      last = e;
    }
  }
  throw Object.assign(new Error('没有读取到这个 Pin 的公开素材图。它可能已删除、设为私密，或 Pinterest 暂时限制访问。'), { status: 422, cause: last });
}

function mimeExtension(contentType, url) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  const ext = /\.(jpe?g|png|webp)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext || '';
}
function validImage(buffer, ext) {
  if (ext === 'jpg') return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (ext === 'png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (ext === 'webp') return buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP';
  return false;
}
async function fetchImage(url) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const finalUrl = response.url || url;
      const finalHost = new URL(finalUrl).hostname;
      if (!ALLOWED_IMAGE_HOST.test(finalHost)) throw new Error('unexpected image host');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 20 * 1024 * 1024) throw Object.assign(new Error('Pinterest 原图超过 20 MB，暂不导入。'), { status: 413 });
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 20 * 1024 * 1024) throw Object.assign(new Error('Pinterest 原图超过 20 MB，暂不导入。'), { status: 413 });
      const ext = mimeExtension(response.headers.get('content-type'), finalUrl);
      if (!['jpg','png','webp'].includes(ext) || !validImage(buffer, ext)) throw new Error('not a supported image');
      return { buffer, ext, imageUrl: finalUrl };
    } catch (e) { last = e; if (e?.status === 413) throw e; if (attempt === 0) await new Promise((r) => setTimeout(r, 350)); }
  }
  throw last || new Error('download failed');
}

export async function downloadPinterestImage(pinId, selectedUrl = '') {
  const metadata = await resolvePinterestPin(pinId);
  const selected = selectedUrl
    ? metadata.images?.find((image) => image.candidates.includes(selectedUrl))
    : metadata.images?.[0];
  if (selectedUrl && !selected) throw Object.assign(new Error('没有找到所选图片，请重新预览后选择。'), { status: 422 });
  const candidates = selected?.candidates || [];
  let last;
  for (const url of candidates) {
    try { return { ...await fetchImage(url), metadata }; } catch (e) { last = e; if (e?.status === 413) throw e; }
  }
  throw Object.assign(new Error('Pinterest 图片下载失败，请稍后重试。'), { status: 502, cause: last });
}
