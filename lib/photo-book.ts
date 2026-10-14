import { bookFormat, newBook, today, uid, type Book, type BookFormat, type Piece, type Spread } from './journal';

export type PhotoBookPhoto = { id: string; src: string; width: number; height: number; capturedAt?: string; originalName?: string; thumbnailSrc?: string };
export const MAX_PHOTO_BOOK_PHOTOS = 500;
export const photoBookStyles = [
  { id: 'cream', name: '奶油旅行', detail: '奶油纸 · 轻胶带 · 疏密交替', paper: '#f5edda', accent: '#b49a6c', ink: '#544d3f', cover: 'kraft-natural', font: 'wenkai', rhythm: [1, 2, 1, 3, 2, 4] },
  { id: 'quiet', name: '留白影集', detail: '素白纸 · 整齐留白 · 大图叙事', paper: '#fafaf7', accent: '#a9b5ae', ink: '#3d4a45', cover: 'linen-blue', font: 'noto-serif-sc', rhythm: [1, 1, 2, 1, 4, 2] },
  { id: 'collage', name: '手作拼贴', detail: '彩色底纸 · 纸片叠贴 · 手写标题', paper: '#f1e8de', accent: '#b48175', ink: '#624a45', cover: 'linen-forest', font: 'pen', rhythm: [1, 3, 2, 4, 1, 2] },
] as const;
export type PhotoBookStyle = typeof photoBookStyles[number]['id'];
type Slot = { x: number; y: number; w: number; h: number };

export function chronologicalPhotos(photos: readonly PhotoBookPhoto[]): PhotoBookPhoto[] {
  // Missing dates keep their relative order at the end; no invented capture dates.
  const time = (p: PhotoBookPhoto) => { const t = Date.parse(p.capturedAt || ''); return Number.isFinite(t) ? t : Infinity; };
  return photos.map((p, index) => ({ p, index })).sort((a, b) => time(a.p) - time(b.p) || a.index - b.index).map(({ p }) => p);
}

function slotsFor(photos: readonly PhotoBookPhoto[]): Slot[] {
  if (photos.length === 1) return [{ x: 6, y: 21, w: 38, h: 62 }];
  if (photos.length === 2) {
    const portraits = photos.every(p => p.height > p.width);
    return portraits ? [{ x: 6, y: 22, w: 17.5, h: 61 }, { x: 26.5, y: 22, w: 17.5, h: 61 }]
      : [{ x: 6, y: 21, w: 38, h: 28 }, { x: 6, y: 55, w: 38, h: 28 }];
  }
  if (photos.length === 3) return [{ x: 6, y: 21, w: 38, h: 29 }, { x: 6, y: 57, w: 17.5, h: 26 }, { x: 26.5, y: 57, w: 17.5, h: 26 }];
  return [{ x: 6, y: 21, w: 17.5, h: 28 }, { x: 26.5, y: 21, w: 17.5, h: 28 }, { x: 6, y: 55, w: 17.5, h: 28 }, { x: 26.5, y: 55, w: 17.5, h: 28 }];
}

export function createPhotoBook(options: {
  photos: readonly PhotoBookPhoto[]; style: PhotoBookStyle; format: BookFormat; title: string;
}, makeId: () => string = uid): Book {
  const { photos, format } = options;
  if (!photos.length) throw Error('请先选择照片。');
  if (photos.length > MAX_PHOTO_BOOK_PHOTOS) throw Error(`单本最多 ${MAX_PHOTO_BOOK_PHOTOS} 张，请分成多本；尚未生成任何页面。`);
  if (!['standard', 'tn-regular'].includes(format)) throw Error('请选择有效的开本。');
  const style = photoBookStyles.find(s => s.id === options.style);
  if (!style) throw Error('请选择一种整册风格。');
  if (photos.some(p => !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(p.src) || !Number.isFinite(p.width) || p.width <= 0 || !Number.isFinite(p.height) || p.height <= 0)) {
    throw Error('有照片尚未完整导入，请重新导入后再成册。');
  }
  const title = options.title.trim().slice(0, 20) || '我的照片手帐';
  const book = newBook(today().slice(0, 7), style.cover, title, format, { paperStyle: 'blank', paperColor: style.paper });
  book.id = makeId();
  book.header = { ...book.header!, enabled: false };
  book.paperFeel = { texture: style.id === 'quiet' ? .12 : .26, spine: .35, edge: .2 };
  const ratio = bookFormat(book).ratio;
  const text = (value: string, x: number, y: number, w: number, fontSize: number): Piece => ({
    id: makeId(), kind: 'text', text: value, x, y, w, fontSize, rotation: 0, locked: false,
    fontFamily: style.font, color: style.ink, lineHeight: 1.4, letterSpacing: .02,
  });
  book.flyleaf = { id: makeId(), theme: 'archive', days: [], elements: [
    text(title, 57, 30, 36, 25), text(`${photos.length} 张照片\n${style.name}`, 57, 49, 35, 15),
  ] };
  book.spreads = [];
  let cursor = 0, pageIndex = 0;
  while (cursor < photos.length) {
    const spread: Spread = { id: makeId(), theme: 'archive', layout: `photo-book-${style.id}`, days: [], elements: [], paperStyle: 'blank', paperColor: style.paper };
    for (const side of [0, 1]) {
      if (cursor >= photos.length) break;
      const count = Math.min(style.rhythm[pageIndex % style.rhythm.length], photos.length - cursor);
      const batch = photos.slice(cursor, cursor + count);
      const slots = slotsFor(batch);
      if (style.id === 'collage') {
        const colors = ['#f1e8de', '#e6ece3', '#f2e1dc', '#e5e8ef'];
        spread.pages = { ...spread.pages, [side ? 'right' : 'left']: { paperColor: colors[pageIndex % colors.length] } };
      }
      spread.elements.push(text(pageIndex === 0 ? title : style.name, side * 50 + 6, 8, 38, pageIndex === 0 ? 22 : 16));
      for (let i = 0; i < batch.length; i++) {
        const photo = batch[i], slot = slots[i], groupId = makeId();
        // Fit the complete photograph in physical proportions, leaving room for paper and rotation.
        const w = Math.max(1, Math.min(slot.w - 2, (slot.h - 3) * photo.width / photo.height / ratio));
        const h = Math.max(.5, Math.min(slot.h - 3, w * photo.height / photo.width * ratio));
        const x = side * 50 + slot.x + (slot.w - w) / 2, y = slot.y + (slot.h - h) / 2;
        const rotation = style.id === 'quiet' ? 0 : ((cursor + i) % 2 ? 1 : -1) * (style.id === 'collage' ? 1.8 : .8);
        if (style.id !== 'quiet') spread.elements.push({
          id: makeId(), kind: 'doodle', x: x - .6, y: y - .6 * ratio, w: w + 1.2, h: h + 1.2 * ratio,
          rotation, locked: false, stretch: true, groupId, artLabel: '照片底纸', shadow: .18,
          drawing: [{ path: 'M0 0 H100 V100 H0 Z', fill: '#fffcf4', stroke: '#fffcf4', width: .1 }],
        });
        spread.elements.push({ id: makeId(), kind: 'photo', src: photo.src, photoOriginal: photo.src,
          x, y, w, h, rotation, locked: false, frame: 'plain', stretch: true, hideTape: true,
          crop: 50, cropY: 50, cropZoom: 1, photoFit: 'contain', shadow: style.id === 'quiet' ? 0 : .2, groupId,
        });
        if (style.id !== 'quiet' && i === 0) spread.elements.push({
          id: makeId(), kind: 'doodle', material: 'tape', x: x + w / 2 - Math.min(7, w) / 2,
          y: y - .7, w: Math.min(7, w), h: 1.6 * ratio, rotation: rotation + 4,
          locked: false, groupId, color: style.accent, opacity: .65, artLabel: '纸胶带',
        });
      }
      spread.elements.push(text(`${String(pageIndex + 1).padStart(2, '0')}  /  ${cursor + 1}—${cursor + count}`, side * 50 + 6, 91, 38, 12));
      cursor += count;
      pageIndex++;
    }
    book.spreads.push(spread);
  }
  // Guard at the boundary where layout becomes saved, editable journal data.
  const assigned = book.spreads.flatMap(s => s.elements.filter(p => p.kind === 'photo').map(p => p.src));
  if (assigned.length !== photos.length || assigned.some((src, i) => src !== photos[i].src)) throw Error('照片分配不完整，尚未生成手帐。');
  return book;
}
