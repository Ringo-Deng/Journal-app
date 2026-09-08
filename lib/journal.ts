export type Asset = {
  id: string;
  name: string;
  originalSrc?: string;
  category: string;
  tags: string[];
  src: string;
  sourceUrl: string;
  sourceImage?: string;
  source?: {type?:string;pinId?:string;originalUrl?:string;imageUrl?:string;sha256?:string};
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
      { id: 'linen-oat', name: '蜂蜜燕麦格', color: '#c7a96f' },
      { id: 'linen-forest', name: '灰粉格', color: '#c8a5a7' },
      { id: 'linen-blue', name: '雾霾蓝格', color: '#879aa5' },
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
  { id: 'slash', name: '2026/09/06' },
  { id: 'cn', name: '2026年9月6日' },
  { id: 'md', name: '09.06' },
  { id: 'mdslash', name: '09/06' },
  { id: 'monthday', name: '9月6日' },
] as const;
export function formatHeaderDate(date?: string, format='dot'){
  if(!date)return '';
  const d=new Date(date+'T00:00:00');if(Number.isNaN(d.getTime()))return date;
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  if(format==='dash')return `${y}-${m}-${day}`;if(format==='slash')return `${y}/${m}/${day}`;if(format==='cn')return `${y}年${d.getMonth()+1}月${d.getDate()}日`;if(format==='md')return `${m}.${day}`;if(format==='mdslash')return `${m}/${day}`;if(format==='monthday')return `${d.getMonth()+1}月${d.getDate()}日`;return `${y}.${m}.${day}`;
}
export const WEEKDAYS=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
export function pageHeaderText(header:HeaderConfig|undefined,date?:string,pageNumber?:number){
  const h=header||defaultHeader();const d=date?new Date(date+'T00:00:00'):null;const formatted=formatHeaderDate(date,h.dateFormat);
  return (h.text||'{日期}').replaceAll('{日期}',formatted).replaceAll('{date}',formatted).replaceAll('{星期}',d&&!Number.isNaN(d.getTime())?WEEKDAYS[d.getDay()]:'').replaceAll('{weekday}',d&&!Number.isNaN(d.getTime())?WEEKDAYS[d.getDay()]:'').replaceAll('{页码}',pageNumber?String(pageNumber):'').replaceAll('{page}',pageNumber?String(pageNumber):'');
}

const defaultPaperFeel = (): PaperFeel => ({ texture: 34, spine: 62, edge: 30 });
const clampPercent = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
};
export function paperSettings(book?: Book, spread?: Spread, side?: 'left' | 'right') {
  const page = side ? spread?.pages?.[side] : undefined;
  const legacyFeel = spread?.paperFeel;
  const feel = page?.paperFeel || legacyFeel || book?.paperFeel || defaultPaperFeel();
  return {
    style: page?.paperStyle || spread?.paperStyle || book?.paperStyle || 'blank',
    color: page?.paperColor || spread?.paperColor || book?.paperColor || '#f3ecd9',
    background: page?.paperBg === null ? null : page?.paperBg || spread?.paperBg || book?.paperBg || null,
    header: page?.header || spread?.header || book?.header || defaultHeader(),
    date: page?.date || spread?.date,
    feel: {
      texture: clampPercent(feel.texture, 34),
      spine: clampPercent(feel.spine, 62),
      edge: clampPercent(feel.edge, 30),
    },
  };
}

export const sampleDays: Day[] = [
  {
    id: 'd1',
    date: '2025-08-03',
    raw: '清晨去花市，买了一把洋甘菊和薄荷。下午在咖啡馆读完一章书，雨落在玻璃窗上。',
    title: '花市与雨',
    text: '花摊挤在旧街拐角，洋甘菊像很小的太阳。\n薄荷叶被老板装进牛皮纸袋，回家时整个包里都是清凉的味道。\n午后的雨来得突然，我坐在靠窗的位置，看雨水把街灯晕成一团金色。',
    photos: [],
  },
  {
    id: 'd2',
    date: '2025-08-12',
    raw: '和朋友沿河散步，傍晚风很凉。路过旧书店带回一本植物图鉴，夹着陌生人的车票。',
    title: '河边旧书店',
    text: '傍晚的风沿着河面吹过来，带着一点潮湿。\n旧书店的木门很窄，书架一路堆到天花板。那张旧车票夹在植物图鉴里，背面用铅笔写着一个早已过去的日期。',
    photos: [],
  },
];

export const defaultSpread = (): Spread => ({
  id: uid(),
  theme: 'herbarium',
  paperFeel: defaultPaperFeel(),
  paperStyle: 'blank',
  paperColor: '#f3ecd9',
  paperBg: null,
  header: defaultHeader(),
  date: today(),
  days: [],
  elements: [],
  removed: [],
});

export const defaultBook = (): Book => ({
  id: uid(),
  month: today().slice(0, 7),
  title: '拾光集',
  cover: 'linen-oat',
  format: 'standard',
  paperFeel: defaultPaperFeel(),
  paperStyle: 'blank',
  paperColor: '#f3ecd9',
  paperBg: undefined,
  paperTemplates: [],
  collageTemplates: [],
  header: defaultHeader(),
  flyleaf: defaultSpread(),
  spreads: [defaultSpread()],
});