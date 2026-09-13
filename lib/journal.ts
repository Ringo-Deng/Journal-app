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
  highlightRuns?: {start:number;end:number;color:string}[];
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
export type PaperRulingSize = 'small' | 'medium' | 'large';
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
export type PageSettings = { paperFeel?: PaperFeel; paperStyle?: PaperStyle; paperColor?: string; paperRulingSize?: PaperRulingSize; paperBg?: PaperBg | null; header?: HeaderConfig; date?: string };
export type Spread = {
  pages?: { left?: PageSettings; right?: PageSettings };
  id: string;
  theme: string;
  layout?: string;
  paperFeel?: PaperFeel;
  paperStyle?: PaperStyle;
  paperColor?: string;
  paperRulingSize?: PaperRulingSize;
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
  paperRulingSize?: PaperRulingSize;
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
  headerReserved?: boolean;
  unchanged?: boolean;
  contentEdited?: boolean;
  designConcept?: string;
  elements?: DesignPiece[];
  theme: string;
  layout?: string;
  days: { title: string; text: string; assetIds: string[] }[];
};
export const uid = () => crypto.randomUUID();
export function paperTemplateFrom(bg: PaperBg, name: string, id = uid()): PaperTemplate {
  return {
    ...bg,
    id,
    name: name.trim().slice(0, 20) || '我的内页',
  };
}
export function putPaperTemplate(templates: PaperTemplate[] | undefined, template: PaperTemplate): PaperTemplate[] {
  const existing = templates?.find((item) => item.id === template.id || item.src === template.src);
  const saved = existing ? { ...template, id: existing.id } : template;
  return [saved, ...(templates || []).filter((item) => item.id !== saved.id && item.src !== saved.src)];
}
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
    id: 'linen',
    name: '格纹布艺',
    colorways: [
      { id: 'linen-oat', name: '奶黄格纹', color: '#f4ce75' },
      { id: 'linen-forest', name: '柔粉格纹', color: '#e8b9ba' },
      { id: 'linen-blue', name: '雾蓝格纹', color: '#91a9b5' },
    ],
  },
  {
    id: 'kraft',
    name: '牛皮纸',
    colorways: [
      { id: 'kraft-natural', name: '原色', color: '#b08a5c' },
      { id: 'kraft-honey', name: '蜜色', color: '#c4a06d' },
      { id: 'kraft-coffee', name: '深咖', color: '#86663f' },
    ],
  },
];
/* 旧材质只用于读取已有笔记本，不再出现在新建/设置入口。 */
const legacyCoverMaterials: CoverMaterial[] = [
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
const resolvableCoverMaterials = [...coverMaterials, ...legacyCoverMaterials];
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
const customCoverPattern = /^custom-([0-9a-f]{6})$/i;
export const DEFAULT_CUSTOM_COVER_COLOR = '#8c9a83';
export function customCoverId(color: string) {
  const normalized = color.trim().toLowerCase();
  return `custom-${(/^#[0-9a-f]{6}$/i.test(normalized) ? normalized : DEFAULT_CUSTOM_COVER_COLOR).slice(1)}`;
}
export function isCustomCover(cover?: string) {
  return customCoverPattern.test(cover || '');
}
export function coverInfo(cover?: string): { material: CoverMaterial; colorway: CoverColorway } {
  const id = legacyCoverMap[cover || ''] || cover || 'leather-brown';
  const custom = id.match(customCoverPattern);
  if (custom) {
    const colorway = { id: customCoverId(`#${custom[1]}`), name: '自定义', color: `#${custom[1].toLowerCase()}` };
    return { material: { id: 'custom', name: '自定义颜色', colorways: [colorway] }, colorway };
  }
  for (const material of resolvableCoverMaterials) {
    const colorway = material.colorways.find((c) => c.id === id);
    if (colorway) return { material, colorway };
  }
  return { material: legacyCoverMaterials[0], colorway: legacyCoverMaterials[0].colorways[0] };
}
export function coverChoiceForSettings(cover?: string) {
  if (isCustomCover(cover)) return coverInfo(cover).colorway.id;
  const info = coverInfo(cover);
  return coverMaterials.some((material) => material.id === info.material.id)
    ? info.colorway.id
    : customCoverId(info.colorway.color);
}

export const formats = [
  { id: 'standard', name: '常规', ratio: 1.43, scale: 1, desc: '较宽的页面比例，经典手帐开本' },
  { id: 'tn-regular', name: 'Travel Notes', ratio: 1.05, scale: 1, desc: '窄长的页面比例 110×210mm' },
] as const;
export const bookFormat = (book?: Book) => formats.find((f) => f.id === book?.format) || formats[0];
export const monthName = (month: string) => new Date(month + '-02').toLocaleDateString('en-US', { month: 'long' });
export const monthCN = (month: string) => new Date(month + '-02').toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });

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
  { id: 'custom', name: '自定义格式' },
] as const;
export function formatHeaderDate(date?: string, format='dot', customFormat?:string){
  if(!date)return '';
  const d=new Date(date+'T00:00:00');if(Number.isNaN(d.getTime()))return date;
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  if(format==='custom'){
    const pattern=typeof customFormat==='string'&&customFormat?customFormat:'yyyy.MM.dd';
    const tokens:Record<string,string>={yyyy:String(y),MM:m,dd:day,M:String(d.getMonth()+1),d:String(d.getDate())};
    return pattern.replace(/yyyy|MM|dd|M|d/g,token=>tokens[token]);
  }
  if(format==='dash')return `${y}-${m}-${day}`;
  if(format==='slash')return `${y}/${m}/${day}`;
  if(format==='cn')return `${y}年${d.getMonth()+1}月${d.getDate()}日`;
  if(format==='md')return `${m}.${day}`;
  if(format==='mdslash')return `${m}/${day}`;
  if(format==='monthday')return `${d.getMonth()+1}月${d.getDate()}日`;
  return `${y}.${m}.${day}`;
}
export const WEEKDAYS=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
export function pageHeaderText(header:HeaderConfig|undefined,date?:string,pageNumber?:number){
  const h=header||defaultHeader();
  const d=date?new Date(date+'T00:00:00'):null;
  const formatted=formatHeaderDate(date,h.dateFormat,h.customFormat);
  return (h.text||'{日期}')
    .replaceAll('{日期}',formatted)
    .replaceAll('{date}',formatted)
    .replaceAll('{星期}',d&&!Number.isNaN(d.getTime())?WEEKDAYS[d.getDay()]:'')
    .replaceAll('{weekday}',d&&!Number.isNaN(d.getTime())?WEEKDAYS[d.getDay()]:'')
    .replaceAll('{页码}',pageNumber!==undefined?String(pageNumber):'')
    .replaceAll('{page}',pageNumber!==undefined?String(pageNumber):'');
}
export function renderHeader(header:HeaderConfig,context:{date?:string;page?:number}){
  return pageHeaderText(header,context.date,context.page);
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
export function headerOf(book?: Book, spread?: Spread): HeaderConfig {
  return spread?.header || book?.header || { ...defaultHeader(), enabled: false };
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
  const savedRulingSize = page?.paperRulingSize || spread?.paperRulingSize || book?.paperRulingSize;
  const rulingSize: PaperRulingSize = savedRulingSize && ['small','medium','large'].includes(savedRulingSize) ? savedRulingSize : 'medium';
  return {
    style: page?.paperStyle || spread?.paperStyle || book?.paperStyle || 'blank',
    color: page?.paperColor || spread?.paperColor || book?.paperColor || '#f3ecd9',
    rulingSize,
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
  { id:'d1',date:'2025-08-03',raw:'清晨去花市，买了一把洋甘菊和薄荷。下午在咖啡馆读完一章书，雨落在玻璃窗上。',title:'花市与雨',text:'花摊挤在旧街拐角，洋甘菊像很小的太阳。\n薄荷叶被老板装进牛皮纸袋，回家时整个包里都是清凉的味道。\n午后的雨来得突然，我坐在靠窗的位置，看雨水把街灯晕成一团金色。',photos:[] },
  { id:'d2',date:'2025-08-12',raw:'和朋友沿河散步，傍晚风很凉。路过旧书店带回一本植物图鉴，夹着陌生人的车票。',title:'河边旧书店',text:'傍晚的风沿着河面吹过来，带着一点潮湿。\n旧书店的木门很窄，书架一路堆到天花板。那张旧车票夹在植物图鉴里，背面用铅笔写着一个早已过去的日期。',photos:[] },
];
export const defaultSpread = (): Spread => ({
  id: uid(), theme:'herbarium', paperFeel:defaultPaperFeel(), paperStyle:'blank', paperColor:'#f3ecd9', paperBg:null, header:defaultHeader(), date:today(), days:[], elements:[], removed:[],
});
export const defaultBook = (): Book => ({
  id:uid(),month:today().slice(0,7),title:'拾光集',cover:'linen-oat',format:'standard',paperFeel:defaultPaperFeel(),paperStyle:'blank',paperColor:'#f3ecd9',paperBg:undefined,paperTemplates:[],collageTemplates:[],header:defaultHeader(),flyleaf:defaultSpread(),spreads:[defaultSpread()],
});

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
export function applyHeader(book:Book,header:HeaderConfig,spreadId?:string):Book{
  const clean=sanitizeHeader(header);
  if(spreadId)return{...book,spreads:book.spreads.map(s=>s.id===spreadId?{...clearPageSettings(s,['header']),header:clean}:s)};
  return{...book,header:clean,spreads:book.spreads.map(s=>({...clearPageSettings(s,['header']),header:undefined}))};
}
export function paperBgOf(book?:Book,spread?:Spread):PaperBg|undefined{
  if(spread?.paperBg===null)return undefined;
  return spread?.paperBg||book?.paperBg;
}
export function applyPaperBg(book:Book,bg:PaperBg|null,spreadId?:string):Book{
  if(spreadId)return{...book,spreads:book.spreads.map(s=>s.id===spreadId?{...clearPageSettings(s,['paperBg']),paperBg:bg}:s)};
  return{...book,paperBg:bg||undefined,spreads:book.spreads.map(s=>({...clearPageSettings(s,['paperBg']),paperBg:undefined}))};
}
export function blankSpread():Spread{return{id:uid(),theme:'herbarium',date:today(),days:[],elements:[]}}
export function newBook(month:string,cover='linen-oat',title='拾光集',format:BookFormat='standard',opts?:{paperStyle?:PaperStyle;paperColor?:string;paperRulingSize?:PaperRulingSize;header?:HeaderConfig}):Book{
  return{id:uid(),month,title,cover,format,paperStyle:opts?.paperStyle,paperColor:opts?.paperColor,paperRulingSize:opts?.paperRulingSize,header:opts?.header?sanitizeHeader(opts.header):defaultHeader(),flyleaf:{id:uid(),theme:'herbarium',days:[],elements:[]},spreads:[blankSpread()]};
}
export const ensureFlyleaf=(book:Book):Book=>book.flyleaf?book:{...book,flyleaf:{id:uid(),theme:'herbarium',days:[],elements:[]}};
export function localResult(days:Pick<Day,'raw'>[],theme='herbarium'):AIResult{return{theme,days:days.map(d=>({title:'今日小记',text:d.raw,assetIds:[]}))}}
function assetPiece(a:Asset,x:number,y:number,w:number,rotation:number,dayId?:string):Piece{return{id:uid(),kind:'asset',role:'decor',assetId:a.id,src:a.src,x,y,w,rotation,locked:false,dayId}}
export function dayPieces(day:Day,index:number,assets:Asset[],picks:string[]=[],variant=0,layout='collage',topOffset=0):Piece[]{
  const offset=(index%2)*50,photoCount=Math.min(day.photos.length,6);
  const bodyY=(photoCount?48:layout==='letter'?25:28)+topOffset;
  const bodySize=day.text.length>480?12:day.text.length>240?15:18;
  const elements:Piece[]=[
    {id:uid(),kind:'text',role:'title',dayId:day.id,text:day.title,x:offset+6,y:15+topOffset,w:37,rotation:0,locked:false,fontSize:28},
    {id:uid(),kind:'text',role:'body',dayId:day.id,text:day.text,x:offset+(layout==='airy'?9:6),y:bodyY,w:layout==='airy'?31:35,rotation:0,locked:false,fontSize:bodySize},
  ];
  for(let i=0;i<photoCount;i++){
    const large=photoCount===1;
    elements.push({id:uid(),kind:'photo',dayId:day.id,src:day.photos[i],photoOriginal:day.photos[i],x:offset+6+(large?0:(i%3)*12),y:26+topOffset+Math.floor(i/3)*11,w:large?28:11,rotation:(i%2?-1:1)*(2+(variant%3)),locked:false,frame:'polaroid',crop:50});
  }
  const source=assets.filter(a=>picks.includes(a.id));
  if(source.length&&layout!=='letter')elements.push(assetPiece(source[(index*7+variant*3)%source.length],offset+(photoCount?34:23),(photoCount?27:52)+topOffset,photoCount?12:19,index?-7:7,day.id));
  return elements;
}
export function appendDay(book:Book,day:Day,result:AIResult,assets:Asset[],spreadIndex=book.spreads.length-1,side?:number,topOffset=0):Book{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||Number.isNaN(Date.parse(day.date)))throw Error('记录日期无效。');
  if(day.date.slice(0,7)!==book.month)throw Error('记录日期与手帐月份不一致。');
  const spreads=structuredClone(book.spreads);if(!spreads.length)spreads.push(blankSpread());const spread=spreads[Math.max(0,Math.min(spreadIndex,spreads.length-1))];
  if(!spread.days.length){spread.theme=result.theme;spread.layout=result.layout||'collage';spread.date=day.date}
  const content=result.days[0],complete={...day,title:content.title,text:content.text};
  const index=side??spread.days.length%2;const existing=spread.days.length;spread.days.push(complete);
  const pieces=result.elements?(result.headerReserved?result.elements:reserveHeaderSpace(result.elements,topOffset)).map(p=>({...p,id:uid(),dayId:complete.id,locked:false})):dayPieces(complete,index,assets,content.assetIds,0,spread.layout,topOffset);
  const shift=result.elements?0:Math.min(35,Math.floor(existing/2)*22);spread.elements.push(...pieces.map(p=>({...p,y:result.headerReserved?p.y:Math.min(85,p.y+shift)})));
  return{...book,spreads};
}
export const pieceKey=(p:Piece)=>p.kind==='text'?`${p.dayId}:${p.paragraphIndex!==undefined?p.id:p.role||p.id}`:p.kind==='photo'?`${p.dayId}:${p.photoOriginal||p.src}`:p.assetId||p.id;
export function removePiecesFromSpread(spread:Spread,pieceIds:Iterable<string>):Spread{
  const ids=new Set(pieceIds);
  if(!ids.size||!spread.elements.some(piece=>ids.has(piece.id)))return spread;
  return {
    ...spread,
    removed:[...(spread.removed||[]),...spread.elements.filter(piece=>ids.has(piece.id)).map(pieceKey)],
    elements:spread.elements
      .filter(piece=>!ids.has(piece.id))
      .map(piece=>piece.attachedTo&&ids.has(piece.attachedTo)?{...piece,attachedTo:undefined}:piece),
  };
}
export function regenerateSpread(spread:Spread,result:AIResult,assets:Asset[],variant=1):Spread{
  const locked=spread.elements.filter(e=>e.locked);
  const days=spread.days.map((d,i)=>({...d,title:result.elements||locked.some(e=>e.dayId===d.id&&e.role==='title')?d.title:result.days[i].title,text:result.elements||locked.some(e=>e.dayId===d.id&&e.role==='body')?d.text:result.days[i].text}));
  const newPieces=result.elements?result.elements.map(p=>{const source=spread.elements.find(e=>e.id===p.sourceId);if(source?.locked)return source;return{...source,...p,colorRuns:source?.text===p.text?source?.colorRuns:p.colorRuns,highlightRuns:source?.text===p.text?source?.highlightRuns:p.highlightRuns,id:source?.id||p.sourceId||uid(),dayId:source?.dayId||p.dayId||days[p.dayIndex??-1]?.id,locked:false} as Piece;}):days.flatMap((d,i)=>dayPieces(d,i,assets,result.days[i].assetIds,variant,result.layout));
  const signature=pieceKey;
  // Complete AI plans already carry retained pieces in their original layer order.
  // Restore locked originals in place; only legacy plans append their missing locks.
  const elements=result.elements
    ? [...newPieces.filter(p=>spread.elements.some(original=>original.id===p.id)||!spread.removed?.includes(signature(p))),...locked.filter(p=>!newPieces.some(next=>next.id===p.id))]
    : [...newPieces.filter(p=>!spread.removed?.includes(signature(p))).filter(p=>!locked.some(l=>l.id===p.id||signature(l)===signature(p))).filter(p=>!locked.some(l=>p.kind!=='text'&&Math.abs(p.x-l.x)<Math.min(p.w,l.w)*.5&&Math.abs(p.y-l.y)<12)),...locked];
  return{...spread,theme:result.theme,layout:result.layout||'collage',days:result.contentEdited?days.map(d=>{const paragraphs=elements.filter(p=>p.role==='body'&&p.dayId===d.id);return paragraphs.length?{...d,text:paragraphs.map(p=>p.text).join('\n\n')}:d}):days,elements};
}
export function applyPaper(book:Book,style:PaperStyle,color:string,spreadId?:string,rulingSize?:PaperRulingSize):Book{
  if(!['blank','lines','grid','dots'].includes(style)||!/^#[0-9a-f]{6}$/i.test(color)||rulingSize!==undefined&&!['small','medium','large'].includes(rulingSize))throw Error('内页设置无效');
  const target=spreadId?book.spreads.find(s=>s.id===spreadId):undefined;
  const size=rulingSize||paperSettings(book,target).rulingSize;
  return spreadId?{...book,spreads:book.spreads.map(s=>s.id===spreadId?{...clearPageSettings(s,['paperStyle','paperColor','paperRulingSize']),paperStyle:style,paperColor:color,paperRulingSize:size}:s)}:{...book,paperStyle:style,paperColor:color,paperRulingSize:size,spreads:book.spreads.map(s=>({...clearPageSettings(s,['paperStyle','paperColor','paperRulingSize']),paperStyle:undefined,paperColor:undefined,paperRulingSize:undefined}))};
}
export function addBlankSpread(book:Book):Book{return{...book,spreads:[...book.spreads,blankSpread()]}}
export function pageSpread(spread:Spread|undefined,side:'left'|'right'):Spread|undefined{return spread?{...spread,...spread.pages?.[side]}:undefined}
export function patchPage(book:Book,spreadId:string,side:'left'|'right',patch:PageSettings):Book{return{...book,spreads:book.spreads.map(s=>s.id===spreadId?{...s,pages:{...s.pages,[side]:{...s.pages?.[side],...patch}}}:s)}}
export function pageInk(book:Book,spread:Spread|undefined,side:'left'|'right'):string{
  const c=paperSettings(book,pageSpread(spread,side)).color;
  return parseInt(c.slice(1,3),16)*.299+parseInt(c.slice(3,5),16)*.587+parseInt(c.slice(5,7),16)*.114<125?'#f5f5ed':'#343b34';
}
export function canAddSpreadElements(spread:Pick<Spread,'elements'>|undefined,count=1):boolean{
  return !!spread&&Number.isInteger(count)&&count>0&&spread.elements.length+count<=300;
}
export function reserveHeaderSpace(elements:DesignPiece[],top:number,lockedIds:string[]=[]):DesignPiece[]{
  const inset=Math.max(0,Math.min(20,top));if(!inset)return elements;const factor=(100-inset)/100;
  // Circular editorial shapes must keep their aspect when a new entry makes room for the header.
  return elements.map(p=>p.sourceId&&lockedIds.includes(p.sourceId)?p:{...p,y:inset+p.y*factor,...(p.h!==undefined?{h:p.h*factor}:{}),...(p.kind==='doodle'&&['editorial-circle','editorial-semicircle'].includes(p.doodleMotif||'')?{w:p.w*factor}:{}),...(p.fontSize!==undefined?{fontSize:p.fontSize*factor}:{})});
}
