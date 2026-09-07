export type Asset = {
  id: string;
  name: string;
  originalSrc?: string;
  category: string;
  tags: string[];
  src: string;
  sourceUrl: string;
  license: string;
  author: string;
  styles?: string[];
  functions?: string[];
  customCategories?: string[];
  subjectTags?: string[];
  group?: string;
  labels?: {content?: string[]; style?: string[]; color?: string[]};
  review?: {pending: boolean; reason?: string};
  manual?: {group?: boolean; labels?: boolean};
};
export type Piece = {
  id: string;
  kind: 'text' | 'asset' | 'photo' | 'doodle';
  role?: 'title' | 'body' | 'decor' | 'date';
  dayId?: string;
  text?: string;
  src?: string;
  assetId?: string;
  x: number;
  y: number;
  w: number;
  rotation: number;
  locked: boolean;
  fontSize?: number;
  frame?: string;
  crop?: number;
  photoOriginal?: string;
  opacity?: number;
  color?: string;
  background?: string;
  path?: string;
  h?: number;
  stretch?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  originIds?: string[];
  sourceDayIds?: string[];
  paragraphIndex?: number;
  forParagraph?: string;
  stickerKeywords?: string[];
  fontFamily?: string;
  colorRuns?: {start:number;end:number;color:string}[];
  lineHeight?: number;
  letterSpacing?: number;
  fontWeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  groupId?: string;
  attachedTo?: string;
  cropY?: number;
  cropZoom?: number;
  photoBorder?: number;
  cutoutOutline?: number;
  hideTape?: boolean;
  material?: 'paper' | 'photo' | 'botanical' | 'tape';
  shadow?: number;
  tapeEdge?: 'torn' | 'straight';
  artLabel?: string;
  doodleMotif?: string;
  drawing?: {path:string;fill?:string;stroke?:string;width?:number}[];
};
export type Day = {
  id: string;
  date: string;
  raw: string;
  title: string;
  text: string;
  photos: string[];
};
export type PaperStyle = 'blank' | 'lines' | 'grid' | 'dots';
export type PaperBg = { src: string; x: number; y: number; scale: number };
export type PaperTemplate = PaperBg & { id: string; name: string };
export type HeaderConfig = {
  enabled: boolean;
  text: string;
  dateFormat: string;
  customFormat?: string;
  fontSize: number;
  color?: string;
  align: 'left' | 'center' | 'right';
  height: number;
  margin: number;
};
export type PaperFeel = { texture: number; spine: number; edge: number };
export type CollageTemplate = { id: string; name: string; elements: Piece[]; ratio: number };
export type PageSettings = { paperFeel?: PaperFeel; paperStyle?: PaperStyle; paperColor?: string; paperBg?: PaperBg | null; header?: HeaderConfig; date?: string };
export type Spread = {
  pages?: { left?: PageSettings; right?: PageSettings };
  id: string;
  theme: string;
  layout?: string;
  paperFeel?: PaperFeel;
  paperStyle?: PaperStyle;
  paperColor?: string;
  paperBg?: PaperBg | null;
  header?: HeaderConfig;
  date?: string;
  days: Day[];
  elements: Piece[];
  removed?: string[];
};
export type BookFormat = 'standard' | 'tn-regular';
export type Book = {
  id: string;
  month: string;
  title: string;
  cover: string;
  coverAsset?: string;
  format?: BookFormat;
  paperFeel?: PaperFeel;
  paperStyle?: PaperStyle;
  paperColor?: string;
  paperBg?: PaperBg;
  paperTemplates?: PaperTemplate[];
  collageTemplates?: CollageTemplate[];
  header?: HeaderConfig;
  flyleaf?: Spread;
  spreads: Spread[];
};
export type Journal = { books: Book[]; revision: number };
export type DesignPiece = Omit<Piece, "id" | "locked"> & {sourceId?: string; dayIndex?: number};
export type AIResult = {
  contentEdited?: boolean;
  designConcept?: string;
  elements?: DesignPiece[];
  theme: string;
  layout?: string;
  days: { title: string; text: string; assetIds: string[] }[];
};
export const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const themes = [
  { id: 'herbarium', name: '植物采集', color: '#eae4c9' },
  { id: 'postcard', name: '远方来信', color: '#e5dfcf' },
  { id: 'rose', name: '旧日玫瑰', color: '#eee0d5' },
  { id: 'archive', name: '时光档案', color: '#e5dfc5' },
];

/* 封面材质与配色：每种材质有可辨认的纹理，配色可预览。 */
export type CoverColorway = { id: string; name: string; color: string };
export type CoverMaterial = {
  id: string;
  name: string;
  colorways: CoverColorway[];
};
export const coverMaterials: CoverMaterial[] = [
  {
    id: 'kraft',
    name: '牛皮纸',
    colorways: [
      { id: 'kraft-natural', name: '原色', color: '#b08a5c' },
      { id: 'kraft-honey', name: '蜜色', color: '#c4a06d' },
      { id: 'kraft-coffee', name: '深咖', color: '#86663f' },
    ],
  },
  {
    id: 'leather',
    name: '皮革',
    colorways: [
      { id: 'leather-brown', name: '棕色', color: '#6d4a2f' },
      { id: 'leather-camel', name: '驼色', color: '#b5854f' },
      { id: 'leather-black', name: '黑色', color: '#2e2620' },
      { id: 'leather-wine', name: '酒红', color: '#6b3a38' },
      { id: 'leather-olive', name: '橄榄绿', color: '#5d5d40' },
      { id: 'leather-blue', name: '靛蓝', color: '#3b4d68' },
    ],
  },
  {
    id: 'linen',
    name: '格纹布艺',
    colorways: [
      { id: 'linen-oat', name: '蜂蜜黄格', color: '#e5bc58' },
      { id: 'linen-forest', name: '草莓粉格', color: '#e3b2b7' },
      { id: 'linen-blue', name: '雾霾蓝格', color: '#8fa4b2' },
    ],
  },
  {
    id: 'canvas',
    name: '帆布',
    colorways: [
      { id: 'canvas-army', name: '军绿', color: '#5a5f45' },
      { id: 'canvas-navy', name: '藏青', color: '#33455c' },
      { id: 'canvas-charcoal', name: '炭灰', color: '#45454a' },
    ],
  },
  {
    id: 'hardcover',
    name: '纯色硬壳',
    colorways: [
      { id: 'hard-ink', name: '午夜蓝', color: '#354653' },
      { id: 'hard-wine', name: '勃艮第红', color: '#683d3c' },
      { id: 'hard-ivory', name: '象牙白', color: '#e0d6bd' },
      { id: 'hard-black', name: '墨黑', color: '#26262a' },
    ],
  },
];
/* 旧封面 id 映射到材质配色，老笔记本保持可打开、可保存。 */
const legacyCoverMap: Record<string, string> = {
  walnut: 'leather-brown',
  forest: 'linen-forest',
  wine: 'hard-wine',
  ink: 'hard-ink',
  'travel-note': 'linen-oat',
  'camel-leather': 'leather-camel',
  'black-leather': 'leather-black',
  'olive-leather': 'leather-olive',
  'blue-leather': 'leather-blue',
};
export function coverInfo(cover?: string): {
  material: CoverMaterial;
  colorway: CoverColorway;
} {
  const id = legacyCoverMap[cover || ''] || cover || 'leather-brown';
  for (const material of coverMaterials) {
    const colorway = material.colorways.find((c) => c.id === id);
    if (colorway) return { material, colorway };
  }
  return { material: coverMaterials[1], colorway: coverMaterials[1].colorways[0] };
}

export const formats = [
  { id: 'standard', name: '常规', ratio: 1.43, scale: 1, desc: '较宽的页面比例，经典手帐开本' },
  { id: 'tn-regular', name: 'Travel Notes', ratio: 1.05, scale: 1, desc: '窄长的页面比例 110×210mm' },
] as const;
export const bookFormat = (book?: Book) =>
  formats.find((f) => f.id === book?.format) || formats[0];
export const monthName = (month: string) =>
  new Date(month + '-02').toLocaleDateString('en-US', { month: 'long' });
export const monthCN = (month: string) =>
  new Date(month + '-02').toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
  });

/* 自由页眉系统：文字模板 + {date} {weekday} {page} 占位符。 */
export const defaultHeader = (): HeaderConfig => ({
  enabled: true,
  text: '{日期}',
  dateFormat: 'dot',
  fontSize: 14,
  align: 'right',
  height: 7,
  margin: 6,
});
export const headerDateFormats = [
  { id: 'dot', name: '2026.09.06' },
  { id: 'dash', name: '2026-09-06' },
  { id: 'slash', name: '2026 / 09 / 06' },
  { id: 'cn', name: '9月6日' },
  { id: 'en', name: 'Sep 6, 2026' },
  { id: 'custom', name: '自定义格式' },
];
const weekdayCN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function formatHeaderDate(
  dateStr: string | undefined,
  formatId: string,
  customFormat?: string,
): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = String(d.getFullYear());
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (formatId === 'en')
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  const pattern =
    formatId === 'custom'
      ? customFormat || 'yyyy.MM.dd'
      : {
          dot: 'yyyy.MM.dd',
          dash: 'yyyy-MM-dd',
          slash: 'yyyy / MM / dd',
          cn: 'M月d日',
        }[formatId] || 'yyyy.MM.dd';
  return pattern
    .replaceAll('yyyy', yyyy)
    .replaceAll('MM', MM)
    .replaceAll('dd', dd)
    .replaceAll('M', String(d.getMonth() + 1))
    .replaceAll('d', String(d.getDate()));
}
export function renderHeader(
  header: HeaderConfig,
  context: { date?: string; page?: number },
): string {
  const d =
    context.date && /^\d{4}-\d{2}-\d{2}$/.test(context.date)
      ? new Date(context.date + 'T12:00:00')
      : null;
  return header.text.replaceAll('{日期}', '{date}').replaceAll('{星期}', '{weekday}').replaceAll('{页码}', '{page}')
    .replaceAll('{date}', formatHeaderDate(context.date, header.dateFormat, header.customFormat))
    .replaceAll('{weekday}', d && !Number.isNaN(d.getTime()) ? weekdayCN[d.getDay()] : '')
    .replaceAll('{page}', context.page !== undefined ? String(context.page) : '');
}
export function sanitizeHeader(header: HeaderConfig): HeaderConfig {
  const aligns = ['left', 'center', 'right'];
  return {
    enabled: !!header.enabled,
    text: String(header.text || '').slice(0, 120),
    dateFormat: String(header.dateFormat || 'dot'),
    customFormat: header.customFormat?.slice(0, 40),
    fontSize: Math.max(10, Math.min(24, Number(header.fontSize) || 14)),
    color: header.color && /^#[0-9a-f]{6}$/i.test(header.color) ? header.color : undefined,
    align: aligns.includes(header.align) ? header.align : 'right',
    height: Math.max(4, Math.min(16, Number(header.height) || 7)),
    margin: Math.max(0, Math.min(16, Number(header.margin) || 6)),
  };
}
/* 页眉解析：单页设置优先，缺省继承整本；老笔记本默认关闭。 */
export function headerOf(book?: Book, spread?: Spread): HeaderConfig {
  return (
    spread?.header ||
    book?.header || { ...defaultHeader(), enabled: false }
  );
}
/* 页眉应用于整本：清除所有单页覆盖；应用于单页：只影响该页。 */
export function applyHeader(
  book: Book,
  header: HeaderConfig,
  spreadId?: string,
): Book {
  const clean = sanitizeHeader(header);
  if (spreadId)
    return {
      ...book,
      spreads: book.spreads.map((s) =>
        s.id === spreadId ? { ...clearPageSettings(s,['header']), header: clean } : s,
      ),
    };
  return {
    ...book,
    header: clean,
    spreads: book.spreads.map((s) => ({ ...clearPageSettings(s,['header']), header: undefined })),
  };
}

/* 自定义内页背景：可保存为模板，整本默认或单页应用。 */
export function paperBgOf(book?: Book, spread?: Spread): PaperBg | undefined {
  if (spread?.paperBg === null) return undefined;
  return spread?.paperBg || book?.paperBg;
}
export function applyPaperBg(
  book: Book,
  bg: PaperBg | null,
  spreadId?: string,
): Book {
  if (spreadId)
    return {
      ...book,
      spreads: book.spreads.map((s) =>
        s.id === spreadId ? { ...clearPageSettings(s,['paperBg']), paperBg: bg } : s,
      ),
    };
  return {
    ...book,
    paperBg: bg || undefined,
    spreads: book.spreads.map((s) => ({ ...clearPageSettings(s,['paperBg']), paperBg: undefined })),
  };
}

export function newBook(
  month: string,
  cover = 'linen-oat',
  title = '拾光集',
  format: BookFormat = 'standard',
  opts?: {
    paperStyle?: PaperStyle;
    paperColor?: string;
    header?: HeaderConfig;
  },
): Book {
  return {
    id: uid(),
    month,
    title,
    cover,
    format,
    paperStyle: opts?.paperStyle,
    paperColor: opts?.paperColor,
    header: opts?.header ? sanitizeHeader(opts.header) : defaultHeader(),
    flyleaf: { id: uid(), theme: 'herbarium', days: [], elements: [] },
    spreads: [blankSpread()],
  };
}
export const ensureFlyleaf = (book: Book): Book =>
  book.flyleaf
    ? book
    : { ...book, flyleaf: { id: uid(), theme: 'herbarium', days: [], elements: [] } };
export function localResult(
  days: Pick<Day, 'raw'>[],
  theme = 'herbarium',
): AIResult {
  return {
    theme,
    days: days.map((d) => ({ title: '今日小记', text: d.raw, assetIds: [] })),
  };
}
function assetPiece(
  a: Asset,
  x: number,
  y: number,
  w: number,
  rotation: number,
  dayId?: string,
): Piece {
  return {
    id: uid(),
    kind: 'asset',
    role: 'decor',
    assetId: a.id,
    src: a.src,
    x,
    y,
    w,
    rotation,
    locked: false,
    dayId,
  };
}
export function dayPieces(
  day: Day,
  index: number,
  assets: Asset[],
  picks: string[] = [],
  variant = 0,
  layout = 'collage',
  topOffset = 0,
): Piece[] {
  const offset = (index % 2) * 50,
    photoCount = Math.min(day.photos.length, 6);
  const bodyY = (photoCount ? 48 : layout === 'letter' ? 25 : 28) + topOffset;
  const bodySize = day.text.length > 480 ? 12 : day.text.length > 240 ? 15 : 18;
  const elements: Piece[] = [
    {
      id: uid(),
      kind: 'text',
      role: 'title',
      dayId: day.id,
      text: day.title,
      x: offset + 6,
      y: 15 + topOffset,
      w: 37,
      rotation: 0,
      locked: false,
      fontSize: 28,
    },
    {
      id: uid(),
      kind: 'text',
      role: 'body',
      dayId: day.id,
      text: day.text,
      x: offset + (layout === 'airy' ? 9 : 6),
      y: bodyY,
      w: layout === 'airy' ? 31 : 35,
      rotation: 0,
      locked: false,
      fontSize: bodySize,
    },
  ];
  for (let i = 0; i < photoCount; i++) {
    const large = photoCount === 1;
    elements.push({
      id: uid(),
      kind: 'photo',
      dayId: day.id,
      src: day.photos[i],
      photoOriginal: day.photos[i],
      x: offset + 6 + (large ? 0 : (i % 3) * 12),
      y: 26 + topOffset + Math.floor(i / 3) * 11,
      w: large ? 28 : 11,
      rotation: (i % 2 ? -1 : 1) * (2 + (variant % 3)),
      locked: false,
      frame: 'polaroid',
      crop: 50,
    });
  }
  const pool = assets.filter((a) => picks.includes(a.id));
  const source = pool;
  if (source.length && layout !== 'letter') {
    elements.push(
      assetPiece(
        source[(index * 7 + variant * 3) % source.length],
        offset + (photoCount ? 34 : 23),
        (photoCount ? 27 : 52) + topOffset,
        photoCount ? 12 : 19,
        index ? -7 : 7,
        day.id,
      ),
    );
  }
  return elements;
}
export function appendDay(book:Book,day:Day,result:AIResult,assets:Asset[],spreadIndex=book.spreads.length-1,side?:number,topOffset=0):Book{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||Number.isNaN(Date.parse(day.date)))throw Error('记录日期无效。');
 if(day.date.slice(0,7)!==book.month)throw Error('记录日期与手帐月份不一致。');
 const spreads=structuredClone(book.spreads);if(!spreads.length)spreads.push(blankSpread());const spread=spreads[Math.max(0,Math.min(spreadIndex,spreads.length-1))];
 if(!spread.days.length){spread.theme=result.theme;spread.layout=result.layout||'collage';spread.date=day.date}
 const content=result.days[0],complete={...day,title:content.title,text:content.text};
 const index=side??spread.days.length%2;const existing=spread.days.length;spread.days.push(complete);
 const pieces=result.elements ? reserveHeaderSpace(result.elements,topOffset).map(p=>({...p,id:uid(),dayId:complete.id,locked:false})) : dayPieces(complete,index,assets,content.assetIds,0,spread.layout,topOffset);
 const shift=result.elements?0:Math.min(35,Math.floor(existing/2)*22);spread.elements.push(...pieces.map(p=>({...p,y:Math.min(85,p.y+shift)})));
 return {...book,spreads};
}
export const pieceKey = (p: Piece) =>
  p.kind === 'text'
    ? `${p.dayId}:${p.paragraphIndex !== undefined ? p.id : p.role || p.id}`
    : p.kind === 'photo'
      ? `${p.dayId}:${p.photoOriginal || p.src}`
      : p.assetId || p.id;
export function regenerateSpread(
  spread: Spread,
  result: AIResult,
  assets: Asset[],
  variant = 1,
): Spread {
  const locked = spread.elements.filter((e) => e.locked);
  const days = spread.days.map((d, i) => ({
    ...d,
    title: result.elements || locked.some((e) => e.dayId === d.id && e.role === 'title')
      ? d.title
      : result.days[i].title,
    text: result.elements || locked.some((e) => e.dayId === d.id && e.role === 'body')
      ? d.text
      : result.days[i].text,
  }));
  const newPieces = result.elements ? result.elements.map(p => {
      const source = spread.elements.find(e => e.id === p.sourceId);
      return {...source, ...p, colorRuns:source?.text===p.text?source?.colorRuns:p.colorRuns, id: source?.id || p.sourceId || uid(), dayId: source?.dayId || p.dayId || days[p.dayIndex ?? -1]?.id, locked: false};
    }) : days.flatMap((d, i) =>
      dayPieces(d, i, assets, result.days[i].assetIds, variant, result.layout),
    );
  const signature = pieceKey;
  return {
    ...spread,
    theme: result.theme,
    layout: result.layout || 'collage',
    days: result.contentEdited ? days.map(d=>{const paragraphs=newPieces.filter(p=>p.role==='body'&&p.dayId===d.id);return paragraphs.length?{...d,text:paragraphs.map(p=>p.text).join('\n\n')}:d}) : days,
    elements: [
      ...newPieces
        .filter((p) => !spread.removed?.includes(signature(p)))
        .filter((p) => !locked.some((l) => l.id === p.id || signature(l) === signature(p)))
        .filter(
          (p) =>
            !locked.some((l) => {
              if (result.elements || p.kind === 'text') return false;
              return (
                Math.abs(p.x - l.x) < Math.min(p.w, l.w) * 0.5 &&
                Math.abs(p.y - l.y) < 12
              );
            }),
        ),
      ...locked,
    ],
  };
}

export function paperSettings(book: Book | undefined, spread?: Spread) {
  return {
    style: spread?.paperStyle || book?.paperStyle || 'blank',
    color: spread?.paperColor || book?.paperColor || (book?.format?.startsWith('tn-')||book?.cover==='travel-note'?'#f4eddc':'#ffffff'),
  };
}
export function applyPaper(
  book: Book,
  style: PaperStyle,
  color: string,
  spreadId?: string,
): Book {
  if (
    !['blank', 'lines', 'grid', 'dots'].includes(style) ||
    !/^#[0-9a-f]{6}$/i.test(color)
  )
    throw Error('内页设置无效');
  return spreadId
    ? {
        ...book,
        spreads: book.spreads.map((s) =>
          s.id === spreadId
            ? { ...clearPageSettings(s,['paperStyle','paperColor']), paperStyle: style, paperColor: color }
            : s,
        ),
      }
    : {
        ...book,
        paperStyle: style,
        paperColor: color,
        spreads: book.spreads.map((s) => ({
          ...clearPageSettings(s,['paperStyle','paperColor']),
          paperStyle: undefined,
          paperColor: undefined,
        })),
      };
}

export function blankSpread():Spread{return{id:uid(),theme:"herbarium",date:today(),days:[],elements:[]}}
export function addBlankSpread(book:Book):Book{return{...book,spreads:[...book.spreads,blankSpread()]}}

export function pageSpread(spread: Spread | undefined, side: 'left' | 'right'): Spread | undefined {
  return spread ? {...spread,...spread.pages?.[side]} : undefined;
}
export function patchPage(book: Book, spreadId: string, side: 'left' | 'right', patch: PageSettings): Book {
  return {...book,spreads:book.spreads.map(s=>s.id===spreadId?{...s,pages:{...s.pages,[side]:{...s.pages?.[side],...patch}}}:s)};
}
function clearPageSettings(spread: Spread, fields: (keyof PageSettings)[]): Spread {
  if(!spread.pages)return spread;
  const pages={...spread.pages};
  for(const side of ['left','right'] as const){
    if(!pages[side])continue;
    const settings={...pages[side]};
    for(const key of fields)delete settings[key];
    pages[side]=settings;
  }
  return {...spread,pages};
}
export function pageInk(book: Book, spread: Spread | undefined, side: 'left' | 'right'): string {
  const c=paperSettings(book,pageSpread(spread,side)).color;
  return parseInt(c.slice(1,3),16)*.299+parseInt(c.slice(3,5),16)*.587+parseInt(c.slice(5,7),16)*.114<125?'#f5f5ed':'#343b34';
}

/** Fit a new design below the header; existing locked elements keep their geometry. */
export function reserveHeaderSpace(elements: DesignPiece[], top: number, lockedIds: string[] = []): DesignPiece[] {
  const inset=Math.max(0,Math.min(20,top));
  if(!inset)return elements;
  const factor=(100-inset)/100;
  return elements.map(p=>p.sourceId && lockedIds.includes(p.sourceId)?p:{...p,y:inset+p.y*factor,...(p.h!==undefined?{h:p.h*factor}:{}),...(p.fontSize!==undefined?{fontSize:p.fontSize*factor}:{})});
}
