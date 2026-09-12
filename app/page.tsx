'use client';
import StationeryCover from '@/components/stationery-cover';
import CollageTools from '@/components/collage-tools';
import FontSettings from '@/components/font-settings';
import {isCurrentTextSelection,type TextSelection} from '@/lib/text-runs';
import PhotoMaskTools from '@/components/photo-mask-tools';
import PhotoTrash from '@/components/photo-trash';
import {applyMaskToBooks,restorePhotoMask,type PhotoMaskDraft,type PhotoTrashEntry} from '@/lib/photo-mask-state';
import {maskImageRect,rotatedMaskBounds} from '@/lib/photo-mask.mjs';
import CollageStudio,{type ClipboardSource} from '@/components/collage-studio';
import {pieceAppearance,pieceClasses,pieceFrameClass,PhotoArtwork,TapeArtwork,ColoredWriting} from '@/components/piece-appearance';
import {creamTravel,unionBoxes,transformCluster,cloneCluster,instantiateTemplate} from '@/lib/collage';
import {layoutIssues,tidyLayout} from '@/lib/layout-safety.mjs';
import type {CollageTemplate} from '@/lib/journal';
import { restorePosition, restoreHistoryPosition, type WorkspacePosition } from '@/lib/workspace-view';
import { JournalApiError, saveJournalSnapshot, shouldShowSaveStatus } from '@/lib/journal-save';
import FullBackup from '@/components/full-backup';
import JournalHistory from '@/components/journal-history';
import NotebookPageOverview from '@/components/notebook-page-overview';
import {removeNotebookSpread,pageAfterSpreadRemoval} from '@/lib/notebook-pages';
import NotebookPaper from '@/components/notebook-paper';
import { canAddSpreadElements, pageSpread, patchPage, pageInk, reserveHeaderSpace } from '@/lib/journal';
import { notebookUploads, copyNotebooks } from '@/lib/journal-backup';
import { resolveNotebookAssetSources } from '@/lib/notebook-material-sources.mjs';
import JournalDrawing from '@/components/journal-drawing';
import ElementControls from '@/components/element-controls';
import ToolbarPopover from '@/components/toolbar-popover';
import PageMaterialCutter from '@/components/page-material-cutter';
import {
  applyPageMaterialCut,
  assertPageMaterialCutPlacements,
  assertPageMaterialCutTarget,
  type PageMaterialCutOutput,
  type PageMaterialCutPlacement,
  type PageMaterialCutTarget,
} from '@/lib/page-material-cut';
import {isCornerResizeHandle,resizeBox,resizeHandles,normalizeAngle,reorderPiece,type Box} from '@/lib/piece-transform';
import {addBlankSpread} from '@/lib/journal';
import {DEFAULT_VELLUM_COLOR,DEFAULT_VELLUM_OPACITY,VELLUM_BORDER_COLOR,pieceDisplayOpacity} from '@/lib/vellum-sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye } from 'lucide-react';
import ReadingDeck from '@/components/reading-deck';
import PageTurn, {SpreadPreview} from '@/components/page-turn';
import type { CSSProperties } from 'react';
import { paperSettings, applyPaper, type PaperStyle, type PaperRulingSize } from '@/lib/journal';
import MaterialStudio from '@/components/material-studio';
import MaterialImporter from '@/components/material-importer';
import MaterialLibrary from '@/components/material-library';
import LayerRowActions from '@/components/layer-row-actions';
import {isPieceHidden,pieceGroupName,pieceLayerName,reorderLayerBlock,withLayerMeta} from '@/lib/layer-meta';
import {leafFrame} from '@/lib/page-motion';
import {clampSelectionMove,idsInSelectionRect,mergeSelection,selectionRect,selectionRectSize,type SelectionPoint,type SelectionRect} from '@/lib/selection-geometry';
/* oxlint-disable next/no-img-element -- Local editable images intentionally bypass remote image optimization. */
/* oxlint-disable jsx-a11y/no-static-element-interactions -- Draggable canvas objects expose keyboard selection and coordinate controls. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Layers,
  Sticker,
  Settings,
  Plus,
  Feather,
  ChevronRight,
  ChevronLeft,
  Leaf,
  Sparkles,
  X,
  ImagePlus,
  Lock,
  Unlock,
  Trash2,
  RotateCcw,
  Redo2,
  Download,
  Check,
  Loader2,
  Type,
  PanelRightClose,
  FolderOpen,
  RefreshCw,
  PanelTop,
  File as FileIcon,
  LayoutGrid,
  ClipboardPaste,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  type Asset,
  type Book,
  type Day,
  type Piece,
  type Spread,
  type AIResult,
  type HeaderConfig,
  type PaperBg,
  uid,
  today,
  themes,
  coverMaterials,
  coverInfo,
  formats,
  bookFormat,
  monthName,
  newBook,
  localResult,
  appendDay,
  regenerateSpread,
  removePiecesFromSpread,
  defaultHeader,
  headerDateFormats,
  renderHeader,
  sanitizeHeader,
  headerOf,
  applyHeader,
  applyPaperBg,
  paperBgOf,
  ensureFlyleaf,
} from '@/lib/journal';

type SettingsData = {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  vision: boolean;
  apiKey?: string;
  configurationIssue?: string;
};
type SpeechEvent = {
  results: { [key: number]: { [key: number]: { transcript: string } } };
  resultIndex: number;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type CanvasMarqueeGesture = {
  pointerId:number;
  start:SelectionPoint;
  current:SelectionPoint;
  baseSelection:string[];
  toggle:boolean;
  started:boolean;
};
const paperRulingSizes: { id: PaperRulingSize; name: string }[] = [
  { id: 'small', name: '小' },
  { id: 'medium', name: '中' },
  { id: 'large', name: '大' },
];
async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch('/api' + path, {
    ...options,
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
  let result;
  try {
    result = await res.json();
  } catch {
    throw Error('本机服务未响应，请重新打开“启动手帐”。');
  }
  if (!res.ok)
    throw new JournalApiError((result as { error?: string }).error || '操作失败，请重试。', res.status);
  return result as T;
}
const send = (method: string, data: unknown) => ({
  method,
  body: JSON.stringify(data),
});
function Pick({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; name: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className="picker">
        <SelectValue>
          {items.find((i) => i.id === value)?.name || value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function Home() {
  const [multiIds,setMultiIds]=useState<string[]>([]);
  const suppressSelectionClick=useRef(false);
  const [editingGroup,setEditingGroup]=useState<string|null>(null);
  const canvasMarquee=useRef<CanvasMarqueeGesture|null>(null);
  const [selectionMarquee,setSelectionMarquee]=useState<SelectionRect|null>(null);
  const [selectionPreviewIds,setSelectionPreviewIds]=useState<string[]>([]);
  const [collageOpen,setCollageOpen]=useState(false);
  const [clipboardCutRequest,setClipboardCutRequest]=useState(0);
  const [clipboardPasteRequest,setClipboardPasteRequest]=useState(0);
  const [cropping,setCropping]=useState(false);
  const [photoMaskDraft,setPhotoMaskDraft]=useState<PhotoMaskDraft|null>(null);
  const maskDraftRef=useRef<PhotoMaskDraft|null>(null);
  const [photoTrashOpen,setPhotoTrashOpen]=useState(false);
  function updateMaskDraft(next:PhotoMaskDraft|null){maskDraftRef.current=next;setPhotoMaskDraft(next);}
  function cancelPhotoMask(){updateMaskDraft(null);drag.current=null;setCropping(false);}
  function editMaskDraft(patch:Partial<PhotoMaskDraft>){const d=maskDraftRef.current;if(d&&!d.generating)updateMaskDraft({...d,...patch});}
  const [layoutReport,setLayoutReport]=useState<{message:string;ids:string[];type:string}[]|null>(null);
  const [textRange,setTextRange]=useState<TextSelection|null>(null);
  const [templateName,setTemplateName]=useState('我的照片拼贴');
  const [clusterBox,setClusterBox]=useState<Box|undefined>();
  const [deletingBook, setDeletingBook] = useState<Book | null>(null);
  const [books, setBooks] = useState<Book[]>([]),
    [bookId, setBookId] = useState(''),
    [assets, setAssets] = useState<Asset[]>([]),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState('');
  const [opened, setOpened] = useState(false),
    [opening, setOpening] = useState(false),
    [closing, setClosing] = useState(false),
    [page, setPage] = useState(-1),
    [flipping, setFlipping] = useState('');
  const [view, setView] = useState<'library' | 'workbench'>('workbench');
  const [recent, setRecent] = useState<string[]>([]);
  const [panel, setPanel] = useState<'write' | 'elements' | null>(null),
    [selected, _setSelected] = useState<string | null>(null),
    [modal, setModal] = useState<
      'settings' | 'covers' | 'index' | 'material-import' | 'studio' | 'material-cut' | 'paper' | 'date' | 'header' | 'history' | 'backup' | null
    >(null);
  const [materialStudioNotice,setMaterialStudioNotice]=useState(''),
    [materialStudioTargetSource,setMaterialStudioTargetSource]=useState('');
  const [pageMaterialCutTarget,setPageMaterialCutTarget]=useState<PageMaterialCutTarget|null>(null);
  const [date, setDate] = useState(today()),
    [raw, setRaw] = useState(''),
    [photos, setPhotos] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [instruction, setInstruction] = useState('');
  const [settings, setSettings] = useState<SettingsData>({
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash-vision-exp',
      hasKey: false,
      vision: true,
    }),
    [settingsForm, setSettingsForm] = useState<SettingsData>(settings),
    [settingsSaving, setSettingsSaving] = useState(false);
  const [paperStyle, setPaperStyle] = useState<PaperStyle>('blank'),
    [paperColor, setPaperColor] = useState('#ffffff'),
    [paperRulingSize, setPaperRulingSize] = useState<PaperRulingSize>('medium'),
    [paperScope, setPaperScope] = useState('book');
  const [bgForm, setBgForm] = useState<PaperBg | null>(null),
    [bgName, setBgName] = useState('我的内页');
  const [headerForm, setHeaderForm] = useState<HeaderConfig>(defaultHeader()),
    [headerScope, setHeaderScope] = useState('book'),
    [headerDate, setHeaderDate] = useState(today());
  const [dateLabel, setDateLabel] = useState(today()),
    [dateFormat, setDateFormat] = useState('simple'),
    [dateSide, setDateSide] = useState('left');
  const [turnProgress, setTurnProgress] = useState(0),
    [turnSettling, setTurnSettling] = useState(false);
  const turnRef = useRef<{
      direction: number;
      target: number;
      source: Spread;
      sourceIndex: number;
      progress: number;
      settling: boolean;
    } | null>(null),
    turnAnimation = useRef(0);
  useEffect(
    () => () => {
      cancelAnimationFrame(turnAnimation.current);
    },
    [],
  );
  const [reading, setReading] = useState(false);
  const [libraryOpen,setLibraryOpen]=useState(false);
  const [zoom, setZoom] = useState(100);
  const [proportional,setProportional]=useState(false);
  const [selectionSize,setSelectionSize]=useState({w:0,h:0});
  const workArea=useRef<HTMLDivElement>(null);
  const [preserveLocks, setPreserveLocks] = useState(true);
  const [designPreview,setDesignPreview]=useState<{book:Book;spread:Spread;before:string;concept?:string}|null>(null);
  const [readingPage,setReadingPage]=useState(0);
  const editingPosition=useRef<WorkspacePosition|null>(null);
  const scrollRestore=useRef<{scrollTop:number;scrollLeft:number}|null>(null);
  function switchMode(value: unknown) {
    if(value==='read' && book){
      finishEditing();
      editingPosition.current={page,opened,zoom,selected,scrollTop:workArea.current?.scrollTop||0,scrollLeft:workArea.current?.scrollLeft||0};
      change(all=>all.map(b=>b.id===book.id?ensureFlyleaf(b):b),false);
      setReadingPage(0);
      setView('workbench');
      setReading(true);
    }else{
      const position=editingPosition.current;
      if(position){setPage(position.page);setOpened(position.opened);setZoom(position.zoom);setSelected(position.selected);scrollRestore.current=position;}
      setReading(false);
    }
    setLibraryOpen(false);
    setPanel(null);
  }
  const [inlineId,setInlineId]=useState<string|null>(null),[inlineText,setInlineText]=useState(''),[entrySide]=useState('left');
  const [settingsFeedback, setSettingsFeedback] = useState('');
  const [saved, setSaved] = useState('已保存到本机'),
    [notice, setNotice] = useState(''),
    [recording, setRecording] = useState(false),
    [, setSpeechSupported] = useState(false);
  const saveStatusNeedsAttention = shouldShowSaveStatus(saved);
  const [recoveringSave, setRecoveringSave] = useState(false);
  const saveBlocked = useRef(false);
  const bookAnimation = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if(bookAnimation.current)clearTimeout(bookAnimation.current); }, []);
  const [editingBookId,setEditingBookId]=useState<string|null>(null),
    [coverTitle, setCoverTitle] = useState('拾光集'),
    [coverType, setCoverType] = useState('linen-oat'),
    [coverFormat, setCoverFormat] = useState<Book['format']>('standard'),
    [coverAsset, setCoverAsset] = useState(''),
    [coverPaperStyle, setCoverPaperStyle] = useState<PaperStyle>('blank'),
    [coverPaperColor, setCoverPaperColor] = useState('#ffffff'),
    [coverPaperRulingSize, setCoverPaperRulingSize] = useState<PaperRulingSize>('medium'),
    [coverHeaderOn, setCoverHeaderOn] = useState(true);
  const [coverTab, setCoverTab] = useState('cover');
  const [coverScope,setCoverScope]=useState('book');
  const [coverDate,setCoverDate]=useState('');
  const [coverHeader, setCoverHeader] = useState<HeaderConfig>(defaultHeader);
  const [coverBg, setCoverBg] = useState<PaperBg | null>(null);
  const [paperAdvancedOpen, setPaperAdvancedOpen] = useState(false);
  const [coverTemplates, setCoverTemplates] = useState<Book['paperTemplates']>([]);
  const coverBgInput = useRef<HTMLInputElement>(null);
  const coverHeaderText = useRef<HTMLTextAreaElement>(null);
  const notebookSettingsScroll = useRef<HTMLDivElement>(null);
  const [coverUploadBusy, setCoverUploadBusy] = useState(false);
  const [coverTemplateName, setCoverTemplateName] = useState('我的内页');
  const canvas = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    canvasPhotoInput=useRef<HTMLInputElement>(null),
    replaceInput = useRef<HTMLInputElement>(null),
    bgInput = useRef<HTMLInputElement>(null),
    bgPreview = useRef<HTMLDivElement>(null),
    bgDrag = useRef<{x:number;y:number;bx:number;by:number}|null>(null),
    headerText = useRef<HTMLTextAreaElement>(null),
    speech = useRef<Recognition | null>(null);
  const revision = useRef(0),
    pending = useRef<Book[] | null>(null),
    writing = useRef(false),
    dirty = useRef(false),
    history = useRef<Book[][]>([]),
    future = useRef<Book[][]>([]),
    booksRef = useRef(books),
    drag = useRef<{
      id:string; pointerId:number; x:number; y:number; mode:string; box:Box;
      canvasW:number; canvasH:number; cx:number; cy:number;
      angle:number; started:boolean; members:Piece[]; boxes:Box[]; crop?:{x:number;y:number}; lastBox?:Box;
    } | null>(null);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);
  const book = books.find((b) => b.id === bookId) || books[0],
    spread = book ? (page === -1 ? book.flyleaf : book.spreads[page]) : undefined,
    savedPiece = spread?.elements.find((e) => e.id === selected),
    maskActive=photoMaskDraft?.bookId===book?.id&&photoMaskDraft?.spreadId===spread?.id&&photoMaskDraft?.pieceId===selected,
    piece = maskActive?photoMaskDraft!.piece:savedPiece,
    activeTurn = turnRef.current;
  const activePieces=spread?.elements.filter(p=>multiIds.length?multiIds.includes(p.id):p.id===selected||!!piece?.groupId&&piece.groupId!==editingGroup&&p.groupId===piece.groupId).map(p=>maskActive&&p.id===photoMaskDraft!.pieceId?photoMaskDraft!.piece:p)||[];
  const activeUnitCount=new Set(activePieces.map(p=>editingGroup?`piece:${p.id}`:p.groupId?`group:${p.groupId}`:`piece:${p.id}`)).size;
  const multiSelection=activeUnitCount>1;
  const cluster=activePieces.length>1;
  const selectionLocked=activePieces.some(p=>p.locked);
  function setSelected(value:string|null){
    if(maskDraftRef.current&&value!==maskDraftRef.current.pieceId)cancelPhotoMask();
    if(value!==selected){setCropping(false);setTextRange(null);}
    if(value===null){canvasMarquee.current=null;setSelectionMarquee(null);setSelectionPreviewIds([]);setMultiIds([]);setEditingGroup(null);setLayoutReport(null);}
    _setSelected(value);
  }
  const maskContext=useRef('');
  maskContext.current=JSON.stringify([book?.id,spread?.id,selected,reading,view,opened,libraryOpen,modal,panel,photoTrashOpen,multiIds]);
  useEffect(()=>{
    const d=maskDraftRef.current;
    if(d&&(!maskActive||reading||view!=='workbench'||!opened||libraryOpen||modal||panel||photoTrashOpen||cluster||JSON.stringify(savedPiece)!==JSON.stringify(d.before)))cancelPhotoMask();
  },[maskActive,reading,view,opened,libraryOpen,modal,panel,photoTrashOpen,cluster,savedPiece]);
  const sheetAt = (b: Book, i: number) =>
    (i === -1 ? b.flyleaf : b.spreads[i]) as Spread | undefined;
  const toast = useCallback(
    (message: string) => setNotice(message),
    [setNotice],
  );
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    Promise.all([
      api<{ revision: number; books: Book[] }>('/state'),
      api<Asset[]>('/materials'),
      api<SettingsData>('/settings'),
    ])
      .then(([state, library, config]) => {
        revision.current = state.revision;
        const initial: Book[] = state.books;
        setBooks(initial);
        const lastId = localStorage.getItem('shiguang.lastBookId');
        const last = initial.find((b) => b.id === lastId) || initial.at(-1);
        if (last) {
          setBookId(last.id);
          let stored:unknown;
          try{stored=JSON.parse(localStorage.getItem('shiguang.position.'+last.id)||'null');}catch{stored=null;}
          const position=restorePosition(stored,last.spreads.length,!!last.flyleaf);
          setPage(position.page);setOpened(position.opened);setZoom(position.zoom);_setSelected(position.selected);scrollRestore.current=position;
        }
        setRecent(
          (()=>{try{const ids=JSON.parse(localStorage.getItem('shiguang.recentBooks')||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[];}catch{return [];}})(),
        );
        setView(initial.length ? 'workbench' : 'library');
        setAssets(library);
        setSettings(config);
        setSettingsForm({ ...config, apiKey: '' });
        const w = window as unknown as {
          SpeechRecognition?: new () => Recognition;
          webkitSpeechRecognition?: new () => Recognition;
        };
        setSpeechSupported(
          !!(w.SpeechRecognition || w.webkitSpeechRecognition),
        );
        setReady(true);
      })
      .catch((e) => setLoadError(e.message));
    return () => speech.current?.stop();
  }, []);
  useEffect(()=>{
    if(!ready||!bookId||reading||libraryOpen||view!=='workbench'||opening||closing)return;
    const area=workArea.current;
    const restored=scrollRestore.current;
    if(restored && area){area.scrollTop=restored.scrollTop;area.scrollLeft=restored.scrollLeft;scrollRestore.current=null;}
    const persist=()=>{
      const position={page,opened,zoom,selected,scrollTop:area?.scrollTop||0,scrollLeft:area?.scrollLeft||0};
      localStorage.setItem('shiguang.position.'+bookId,JSON.stringify(position));
    };
    persist();area?.addEventListener('scroll',persist,{passive:true});
    return ()=>area?.removeEventListener('scroll',persist);
  },[ready,bookId,page,opened,zoom,selected,reading,libraryOpen,view,opening,closing]);
  const flush = useCallback(async () => {
    if (writing.current || !pending.current || saveBlocked.current) return;
    writing.current = true;
    setSaved('正在保存…');
    let historyWarning = '';
    try {
      while (pending.current) {
        const next = pending.current;
        pending.current = null;
        try {
          const result = await saveJournalSnapshot(
            { books: next, revision: revision.current },
            { write: snapshot => api('/state', send('PUT', snapshot)), read: () => api('/state') },
          );
          revision.current = result.revision;
          if(result.historyWarning)historyWarning=result.historyWarning;
        } catch (e) {
          if (!pending.current) pending.current = next;
          throw e;
        }
      }
      setSaved(historyWarning ? '已保存 · 历史备份未完成' : '已保存到本机');
      if(historyWarning)toast(historyWarning);
    } catch (e) {
      saveBlocked.current = e instanceof JournalApiError && e.status === 409;
      setSaved(saveBlocked.current ? '保存冲突 · 本窗口内容已保留' : '保存失败 · 点击重试');
      toast((e as Error).message);
    } finally {
      writing.current = false;
    }
  }, [toast]);
  useEffect(() => {
    if (!ready || !dirty.current) return;
    pending.current = books;
    if(!saveBlocked.current)setSaved('等待保存…');
    const t = setTimeout(() => void flush(), 550);
    return () => clearTimeout(t);
  }, [books, ready, flush]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (pending.current || writing.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);
  const remember = () => {
    if(maskDraftRef.current)return;
    history.current.push(structuredClone(booksRef.current));
    if (history.current.length > 30) history.current.shift();
    future.current = [];
  };
  const change = (fn: (all: Book[]) => Book[], withHistory = true) => {
    if(maskDraftRef.current)cancelPhotoMask();
    if (withHistory) remember();
    dirty.current = true;
    setBooks((all) => {
      const next=fn(all);
      booksRef.current=next;
      return next;
    });
  };
  const changeSpread = (fn: (s: Spread) => Spread, withHistory = true) =>
    change(
      (all) =>
        all.map((b) => {
          if (b.id !== book?.id) return b;
          if (page === -1) {
            const withLeaf = ensureFlyleaf(b);
            return { ...withLeaf, flyleaf: fn(withLeaf.flyleaf!) };
          }
          return {
            ...b,
            spreads: b.spreads.map((s, i) => (i === page ? fn(s) : s)),
          };
        }),
      withHistory,
    );
  const patchPiece = (id: string, patch: Partial<Piece>, withHistory = true) => {
    const draft=maskDraftRef.current;
    if(draft?.pieceId===id){if(!draft.generating)updateMaskDraft({...draft,piece:{...draft.piece,...patch}});return;}
    changeSpread(
      (s) => ({
        ...s,
        elements: s.elements.map((e) =>
          e.id === id ? { ...e, ...patch, ...(patch.text!==undefined&&patch.text!==e.text?{colorRuns:undefined,highlightRuns:undefined}:{}), locked: patch.locked ?? e.locked } : e,
        ),
        days: s.days.map((d) => {
          const p = s.elements.find((e) => e.id === id);
          if (p?.dayId !== d.id || patch.text === undefined) return d;
          return {
            ...d,
            ...(p.role === 'body'
              ? { text: s.elements.filter(e=>e.dayId===d.id&&e.role==='body').map(e=>e.id===id?patch.text:e.text).join('\n\n') }
              : p.role === 'title'
                ? { title: patch.text }
                : {}),
          };
        }),
      }),
      withHistory,
    );
  };
  function finishEditing(){
    if(inlineId){const p=spread?.elements.find(p=>p.id===inlineId);if(p&&p.text!==inlineText)patchPiece(inlineId,{text:inlineText});setInlineId(null);}
    setSelected(null);setMultiIds([]);setEditingGroup(null);setCropping(false);
  }
  const selectedNode=useCallback((id:string)=>Array.from(canvas.current?.querySelectorAll<HTMLElement>('[data-piece-id]')||[]).find(el=>el.dataset.pieceId===id),[]);
  const pieceBox=useCallback((p:Piece):Box=>{
    const paper=canvas.current,el=selectedNode(p.id),cw=paper?.clientWidth||1000,ch=paper?.clientHeight||700;
    return {x:p.x*cw/100,y:p.y*ch/100,w:p.w*cw/100,h:p.h!==undefined?p.h*ch/100:el?parseFloat(getComputedStyle(el).height):15*ch/100,rotation:p.rotation};
  },[selectedNode]);
  useEffect(()=>{
    if(!selected||!canvas.current)return;
    const paper=canvas.current,els=activePieces.map(p=>selectedNode(p.id)).filter((el):el is HTMLElement=>!!el);
    function measure(){
      const el=selectedNode(selected!);if(!el)return;
      const css=getComputedStyle(el),next={w:parseFloat(css.width)/paper.clientWidth*100,h:parseFloat(css.height)/paper.clientHeight*100};
      setSelectionSize(old=>Math.abs(old.w-next.w)<.01&&Math.abs(old.h-next.h)<.01?old:next);
      const nextBox=activePieces.length>1?unionBoxes(activePieces.map(pieceBox)):undefined;
      setClusterBox(old=>JSON.stringify(old)===JSON.stringify(nextBox)?old:nextBox);
    }
    const frame=requestAnimationFrame(measure),observer=new ResizeObserver(measure);
    for(const el of els)observer.observe(el);observer.observe(paper);
    return()=>{cancelAnimationFrame(frame);observer.disconnect();};
  }); // Measure after each committed render; ResizeObserver handles fonts and viewport changes.
  function commitSelectionIds(ids:string[],preserveEditingGroup=false){
    if(!spread)return;
    const unique=[...new Set(ids)].filter(id=>spread.elements.some(p=>p.id===id));
    if(!unique.length){setSelected(null);return;}
    const pieces=spread.elements.filter(p=>unique.includes(p.id));
    const units=new Set(pieces.map(p=>preserveEditingGroup?`piece:${p.id}`:p.groupId?`group:${p.groupId}`:`piece:${p.id}`));
    if(!preserveEditingGroup)setEditingGroup(null);
    if(units.size<=1){
      setMultiIds([]);
      setSelected(pieces[0]?.id||null);
      return;
    }
    setMultiIds(unique);
    setSelected(unique.includes(selected||'')?selected:unique[0]);
  }
  function selectionIdsFor(p:Piece){
    return p.groupId&&p.groupId!==editingGroup&&spread
      ? spread.elements.filter(q=>q.groupId===p.groupId).map(q=>q.id)
      : [p.id];
  }
  function pointOnCanvas(e:React.PointerEvent<HTMLDivElement>,paper:HTMLDivElement):SelectionPoint{
    const bounds=paper.getBoundingClientRect();
    return {x:Math.max(0,Math.min(paper.clientWidth,e.clientX-bounds.left-paper.clientLeft)),y:Math.max(0,Math.min(paper.clientHeight,e.clientY-bounds.top-paper.clientTop))};
  }
  function canvasSelectionGeometry(){
    return (spread?.elements||[]).map(p=>({...pieceBox(p),id:p.id,groupId:p.groupId,locked:p.locked,hidden:isPieceHidden(p)}));
  }
  function canvasSelectionDown(e:React.PointerEvent<HTMLDivElement>){
    if(!spread||reading||busy||turnRef.current||e.button!==0)return;
    const target=e.target as Element;
    if(target.closest('[data-piece-id],.selection-box,[data-editor-ui],button,input,textarea,select'))return;
    if(inlineId||cropping){finishEditing();return;}
    if(e.pointerType==='touch'){setSelected(null);return;}
    const toggle=e.shiftKey||e.metaKey||e.ctrlKey;
    if(toggle&&activePieces.some(p=>p.locked)){toast('锁定素材不能加入多选，请先解锁。');return;}
    const start=pointOnCanvas(e,e.currentTarget);
    const gesture:CanvasMarqueeGesture={pointerId:e.pointerId,start,current:start,baseSelection:activePieces.map(p=>p.id),toggle,started:false};
    canvasMarquee.current=gesture;setSelectionMarquee(null);setSelectionPreviewIds([]);
    e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
  }
  function canvasSelectionMove(e:React.PointerEvent<HTMLDivElement>){
    const gesture=canvasMarquee.current,paper=canvas.current;
    if(!gesture||!paper||gesture.pointerId!==e.pointerId)return;
    const current=pointOnCanvas(e,paper),rect=selectionRect(gesture.start,current),size=selectionRectSize(rect);
    const started=gesture.started||Math.hypot(size.width,size.height)>=4;
    const next={...gesture,current,started};canvasMarquee.current=next;
    if(!started)return;
    setSelectionMarquee(rect);setSelectionPreviewIds(idsInSelectionRect(canvasSelectionGeometry(),rect,editingGroup));
  }
  function finishCanvasSelection(e:React.PointerEvent<HTMLDivElement>){
    const gesture=canvasMarquee.current;
    if(!gesture||gesture.pointerId!==e.pointerId)return;
    if(gesture.started){
      const hits=idsInSelectionRect(canvasSelectionGeometry(),selectionRect(gesture.start,gesture.current),editingGroup);
      commitSelectionIds(mergeSelection(gesture.baseSelection,hits,gesture.toggle),!!editingGroup);
    }else if(!gesture.toggle)setSelected(null);
    canvasMarquee.current=null;setSelectionMarquee(null);setSelectionPreviewIds([]);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function cancelCanvasSelection(e:React.PointerEvent<HTMLDivElement>){
    if(canvasMarquee.current?.pointerId!==e.pointerId)return;
    canvasMarquee.current=null;setSelectionMarquee(null);setSelectionPreviewIds([]);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function selectPiece(p:Piece,add=false) {
    if(panel!=='elements')setPanel(null);
    if(add){
      const current=activePieces.map(q=>q.id),ids=selectionIdsFor(p);
      const adding=!current.includes(p.id);
      const currentPieces=spread?.elements.filter(q=>current.includes(q.id))||[];
      const incoming=spread?.elements.filter(q=>ids.includes(q.id))||[];
      if(adding&&(currentPieces.some(q=>q.locked)||incoming.some(q=>q.locked))){toast('锁定素材不能加入多选，请先解锁。');return;}
      const next=adding?[...new Set([...current,...ids])]:current.filter(id=>!ids.includes(id));
      commitSelectionIds(next);
      return;
    }
    if(multiIds.includes(p.id))return;
    setMultiIds([]);if(p.groupId!==editingGroup)setEditingGroup(null);setSelected(p.id);
  }
  function toggleSidebarSelection(members:Piece[]){
    if(!members.length)return;
    const memberIds=members.map(p=>p.id),current=activePieces.map(p=>p.id),selectedCount=memberIds.filter(id=>current.includes(id)).length;
    if(selectedCount===memberIds.length){commitSelectionIds(current.filter(id=>!memberIds.includes(id)));return;}
    if(current.length&&(activePieces.some(p=>p.locked)||members.some(p=>p.locked))){toast('锁定素材不能加入多选，请先解锁。');return;}
    if(!current.length){setMultiIds([]);setEditingGroup(null);setSelected(members[0].id);return;}
    commitSelectionIds([...current,...memberIds]);
  }
  function toggleSidebarMember(p:Piece){
    const current=activePieces.map(q=>q.id),selectedHere=current.includes(p.id);
    if(selectedHere){
      const next=current.filter(id=>id!==p.id);
      if(!next.length){setSelected(null);return;}
      setEditingGroup(p.groupId||null);
      if(next.length===1){setMultiIds([]);setSelected(next[0]);return;}
      setMultiIds(next);setSelected(next.includes(selected||'')?selected:next[0]);
      return;
    }
    if(current.length&&(activePieces.some(q=>q.locked)||p.locked)){toast('锁定素材不能加入多选，请先解锁。');return;}
    if(!current.length){setMultiIds([]);setEditingGroup(p.groupId||null);setSelected(p.id);return;}
    const next=[...new Set([...current,p.id])];
    setEditingGroup(p.groupId||editingGroup);setMultiIds(next);setSelected(selected&&next.includes(selected)?selected:p.id);
  }
  function setLayerVisibility(members:Piece[],hidden:boolean){
    const ids=new Set(members.map(p=>p.id));
    changeSpread(s=>({...s,elements:s.elements.map(p=>ids.has(p.id)?withLayerMeta(p,{hidden}):p)}));
    if(hidden&&activePieces.some(p=>ids.has(p.id)))setSelected(null);
  }
  function setLayerLocked(members:Piece[],locked:boolean){
    const ids=new Set(members.map(p=>p.id));
    changeSpread(s=>({...s,elements:s.elements.map(p=>ids.has(p.id)?{...p,locked}:p)}));
  }
  function renameLayer(members:Piece[],group=false){
    if(!members.length)return;
    const current=group?pieceGroupName(members[0]):pieceLayerName(members[0]);
    const entered=window.prompt(group?'组合名称':'图层名称',current||'');
    if(entered===null)return;
    const name=entered.trim().slice(0,40)||undefined,ids=new Set(members.map(p=>p.id));
    changeSpread(s=>({...s,elements:s.elements.map(p=>ids.has(p.id)?withLayerMeta(p,group?{groupName:name}:{layerName:name}):p)}));
  }
  function moveLayer(members:Piece[],action:'top'|'bottom'|'up'|'down'){
    const ids=members.map(p=>p.id);
    changeSpread(s=>({...s,elements:reorderLayerBlock(s.elements,ids,action)}));
  }
  function patchSelection(patch:Partial<Piece>){const ids=new Set(activePieces.map(p=>p.id));changeSpread(s=>({...s,elements:s.elements.map(p=>ids.has(p.id)?{...p,...patch}:p)}));}
  function groupSelection(){
    const id=uid(),ids=new Set(activePieces.map(p=>p.id));
    changeSpread(s=>({...s,elements:s.elements.map(p=>ids.has(p.id)?{...p,groupId:id}:p)}));setMultiIds([]);setEditingGroup(null);toast('已编组；拖动时一起移动，双击可编辑组内元素。');
  }
  function ungroupSelection(){
    const ids=new Set(activePieces.map(p=>p.id));changeSpread(s=>({...s,elements:s.elements.map(p=>ids.has(p.id)?withLayerMeta({...p,groupId:undefined,attachedTo:undefined},{groupName:undefined}):p)}));setMultiIds([]);setEditingGroup(null);toast('已解组。');
  }
  function enterGroup(p:Piece){setMultiIds([]);setSelected(p.id);setEditingGroup(p.groupId||null);if(p.kind==='text'){setTextRange(null);setInlineId(p.id);setInlineText(p.text||'');}}
  function addPhotoAttachment(kind:'caption'|'tape'){
    if(!piece||piece.kind!=='photo'||!spread)return;
    const existing=kind==='caption'?spread.elements.find(p=>p.attachedTo===piece.id&&p.kind==='text'):undefined;
    if(existing){enterGroup(existing);return;}
    const group=piece.groupId||uid(),box=pieceBox(piece),ch=canvas.current?.clientHeight||700;
    const addition:Piece=kind==='caption'?{id:uid(),kind:'text',text:'写下这一刻',role:'decor',x:piece.x,y:piece.y+box.h/ch*100+2.5,w:piece.w,fontFamily:'pen',fontSize:17,lineHeight:1.45,textAlign:'center',rotation:piece.rotation,locked:false,groupId:group,attachedTo:piece.id,frame:'plain'}:{id:uid(),kind:'doodle',material:'tape',path:'M 0 0 L 100 0 L 100 100 L 0 100 Z',x:piece.x+piece.w*.3,y:piece.y-1,w:piece.w*.4,h:2.5,rotation:piece.rotation-5,locked:false,groupId:group,attachedTo:piece.id,color:'#c5b08b',opacity:.72,shadow:.18,tapeEdge:'torn'};
    changeSpread(s=>({...s,elements:[...s.elements.map(p=>p.id===piece.id?{...p,groupId:group,hideTape:true}:p),addition]}));
    setMultiIds([]);setEditingGroup(group);setSelected(addition.id);if(kind==='caption'){setInlineId(addition.id);setInlineText(addition.text!);}toast(kind==='caption'?'图注已与照片编组，可直接输入。':'胶带已与照片编组，可调整颜色、长度和透明度。');
  }
  function colorText(color:string|null){
    if(!piece||piece.kind!=='text'||selectionLocked)return;
    if(color===null){patchPiece(piece.id,{colorRuns:undefined});return;}
    if(!isCurrentTextSelection(textRange,piece)){toast('请在荧光笔面板中选择要着色的字句。');return;}
    patchPiece(piece.id,{colorRuns:[...(piece.colorRuns||[]),{start:textRange.start,end:textRange.end,color}].slice(-100)});
  }
  function highlightText(color:string|null){
    if(!piece||piece.kind!=='text'||selectionLocked)return;
    if(color===null){patchPiece(piece.id,{highlightRuns:undefined});return;}
    if(!isCurrentTextSelection(textRange,piece)){toast('请在荧光笔面板中选择要标记的字句。');return;}
    patchPiece(piece.id,{highlightRuns:[...(piece.highlightRuns||[]),{start:textRange.start,end:textRange.end,color}].slice(-100)});
  }
  function saveCluster(){
    if(!book||!cluster||!clusterBox||!templateName.trim())return;
    const cw=canvas.current!.clientWidth,ch=canvas.current!.clientHeight,activeBoxes=activePieces.map(pieceBox);
    const elements=activePieces.map((p,i)=>({...p,x:p.x-clusterBox.x/cw*100+6,y:p.y-clusterBox.y/ch*100,h:activeBoxes[i].h/ch*100}));
    const template:CollageTemplate={id:uid(),name:templateName.trim().slice(0,40),elements,ratio:bookFormat(book).ratio};
    change(all=>all.map(b=>b.id===book.id?{...b,collageTemplates:[...(b.collageTemplates||[]),template].slice(-40)}:b));toast('已保存到旅行拼贴中的“我的组合”。');
  }
  function insertCluster(t:CollageTemplate){
    if(!book||!spread)return;
    const elements=instantiateTemplate(t,uid,bookFormat(book).ratio);
    if(elements.length+spread.elements.length>300){toast('本页素材过多，请翻到新页。');return;}
    changeSpread(s=>({...s,elements:[...s.elements,...elements]}));setSelected(elements[0]?.id||null);setMultiIds([]);setEditingGroup(null);setCollageOpen(false);toast('已插入组合，可双击修改。');
  }
  async function checkLayout(tidy=false){
    if(!book||!spread)return;
    await document.fonts.ready;
    await Promise.all(Array.from(canvas.current?.querySelectorAll('img')||[]).map(img=>img.decode().catch(()=>{})));
    const measured=spread.elements.filter(p=>!isPieceHidden(p)).map(p=>{const el=selectedNode(p.id),ch=canvas.current?.clientHeight||700;const height=el?Math.max(el.offsetHeight,el.scrollHeight):0;return {...p,h:height?height/ch*100:p.h};});
    const header=Math.max(3,...(['left','right'] as const).map(side=>{const h=headerOf(book,pageSpread(spread,side));return h.enabled?h.height+2:3;}));
    const report=tidy?tidyLayout(measured,bookFormat(book).ratio,header):{elements:measured,issues:layoutIssues(measured,bookFormat(book).ratio,header)};
    setLayoutReport(report.issues);setCollageOpen(false);
    if(tidy){const byId=new Map<string,Piece>(report.elements.map((p:Piece)=>[p.id,p] as const));const updated={...spread,elements:spread.elements.map(p=>{const q=byId.get(p.id);return q?{...p,x:q.x,y:q.y}:p;})};setDesignPreview({book,spread:updated,before:JSON.stringify(spread),concept:report.issues.length?'保留内容与组合。仍有遮挡或空间不足，请查看提示。':'已整理位置，保留所有内容和组合。'});}
    else toast(report.issues.length?`发现 ${report.issues.length} 处需要检查，点击提示可定位。`:'未发现文字遮挡、书脊穿越或纸面越界。');
  }
  useEffect(()=>{
    if(!selected||reading)return;
    const outside=(e:MouseEvent)=>{const target=e.target;if(!(target instanceof Element)||target.closest('[data-piece-id],.selection-box,.open-book,[data-editor-ui],.side-panel,[role="dialog"],[role="alertdialog"]'))return;finishEditing();};
    document.addEventListener('click',outside);return()=>document.removeEventListener('click',outside);
  });
  async function preparePhotoSave(){
    // Wait for the shared save queue; never create a second persistence path.
    for(let i=0;writing.current&&i<200;i++)await new Promise(resolve=>setTimeout(resolve,50));
    if(writing.current||saveBlocked.current)throw Error('请先解决保存问题，再操作照片。');
    pending.current=booksRef.current;
    await flush();
    if(pending.current||saveBlocked.current)throw Error('手帐尚未保存，照片未被修改。');
    return [...new Set([...history.current,...future.current].flatMap(notebookUploads))];
  }
  async function startPhotoMask(){
    if(!book||!spread||!savedPiece||savedPiece.kind!=='photo'||savedPiece.frame==='masked'||selectionLocked||cluster||busy)return;
    const before=structuredClone(savedPiece),context=maskContext.current;
    try{
      const image=new Image();image.src=before.src!;await image.decode();
      if(context!==maskContext.current)return;
      const height=before.h??pieceBox(before).h/(canvas.current?.clientHeight||700)*100;
      setPanel(null);setCropping(false);
      updateMaskDraft({pieceId:before.id,bookId:book.id,spreadId:spread.id,before,
        piece:{...before,h:height,stretch:true,frame:'masked',hideTape:true,cutoutOutline:before.cutoutOutline??.18,crop:before.crop??50,cropY:before.cropY??50,cropZoom:Math.max(1,Math.min(4,before.cropZoom??1))},
        photoRotation:0,imageWidth:image.naturalWidth,imageHeight:image.naturalHeight,shape:'circle',generating:false,token:uid()});
    }catch{toast('照片无法读取，请重新选择照片。');}
  }
  async function applyPhotoMask(){
    const draft=maskDraftRef.current;if(!draft||draft.generating)return;
    const context=maskContext.current,active=()=>maskDraftRef.current?.token===draft.token&&maskContext.current===context;
    updateMaskDraft({...draft,generating:true});let applied=false;
    try{
      await preparePhotoSave();if(!active())return;
      const p=draft.piece,cw=canvas.current?.clientWidth||1000,ch=canvas.current?.clientHeight||700;
      const result=await api<{src:string}>('/photo-mask',send('POST',{src:draft.before.src,shape:draft.shape,crop:p.crop??50,cropY:p.cropY??50,cropZoom:p.cropZoom??1,photoRotation:draft.photoRotation,flipX:!!p.flipX,flipY:!!p.flipY,width:p.w*cw/100,height:(p.h??15)*ch/100,bookId:draft.bookId,spreadId:draft.spreadId,pieceId:draft.pieceId,revision:revision.current}));
      if(!active())return;
      const image=new Image();image.src=result.src;await image.decode();if(!active())return;
      const next=applyMaskToBooks(booksRef.current,draft,result.src);
      cancelPhotoMask();change(()=>next);booksRef.current=next;applied=true;
      pending.current=next;await flush();
      toast(pending.current?'蒙版已生成，手帐保存失败，请重试保存。':'蒙版已应用，原图已移入照片回收站。');
    }catch(e){
      if(!applied&&active()){updateMaskDraft({...draft,generating:false});toast('蒙版生成失败，照片未被修改。 '+(e as Error).message);}
      else if(applied)toast('蒙版图片已保留，请重试保存手帐。');
    }
  }
  async function restoreTrashPhoto(entry:PhotoTrashEntry){
    if(!book||!spread)throw Error('请先打开要恢复照片的跨页。');
    const next=restorePhotoMask(booksRef.current,entry,book.id,spread.id,uid());
    change(()=>next);booksRef.current=next;pending.current=next;await flush();
    if(pending.current)throw Error('照片已恢复，手帐保存失败，请重试保存。');
  }
  function changeSize(axis:'w'|'h',value:number){
    if(!piece||selectionLocked)return;
    const h=piece.h??(selectionSize.h||15),w=piece.w;
    patchPiece(piece.id,{[axis]:value,...(proportional?(axis==='w'?{h:h*value/w}:{w:w*value/h}):axis==='w'?{h}:{}),stretch:true});
  }
  function copyPiece(){
    if(!activePieces.length)return;
    const copies=cloneCluster(activePieces,uid);
    changeSpread(s=>({...s,elements:[...s.elements,...copies]}));setMultiIds(copies.length>1?copies.map(p=>p.id):[]);setSelected(copies[0].id);setEditingGroup(null);toast('已复制，可直接拖动到新位置。');
  }
  function cutSelection(source:ClipboardSource){
    const sourceBook=booksRef.current.find(candidate=>candidate.id===source.sourceBookId);
    const sourceSpread=[sourceBook?.flyleaf,...(sourceBook?.spreads||[])].find(candidate=>candidate?.id===source.sourceSpreadId);
    const ids=new Set(source.pieceIds),pieces=sourceSpread?.elements.filter(candidate=>ids.has(candidate.id))||[];
    if(!pieces.length){toast('剪切的素材已不在原页。');return;}
    if(pieces.some(candidate=>candidate.locked)){toast('锁定素材不能剪切，请先解锁。');return;}
    change(all=>all.map(candidate=>candidate.id!==source.sourceBookId?candidate:{
      ...candidate,
      flyleaf:candidate.flyleaf?.id===source.sourceSpreadId?removePiecesFromSpread(candidate.flyleaf,ids):candidate.flyleaf,
      spreads:candidate.spreads.map(candidateSpread=>candidateSpread.id===source.sourceSpreadId?removePiecesFromSpread(candidateSpread,ids):candidateSpread),
    }));
    if(book?.id===source.sourceBookId&&spread?.id===source.sourceSpreadId)setSelected(null);
    toast(pieces.length>1?'已剪切所选素材，可翻页后粘贴。':'已剪切素材，可翻页后粘贴。');
  }
  function changeLayer(action:'top'|'bottom'|'up'|'down'){
    if(!piece||selectionLocked)return;
    const ids=new Set(activePieces.map(p=>p.id));
    changeSpread(s=>{
      if(ids.size===1)return {...s,elements:reorderPiece(s.elements,piece.id,action)};
      const members=s.elements.filter(p=>ids.has(p.id)),rest=s.elements.filter(p=>!ids.has(p.id));
      const first=s.elements.findIndex(p=>ids.has(p.id));
      const at=action==='top'?rest.length:action==='bottom'?0:Math.max(0,Math.min(rest.length,first+(action==='up'?1:-1)));
      return {...s,elements:[...rest.slice(0,at),...members,...rest.slice(at)]};
    });
  }
  function restoreHistorySnapshot(snapshot: Book[]) {
    cancelAnimationFrame(turnAnimation.current);
    if(bookAnimation.current)clearTimeout(bookAnimation.current);
    turnRef.current=null;
    drag.current=null;
    setFlipping('');setTurnProgress(0);setTurnSettling(false);
    setOpening(false);setClosing(false);
    const position=restoreHistoryPosition(snapshot,bookId,page,opened);
    setBookId(position.bookId);setPage(position.page);setOpened(position.opened);
    if(!position.bookId)setView('library');
    setInlineId(null);setTextRange(null);setSelected(null);
    setDesignPreview(null);
    editingPosition.current=null;scrollRestore.current=null;
    dirty.current=true;
    booksRef.current=snapshot;
    setBooks(snapshot);
  }
  const undo = () => {
    if(maskDraftRef.current){cancelPhotoMask();return;}
    const previous = history.current.pop();
    if (previous) {
      future.current.push(structuredClone(booksRef.current));
      if(future.current.length>30)future.current.shift();
      restoreHistorySnapshot(previous);
      toast('已撤销上一步');
    } else toast('还没有可以撤销的修改');
  };
  const redo = () => {
    if(maskDraftRef.current){cancelPhotoMask();return;}
    const next=future.current.pop();
    if(next){
      history.current.push(structuredClone(booksRef.current));
      if(history.current.length>30)history.current.shift();
      restoreHistorySnapshot(next);
      toast('已重做上一步');
    }else toast('还没有可以重做的修改');
  };
  const removePiece = () => {
    if (selected && !selectionLocked) {
      const ids=new Set(activePieces.map(p=>p.id));
      changeSpread((s) => removePiecesFromSpread(s,ids));
      setSelected(null);
    }
  };
  function deleteOverviewSpread(spreadId: string) {
    if (!book || busy || uploading || opening || closing || flipping) return;
    const before = booksRef.current.find(item => item.id === book.id);
    if (!before) return;
    const after = removeNotebookSpread(before, spreadId);
    if (after === before) return;
    const nextPage = pageAfterSpreadRemoval(before, after, page);
    const nextReading = pageAfterSpreadRemoval(before, after, readingPage - Number(!!before.flyleaf));
    change(all => all.map(item => item.id === before.id ? removeNotebookSpread(item, spreadId) : item));
    setPage(nextPage);
    setOpened(value => value && !!sheetAt(after, nextPage));
    setReadingPage(Math.max(0, nextReading + Number(!!after.flyleaf)));
    const position = editingPosition.current;
    if (position) {
      const rememberedPage = pageAfterSpreadRemoval(before, after, position.page);
      editingPosition.current = { ...position, page: rememberedPage,
        opened: position.opened && !!sheetAt(after, rememberedPage), selected: null };
    }
    setInlineId(null);setTextRange(null);setSelected(null);
    drag.current = null;scrollRestore.current = null;
    setDesignPreview(null);
    toast('跨页已删除，可在编辑模式撤销，也可从历史备份恢复。');
  }
  const openBook = () => {
    if (opened || opening || closing || !book) return;
    change(all=>all.map(b=>b.id===book.id?ensureFlyleaf(b.spreads.length?b:addBlankSpread(b)):b));
    setOpening(true);
    bookAnimation.current=setTimeout(() => {
      setOpened(true);
      setOpening(false);
    }, 720);
  };
  const closeBook = () => {
    setSelected(null);
    setOpened(false);
    setClosing(true);
    bookAnimation.current=setTimeout(() => setClosing(false), 720);
  };
  function startTurn(direction: number) {
    if (turnRef.current || busy) return false;
    const target = page + direction;
    if (target < -1) {
      closeBook();
      return false;
    }
    if(!spread||!book)return false;
    if(target>=0&&!book.spreads[target]){if(reading||direction<0)return false;change(all=>all.map(b=>b.id===book.id?addBlankSpread(b):b))}
    turnRef.current = {
      direction,
      target,
      source: spread,
      sourceIndex: page,
      progress: 0,
      settling: false,
    };
    setSelected(null);
    setFlipping(direction > 0 ? 'next' : 'previous');
    setTurnProgress(0);
    setTurnSettling(false);
    return true;
  }
  /* 翻页进度直接写入 DOM，避免每帧重渲染整个工作台。 */
  function paintTurn(progress: number, direction: number) {
    const layer=canvas.current?.querySelector<HTMLElement>('.page-turn-layer');
    if(!layer)return;
    const frame=leafFrame(progress,direction>0,10);
    if(turnRef.current)turnRef.current.progress=frame.progress;
    const moving=layer.querySelector<HTMLElement>('.turn-moving');
    if(moving)moving.style.transform=`rotateY(${frame.rotation}deg)`;
    const shadow=layer.querySelector<HTMLElement>('.leaf-cast-shadow');
    if(shadow)shadow.style.opacity=String(frame.lift*.24);
    layer.querySelectorAll<HTMLElement>('[data-leaf-index]').forEach((strip,index)=>{
      const segment=frame.segments[index];
      if(!segment)return;
      strip.style.transform=`translate3d(${segment.x*50}cqw,0,${segment.z*50}cqw) rotateY(${segment.angle}deg)`;
      strip.style.setProperty('--front-visible',segment.frontVisible?'visible':'hidden');
      strip.style.setProperty('--back-visible',segment.backVisible?'visible':'hidden');
      const lights=strip.querySelectorAll<HTMLElement>('.leaf-light');
      if(lights[0])lights[0].style.opacity=String(frame.lift*(.025+.065*index/frame.segments.length));
      if(lights[1])lights[1].style.opacity=String(frame.lift*(.025+.065*(1-index/frame.segments.length)));
    });
  }
  function clearTurn(t:NonNullable<typeof turnRef.current>){
    if(turnRef.current!==t)return;
    setFlipping('');setTurnProgress(0);setTurnSettling(false);turnRef.current=null;
  }
  function finishTurn(t:NonNullable<typeof turnRef.current>){
    const images=Array.from(canvas.current?.querySelectorAll<HTMLImageElement>('.page-turn-layer .turn-reveal img')||[]);
    const ready=images.map(img=>new Promise<void>(resolve=>{
      const cleanup=()=>{img.removeEventListener('load',done);img.removeEventListener('error',done);};
      const done=()=>{cleanup();void img.decode().catch(()=>{}).then(()=>resolve());};
      img.addEventListener('load',done,{once:true});
      img.addEventListener('error',done,{once:true});
      if(img.complete)done();
    }));
    void Promise.race([
      Promise.all(ready),
      new Promise<void>(resolve=>setTimeout(resolve,1200)),
    ]).then(()=>requestAnimationFrame(()=>{
      if(turnRef.current!==t)return;
      setPage(t.target);
      clearTurn(t);
    }));
  }
  function settleTurn(complete: boolean) {
    const t = turnRef.current;
    if (!t || t.settling) return;
    t.settling = true;
    setTurnSettling(true);
    const from=t.progress, end=complete?1:0;
    const duration=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:Math.max(180,720*Math.abs(end-from));
    let started:number|undefined;
    const tick=(now:number)=>{
      started ??= now;
      const p=duration?Math.min(1,(now-started)/duration):1;
      paintTurn(from+(end-from)*(p*p*(3-2*p)), t.direction);
      if(p<1)turnAnimation.current=requestAnimationFrame(tick);
      else {if(complete)finishTurn(t);else clearTurn(t);}
    };
    turnAnimation.current=requestAnimationFrame(tick);
  }
  const flip = (direction: number) => {
    if (startTurn(direction))
      requestAnimationFrame(() =>
        requestAnimationFrame(() => settleTurn(true)),
      );
  };
  const openWrite = () => {
    setReading(false);setLibraryOpen(false);openBook();
    setPanel('write');setSelected(null);setDate(today());
  };
  const openSettings = () => {
    setSettingsForm({ ...settings, apiKey: '' });
    setSettingsFeedback(settings.configurationIssue || '');
    setModal('settings');
  };
  const startCover = (target?: Book) => {
    const b = target || book;
    const canStartOnSpread = b?.id === book?.id && view === 'workbench' && page >= 0 && !!spread;
    const initialScope = canStartOnSpread ? 'spread' : 'book';
    const current = canStartOnSpread ? spread : undefined;
    setCoverTitle(b?.title || '拾光集');
    setCoverType(coverInfo(b?.cover).colorway.id);
    setCoverFormat(b?.format || 'standard');
    setCoverAsset(b?.coverAsset || '');
    const paper = paperSettings(b, current);
    setCoverPaperStyle(paper.style);
    setCoverPaperColor(paper.color);
    setCoverPaperRulingSize(paper.rulingSize);
    setCoverHeaderOn(headerOf(b, current).enabled);
    setCoverHeader({...headerOf(b, current)});
    const currentBackground = paperBgOf(b, current) || null;
    setCoverBg(currentBackground);
    setPaperAdvancedOpen(!!currentBackground);
    setCoverTemplates(b?.paperTemplates || []);
    setCoverTab('cover');
    setCoverScope(initialScope);
    setCoverDate(spread?.date||spread?.days[0]?.date||today());
    setEditingBookId(b?.id||null);
    setModal('covers');
  };
  async function upload(files: FileList | null, replace = false, insertOnCanvas=false) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const limit=insertOnCanvas?Math.max(0,Math.min(12,300-(spread?.elements.length||0))):replace?1:6-photos.length;
      const list = Array.from(files).slice(0, limit);
      if (!list.length) throw Error(insertOnCanvas?'当前跨页已满，请先添加新页。':'每篇记录最多 6 张照片。');
      const added: string[] = [];
      for (const file of list) {
        if (file.size > 80 * 1024 * 1024)
          throw Error('单张照片请控制在 80 MB 以内。');
        const params=new URLSearchParams({filename:file.name,lastModified:String(file.lastModified)});
        const response=await fetch('/api/photos/import?'+params,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
        const result=await response.json() as {item?:{src:string};error?:string};
        if(!response.ok||!result.item)throw Error(result.error||'照片保存失败。');
        added.push(result.item.src);
      }
      if(insertOnCanvas&&book){
        const additions:Piece[]=added.map((src,i)=>({id:uid(),kind:'photo',src,photoOriginal:src,x:(page===-1?58:8)+(i%3)*28,y:12+Math.floor(i/3)*18,w:24,rotation:0,locked:false,frame:'plain'}));
        if(page>=0&&!book.spreads.length)change(all=>all.map(b=>b.id===book.id?addBlankSpread(b):b),false);
        changeSpread(s=>({...s,elements:[...s.elements,...additions]}));
        setReading(false);setLibraryOpen(false);setOpened(true);setPanel(null);setSelected(additions.at(-1)?.id||null);toast(`已添加 ${added.length} 张照片，可直接拖动调整。`);
      }else if (replace && piece)
        patchPiece(piece.id, { src: added[0], photoOriginal: added[0], ...(piece.frame==='masked'?{frame:'plain'}:{}) });
      else setPhotos((p) => [...p, ...added].slice(0, 6));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
      if (replaceInput.current) replaceInput.current.value = '';
      if (canvasPhotoInput.current) canvasPhotoInput.current.value = '';
    }
  }
  async function generate(useAI: boolean, regen = false, inst?: string) {
    if (!book || busy) return;
    if (regen && !useAI) { openSettings(); toast('请先连接 AI，才能按你的要求重新设计。'); return; }
    if (regen && !spread) { toast('先翻开手帐，在工作台上放好照片和文字。'); return; }
    if (!regen && !raw.trim() && !photos.length) {
      toast('写一句话，或添加一张照片，就能开始。');
      return;
    }
    if (
      !regen &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
    ) {
      toast('请选择有效的记录日期。');
      return;
    }
    setBusy(true);
    try {
      const day: Day = {
        id: uid(),
        date,
        raw: raw.trim(),
        text: raw.trim(),
        title: '今日小记',
        photos,
      };
      const days = regen ? spread!.days : [day];
      const currentTheme = regen
        ? spread!.theme
        : book.spreads.at(-1)?.days.length === 1
          ? book.spreads.at(-1)!.theme
          : themes[
              (Number(date.slice(-2)) + book.spreads.length) % themes.length
            ].id;
      const headers = (['left','right'] as const).map(side=>headerOf(book,pageSpread(spread,side)));
      const headerSpace = page >= 0 ? Math.max(...headers.map(h=>h.enabled?h.height+2:0)) : 0;
      const result: AIResult = useAI
        ? await api<AIResult>(
            '/generate',
            send('POST', {
              days,
              theme: currentTheme,
              paper:paperSettings(book,spread),
              ratio:bookFormat(book).ratio,
              headerSpace,
              entrySide:regen?undefined:entrySide,
              layoutIntent:regen?'compose':undefined,
              occupiedElements: regen ? [] : ((page<0?book.spreads[0]:spread)?.elements||[]).filter(p=>!isPieceHidden(p)).map(p=>{
                const node=page<0?null:selectedNode(p.id),ch=canvas.current?.clientHeight||700;
                return {id:p.id,kind:p.kind,x:p.x,y:p.y,w:p.w,h:node?Math.max(node.offsetHeight,node.scrollHeight)/ch*100:p.h,rotation:p.rotation};
              }),
              instruction: inst ?? instruction,
              elements: regen ? spread!.elements.map(p=>{
                const node=p.kind==='photo'&&!p.groupId&&!p.locked&&!isPieceHidden(p)?selectedNode(p.id):null;
                const measured=node&&canvas.current?.clientHeight?Math.max(node.offsetHeight,node.scrollHeight)/canvas.current.clientHeight*100:0;
                return {...p,...(measured>0?{h:measured}:{}),locked:isPieceHidden(p)||preserveLocks&&p.locked};
              }) : [],
            }),
          )
        : localResult(days, currentTheme);
      const currentBook=booksRef.current.find(b=>b.id===book.id);
      if (regen && JSON.stringify(currentBook?sheetAt(currentBook,page):undefined) !== JSON.stringify(spread)) throw Error('设计期间页面发生了修改，请重新设计以包含最新内容。');
      if (!regen && JSON.stringify(currentBook?.spreads[Math.max(0,page)]) !== JSON.stringify(book.spreads[Math.max(0,page)])) throw Error('生成期间页面发生了修改，请重新生成以保留最新内容。');
      if (regen) {
        if(result.unchanged){toast('当前排布已适合这页；原有内容已保留。');return;}
        if(result.elements&&!result.headerReserved)result.elements=reserveHeaderSpace(result.elements,headerSpace,spread!.elements.filter(p=>isPieceHidden(p)||(preserveLocks&&p.locked)).map(p=>p.id));
        const protectedSpread={...spread!,elements:spread!.elements.map(p=>({...p,locked:isPieceHidden(p)||preserveLocks&&p.locked}))};
        const designed=regenerateSpread(protectedSpread,result,assets);
        designed.elements=designed.elements.map(p=>{
          const original=spread!.elements.find(q=>q.id===p.id);
          const restored=original?{...p,locked:original.locked}:p;
          return original?withLayerMeta(restored,{hidden:isPieceHidden(original)||undefined,layerName:pieceLayerName(original),groupName:pieceGroupName(original)}):restored;
        });
        setDesignPreview({book,spread:designed,before:JSON.stringify(spread),concept:result.designConcept});
      } else {
        const updated = appendDay(currentBook||book, day, result, assets, Math.max(0, page), entrySide==='left'?0:1, headerSpace);
        change((all) => all.map((b) => (b.id === book.id ? updated : b)));
        setPage(Math.min(page,updated.spreads.length-1));
        setRaw('');
        setPhotos([]);
        toast(useAI ? '今天已收进手帐。' : '已用原文完成本地排版，未调用 AI。');
      }
      setOpened(true);
      setSelected(null);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function applyDesignPreview() {
    if(!designPreview) return;
    const preview=designPreview;
    const owner=booksRef.current.find(b=>b.id===preview.book.id);
    const current=owner?.flyleaf?.id===preview.spread.id?owner.flyleaf:owner?.spreads.find(s=>s.id===preview.spread.id);
    if(JSON.stringify(current)!==preview.before){toast('原页已有新修改，请重新生成以包含最新内容。');return;}
    change(all=>all.map(b=>b.id===preview.book.id?{...b,flyleaf:b.flyleaf?.id===preview.spread.id?preview.spread:b.flyleaf,spreads:b.spreads.map(s=>s.id===preview.spread.id?preview.spread:s)}:b));
    setDesignPreview(null);toast('已应用整个跨页设计，可撤销。');
  }
  function _startSpeech() {
    if (recording) {
      speech.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) {
      toast('当前浏览器不支持语音输入，可使用系统听写输入文字。');
      return;
    }
    const r = new Constructor();
    r.lang = 'zh-CN';
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++)
        text += e.results[i][0].transcript;
      setRaw((old) => (old ? old + '\n' : '') + text);
    };
    r.onerror = (e) => {
      toast(
        e.error === 'not-allowed'
          ? '未获得麦克风权限。可使用系统听写。'
          : '语音识别暂不可用，请使用系统听写或文字输入。',
      );
      setRecording(false);
    };
    r.onend = () => setRecording(false);
    speech.current = r;
    try {
      r.start();
      setRecording(true);
    } catch {
      toast('无法开启语音输入。');
    }
  }
  function paintPointerMovePreview(d:NonNullable<typeof drag.current>,box:Box){
    const paper=canvas.current;if(!paper)return;
    const dx=box.x-d.box.x,dy=box.y-d.box.y;
    for(const member of d.members){const node=selectedNode(member.id);node?.style.setProperty('--drag-x',`${dx}px`);node?.style.setProperty('--drag-y',`${dy}px`);}
    const selection=paper.querySelector<HTMLElement>('[data-selection-box]');selection?.style.setProperty('--drag-x',`${dx}px`);selection?.style.setProperty('--drag-y',`${dy}px`);
    paper.classList.add('is-moving-selection');
  }
  function clearPointerMovePreview(){
    const paper=canvas.current;if(!paper)return;
    paper.querySelectorAll<HTMLElement>('[data-piece-id],[data-selection-box]').forEach(node=>{node.style.removeProperty('--drag-x');node.style.removeProperty('--drag-y');});
    paper.classList.remove('is-moving-selection');
  }
  function pointerDown(e: React.PointerEvent, id: string, mode = 'move') {
    suppressSelectionClick.current=false;
    if (reading || inlineId === id || e.button !== 0 || !e.isPrimary || busy || turnRef.current || maskDraftRef.current?.generating) return;
    e.stopPropagation();
    const p=maskDraftRef.current?.pieceId===id?maskDraftRef.current.piece:spread?.elements.find(p=>p.id===id),paper=canvas.current;
    if(!p||!paper)return;
    if((e.shiftKey||e.metaKey||e.ctrlKey)&&mode==='move')return;
    const alreadyActive=activePieces.some(q=>q.id===id);
    const members=alreadyActive?activePieces:p.groupId&&p.groupId!==editingGroup?spread!.elements.filter(q=>q.groupId===p.groupId):[p];
    if(mode==='move'&&!alreadyActive)selectPiece(p);
    if(members.some(p=>p.locked))return;
    const r=paper.getBoundingClientRect(),cw=paper.clientWidth,ch=paper.clientHeight,boxes=members.map(pieceBox);
    const box=members.length>1?unionBoxes(boxes):boxes[0];
    const cx=r.left+paper.clientLeft+box.x+box.w/2,cy=r.top+paper.clientTop+box.y+box.h/2;
    drag.current={id,pointerId:e.pointerId,x:e.clientX,y:e.clientY,mode:maskDraftRef.current?.pieceId===id&&mode==='move'?'mask-crop':cropping&&p.kind==='photo'?'crop':mode,box,canvasW:cw,canvasH:ch,cx,cy,angle:Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI,started:false,members,boxes,crop:{x:p.crop??50,y:p.cropY??50}};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;
    if(!(e.buttons&1)){endPointerDrag();return;}
    const dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(!d.started){if(Math.hypot(dx,dy)<3)return;remember();d.started=true;}
    if(d.mode==='mask-crop'){
      const draft=maskDraftRef.current;if(!draft||draft.generating)return;
      const p=d.members[0],angle=-p.rotation*Math.PI/180,inner=-draft.photoRotation*Math.PI/180;
      const x=dx*Math.cos(angle)-dy*Math.sin(angle),y=dx*Math.sin(angle)+dy*Math.cos(angle);
      const ix=(x*Math.cos(inner)-y*Math.sin(inner))*(p.flipX?-1:1),iy=(x*Math.sin(inner)+y*Math.cos(inner))*(p.flipY?-1:1);
      const r=maskImageRect(draft.imageWidth,draft.imageHeight,d.box.w,d.box.h,p.crop??50,p.cropY??50,p.cropZoom??1,draft.photoRotation),bounds=rotatedMaskBounds(d.box.w,d.box.h,draft.photoRotation);
      patchPiece(d.id,{crop:Math.max(0,Math.min(100,(p.crop??50)-(r.width>bounds.width+.01?ix/(r.width-bounds.width)*100:0))),cropY:Math.max(0,Math.min(100,(p.cropY??50)-(r.height>bounds.height+.01?iy/(r.height-bounds.height)*100:0)))},false);return;
    }
    if(d.mode==='crop'){patchPiece(d.id,{crop:Math.max(0,Math.min(100,d.crop!.x-dx/d.box.w*100)),cropY:Math.max(0,Math.min(100,d.crop!.y-dy/d.box.h*100))},false);return;}
    let box={...d.box};
    if(d.mode==='rotate'){
      box.rotation=normalizeAngle(d.box.rotation+Math.atan2(e.clientY-d.cy,e.clientX-d.cx)*180/Math.PI-d.angle);
      if(e.shiftKey)box.rotation=Math.round(box.rotation/15)*15;
    }else if(d.mode.startsWith('resize-')){
      const handle=d.mode.slice(7);
      box=resizeBox(d.box,handle,dx,dy,d.members.length>1||isCornerResizeHandle(handle)||(!maskDraftRef.current&&proportional)||e.shiftKey);
      const scale=Math.min(1,d.canvasW/box.w,d.canvasH/box.h);box.w*=scale;box.h*=scale;
      box.x=Math.max(0,Math.min(d.canvasW-box.w,box.x));box.y=Math.max(0,Math.min(d.canvasH-box.h,box.y));
    }else{
      const moveBounds=unionBoxes(d.boxes),limited=clampSelectionMove([{id:'moving',...moveBounds}],{x:dx,y:dy},{width:d.canvasW,height:d.canvasH},28);
      box.x=d.box.x+limited.x;box.y=d.box.y+limited.y;
    }
    if(d.mode==='move'){d.lastBox=box;paintPointerMovePreview(d,box);return;}
    if(d.members.length>1){const transformed=transformCluster(d.members,d.boxes,d.box,box,d.canvasW,d.canvasH);const updates=new Map(transformed.map(p=>[p.id,p]));changeSpread(s=>({...s,elements:s.elements.map(p=>updates.get(p.id)||p)}),false);}
    else if(d.mode==='rotate')patchPiece(d.id,{rotation:box.rotation},false);
    else patchPiece(d.id,{x:box.x/d.canvasW*100,y:box.y/d.canvasH*100,w:box.w/d.canvasW*100,h:box.h/d.canvasH*100,stretch:true},false);
  }
  function endPointerDrag(){
    const d=drag.current;
    if(d?.started&&d.mode==='move'&&d.lastBox){
      const dx=(d.lastBox.x-d.box.x)/d.canvasW*100,dy=(d.lastBox.y-d.box.y)/d.canvasH*100,ids=new Set(d.members.map(p=>p.id));
      changeSpread(s=>({...s,elements:s.elements.map(p=>ids.has(p.id)?{...p,x:p.x+dx,y:p.y+dy}:p)}),false);
      // Pointer capture also sends a click after the drop. Keep it from selecting the piece again.
      suppressSelectionClick.current=true;
      setSelected(null);
    }
    clearPointerMovePreview();drag.current=null;
  }
  function cancelPointerDrag(){clearPointerMovePreview();drag.current=null;}
  function insertLibraryAssets(list:Asset[]) {
    if(!book||!list.length)return false;
    const side=page===-1?1:0;
    const current=spread;
    if((current?.elements.length||0)+list.length>300){toast('这一页素材过多，请先翻到新页。');return false;}
    const columns=Math.min(4,Math.ceil(Math.sqrt(list.length))),rows=Math.ceil(list.length/columns);
    const pieces:Piece[]=list.map((a,i)=>({id:uid(),kind:'asset',assetId:a.id,src:a.src,x:side*50+5+(i%columns)*(40/columns),y:10+Math.floor(i/columns)*(72/rows),w:list.length===1?18:Math.min(13,36/columns),rotation:0,locked:false}));
    if(page>=0&&!book.spreads.length)change(all=>all.map(b=>b.id===book.id?addBlankSpread(b):b),false);
    changeSpread(s=>({...s,elements:[...s.elements,...pieces]}));
    setOpened(true);setReading(false);setLibraryOpen(false);setPanel(null);setSelected(pieces.length===1?pieces[0].id:null);toast(`已将${list.length}件素材放入手帐，可拖动调整。`);return true;
  }
  function insertPhotoLibrary(sources:string[]){
    if(!book||!sources.length){toast('请先打开一本手帐。');return false}
    const current=spread;
    if((current?.elements.length||0)+sources.length>300){toast('当前跨页空间不足，请减少选择或翻到新页。');return false}
    const side=page===-1?1:0;
    const pieces:Piece[]=sources.map((src,index)=>({id:uid(),kind:'photo',src,photoOriginal:src,x:side*50+7+(index%8)*5,y:11+(Math.floor(index/8)%9)*6,w:24,rotation:(index%3-1)*1.5,locked:false,frame:'plain'}));
    if(page>=0&&!book.spreads.length)change(all=>all.map(item=>item.id===book.id?addBlankSpread(item):item),false);
    changeSpread(currentSpread=>({...currentSpread,elements:[...currentSpread.elements,...pieces]}));
    setOpened(true);setReading(false);setLibraryOpen(false);setPanel(null);setModal(null);setMultiIds(pieces.length>1?pieces.map(piece=>piece.id):[]);setSelected(pieces[0]?.id||null);toast(`已将 ${pieces.length} 张照片放入当前跨页，可继续调整。`);return true;
  }
  function savePaper() {
    if (!book) return;
    change((all) =>
      all.map((b) =>
        b.id === book.id
          ? (paperScope === 'left' || paperScope === 'right') && spread
            ? patchPage(b,spread.id,paperScope,{paperStyle,paperColor,paperRulingSize})
            : applyPaper(
              b,
              paperStyle,
              paperColor,
              paperScope === 'spread' && page >= 0 ? spread?.id : undefined,
              paperRulingSize,
            )
          : b,
      ),
    );
    setModal(null);
  }
  function insertToken(token: string) {
    const el = headerText.current;
    const pos = el ? el.selectionStart : headerForm.text.length;
    const end = el ? el.selectionEnd : pos;
    const next =
      headerForm.text.slice(0, pos) + token + headerForm.text.slice(end);
    setHeaderForm((f) => ({ ...f, text: next }));
  }
  function saveHeader() {
    if (!book) return;
    const cfg = sanitizeHeader(headerForm);
    change((all) =>
      all.map((b) => {
        if (b.id !== book.id) return b;
        let next = (headerScope === 'left' || headerScope === 'right') && spread
          ? patchPage(b,spread.id,headerScope,{header:cfg,date:headerDate})
          : applyHeader(b,cfg,headerScope === 'spread' && page >= 0 ? spread?.id : undefined);
        if (
          headerScope !== 'left' && headerScope !== 'right' &&
          page >= 0 &&
          spread &&
          /^\d{4}-\d{2}-\d{2}$/.test(headerDate) &&
          headerDate !== (spread.date || spread.days[0]?.date)
        )
          next = {
            ...next,
            spreads: next.spreads.map((s) =>
              s.id === spread.id ? { ...s, date: headerDate } : s,
            ),
          };
        return next;
      }),
    );
    setModal(null);
    toast('页眉已应用。');
  }
  async function uploadPaperBg(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      if (!['image/jpeg', 'image/png'].includes(file.type))
        throw Error('请选择 JPG 或 PNG 图片。');
      if (file.size > 10 * 1024 * 1024)
        throw Error('单张图片请控制在 10 MB 以内。');
      const data = await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () =>
          typeof r.result === 'string' ? ok(r.result) : fail(Error('图片读取失败'));
        r.onerror = () => fail(Error('图片读取失败。'));
        r.readAsDataURL(file);
      });
      const result = await api<{ src: string }>('/upload', send('POST', { data }));
      setBgForm({ src: result.src, x: 0, y: 0, scale: 100 });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      if (bgInput.current) bgInput.current.value = '';
    }
  }
  function bgPointerDown(e: React.PointerEvent) {
    if (!bgForm) return;
    bgDrag.current = { x: e.clientX, y: e.clientY, bx: bgForm.x, by: bgForm.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function bgPointerMove(e: React.PointerEvent) {
    const d = bgDrag.current;
    if (!d || !bgPreview.current) return;
    const r = bgPreview.current.getBoundingClientRect();
    setBgForm((f) =>
      f
        ? {
            ...f,
            x: Math.max(-200, Math.min(100, d.bx + ((e.clientX - d.x) / r.width) * 100)),
            y: Math.max(-200, Math.min(100, d.by + ((e.clientY - d.y) / r.height) * 100)),
          }
        : f,
    );
  }
  function saveBgTemplate() {
    if (!book || !bgForm) return;
    const template = {
      ...bgForm,
      id: uid(),
      name: bgName.trim() || '我的内页',
    };
    change((all) =>
      all.map((b) =>
        b.id === book.id
          ? { ...b, paperTemplates: [...(b.paperTemplates || []), template] }
          : b,
      ),
    );
    toast(`模板「${template.name}」已保存，可重复使用。`);
  }
  function removeBgTemplate(id: string) {
    if (!book) return;
    change((all) =>
      all.map((b) =>
        b.id === book.id
          ? { ...b, paperTemplates: (b.paperTemplates || []).filter((t) => t.id !== id) }
          : b,
      ),
    );
  }
  function applyBg(scope: 'book' | 'spread' | 'left' | 'right', bg: PaperBg | null, message: string) {
    if (!book) return;
    change((all) =>
      all.map((b) =>
        b.id === book.id
          ? ((scope === 'left' || scope === 'right') && spread ? patchPage(b,spread.id,scope,{paperBg:bg}) : applyPaperBg(b, bg, scope === 'spread' && page >= 0 ? spread?.id : undefined))
          : b,
      ),
    );
    toast(message);
  }
  function addDate() {
    if (!spread) return;
    const d = new Date(dateLabel + 'T12:00:00');
    if (Number.isNaN(d.getTime())) {
      toast('请选择有效日期');
      return;
    }
    const text =
      dateFormat === 'weekday'
        ? d.toLocaleDateString('zh-CN', {
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })
        : dateFormat === 'english'
          ? d.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })
          : dateLabel.replaceAll('-', ' / ');
    const p: Piece = {
      id: uid(),
      kind: 'text',
      role: 'date',
      text,
      x: dateSide === 'left' && page !== -1 ? 6 : 56,
      y: 5,
      w: 36,
      rotation: 0,
      locked: false,
      fontSize: 18,
    };
    changeSpread((s) => ({ ...s, elements: [...s.elements, p] }));
    setSelected(p.id);
    setPanel(null);
    setModal(null);
  }
  const resolveMaterial = (src: string | undefined, id?: string) =>
    assets.find((a) => (id ? a.id === id : a.originalSrc === src))?.src || src;
  function pageMaterialCutSourceBox(p:Piece,box:Box,paper:HTMLDivElement){
    const image=selectedNode(p.id)?.querySelector<HTMLImageElement>(':scope > img');
    if(!image||!image.naturalWidth||!image.naturalHeight)return null;
    const style=getComputedStyle(image),imageWidth=parseFloat(style.width),imageHeight=parseFloat(style.height);
    if(!Number.isFinite(imageWidth)||!Number.isFinite(imageHeight)||imageWidth<=0||imageHeight<=0)return null;
    let contentWidth=imageWidth,contentHeight=imageHeight,insideX=0,insideY=0;
    if(style.objectFit==='contain'){
      const scale=Math.min(imageWidth/image.naturalWidth,imageHeight/image.naturalHeight);
      contentWidth=image.naturalWidth*scale;contentHeight=image.naturalHeight*scale;
      insideX=(imageWidth-contentWidth)*(p.crop??50)/100;
      insideY=(imageHeight-contentHeight)/2;
    }
    if(p.flipX)insideX=imageWidth-insideX-contentWidth;
    if(p.flipY)insideY=imageHeight-insideY-contentHeight;
    return {
      x:(box.x+image.offsetLeft+insideX)/paper.clientWidth*100,
      y:(box.y+image.offsetTop+insideY)/paper.clientHeight*100,
      width:contentWidth/paper.clientWidth*100,
      height:contentHeight/paper.clientHeight*100,
    };
  }
  function verifyPageMaterialCutTarget(target:PageMaterialCutTarget,total:number){
    const current=assertPageMaterialCutTarget(booksRef.current,target,total).piece,
      currentSource=resolveMaterial(current.src,current.assetId);
    if(!currentSource||currentSource!==target.sourceSrc)
      throw Error('素材图片在裁切期间已有更新，请返回纸面后重新打开自由裁切。');
  }
  function verifyPageMaterialCutDraft(target:PageMaterialCutTarget,placements:PageMaterialCutPlacement[]){
    verifyPageMaterialCutTarget(target,placements.length);
    assertPageMaterialCutPlacements(target,placements);
  }
  function startPageMaterialCut(){
    if(!book||!spread||!piece||piece.kind!=='asset'||piece.material==='tape'||selectionLocked||cluster)return;
    const sourceSrc=resolveMaterial(piece.src,piece.assetId),paper=canvas.current;
    if(!sourceSrc||!paper||paper.clientWidth<1||paper.clientHeight<1){toast('当前素材图片无法打开，请重新选择素材。');return;}
    const box=pieceBox(piece),node=selectedNode(piece.id),renderedHeight=node?parseFloat(getComputedStyle(node).height):box.h,
      sourceBox=pageMaterialCutSourceBox(piece,box,paper),libraryAsset=assets.find(asset=>asset.id===piece.assetId);
    if(!sourceBox){toast('素材图片还在加载，请稍候再打开自由裁切。');return;}
    setPageMaterialCutTarget({
      sessionId:crypto.randomUUID(),bookId:book.id,spreadId:spread.id,piece:structuredClone(piece),sourceSrc,
      sourceBox,
      pieceHeight:(Number.isFinite(renderedHeight)&&renderedHeight>0?renderedHeight:box.h)/paper.clientHeight*100,canvasWidth:paper.clientWidth,canvasHeight:paper.clientHeight,
      name:libraryAsset?.name||piece.artLabel||'素材',
    });
    setPanel(null);setCropping(false);setModal('material-cut');
  }
  function applyPageMaterialCutOutputs(target:PageMaterialCutTarget,outputs:PageMaterialCutOutput[]){
    verifyPageMaterialCutTarget(target,outputs.length);
    const result=applyPageMaterialCut(booksRef.current,target,outputs,uid);
    change(()=>result.books);
    setPageMaterialCutTarget(null);setModal(null);setPanel(null);setCropping(false);
    setMultiIds(result.pieces.length>1?result.pieces.map(item=>item.id):[]);
    setSelected(result.pieces[0]?.id||null);
    toast(`已在当前纸面生成 ${result.pieces.length} 块裁片；素材库原图保持不变。`);
  }
  function addText() {
    if (!spread) return;
    const p: Piece = {
      id: uid(),
      kind: 'text',
      text: '',
      x: 55,
      y: 45,
      w: 30,
      rotation: 0,
      locked: false,
      fontSize: 20,
    };
    changeSpread((s) => ({ ...s, elements: [...s.elements, p] }));
    setSelected(p.id);
    setPanel(null);
    setInlineId(p.id);
    setInlineText(p.text || '');
  }
  function addVellumSheet() {
    if (!spread) return;
    if (!canAddSpreadElements(spread)) {
      toast('这一页素材过多，请先翻到新页。');
      return;
    }
    const p = withLayerMeta({
      id: uid(),
      kind: 'doodle',
      role: 'decor',
      x: 58,
      y: 38,
      w: 30,
      h: 24,
      rotation: 0,
      locked: false,
      frame: 'vellum-sheet',
      material: 'paper',
      artLabel: '硫酸纸',
      color: DEFAULT_VELLUM_COLOR,
      opacity: DEFAULT_VELLUM_OPACITY,
      stretch: true,
      drawing: [{
        path: 'M 1 1 H 99 V 99 H 1 Z',
        fill: DEFAULT_VELLUM_COLOR,
        stroke: VELLUM_BORDER_COLOR,
        width: 1,
      }],
    }, {layerName:'硫酸纸',stackOrder:19});
    changeSpread((s) => ({ ...s, elements: [...s.elements, p] }));
    setSelected(p.id);
    setMultiIds([]);
    setPanel(null);
    setCropping(false);
    setInlineId(null);
    toast('已插入硫酸纸，默认覆盖下方素材；可调整颜色、纸张浓度和图层。');
  }
  async function cutout() {
    if (!piece?.src) return;
    setBusy(true);
    try {
      const result = await api<{ src: string }>(
        '/cutout',
        send('POST', { src: piece.photoOriginal || piece.src }),
      );
      patchPiece(piece.id, { src: result.src, frame: 'cutout',cutoutOutline:.18,hideTape:true,crop:50,cropY:50,cropZoom:1,h:undefined,stretch:false });
      toast('主体已抠出，原图仍然保留。');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(testConnection = false) {
    setSettingsSaving(true);
    try {
      const result = await api<SettingsData>(
        '/settings',
        send('PUT', settingsForm),
      );
      setSettings(result);
      setSettingsForm({ ...result, apiKey: '' });
      setSettingsFeedback('设置已保存，密钥已保留。');
      if (testConnection) {
        setSettingsFeedback('设置已保存，正在测试连接…');
        const test = await api<{ message: string }>(
          '/settings/test',
          send('POST', {}),
        );
        setSettingsFeedback(test.message);
      }
    } catch (e) {
      setSettingsFeedback((e as Error).message);
    } finally {
      setSettingsSaving(false);
    }
  }
  function enterBook(b: Book) {
    setBookId(b.id);
    localStorage.setItem('shiguang.lastBookId', b.id);
    const next = [b.id, ...recent.filter((id) => id !== b.id)].slice(0, 5);
    setRecent(next);
    localStorage.setItem('shiguang.recentBooks', JSON.stringify(next));
  }
  function deleteNotebook() {
    if (!deletingBook) return;
    const id = deletingBook.id;
    change(all => all.filter(b => b.id !== id));
    const nextRecent = recent.filter(item => item !== id);
    setRecent(nextRecent);
    localStorage.setItem('shiguang.recentBooks', JSON.stringify(nextRecent));
    localStorage.removeItem('shiguang.position.' + id);
    if (localStorage.getItem('shiguang.lastBookId') === id) localStorage.removeItem('shiguang.lastBookId');
    if (bookId === id) {setBookId('');setPage(-1);setOpened(false);setSelected(null);scrollRestore.current=null;}
    setDeletingBook(null);
    toast('笔记本已删除');
  }
  function chooseBook(b: Book) {
    enterBook(b);
    setView('workbench');
    setReading(false);setLibraryOpen(false);
    setPage(-1);
    setOpened(false);
    setPanel(null);
    setSelected(null);
    setModal(null);
  }

  function insertCoverToken(token: string) {
    const el=coverHeaderText.current;
    const start=el?.selectionStart ?? coverHeader.text.length;
    const end=el?.selectionEnd ?? start;
    setCoverHeader(f=>({...f,text:(f.text.slice(0,start)+token+f.text.slice(end)).slice(0,120)}));
    requestAnimationFrame(()=>{el?.focus();el?.setSelectionRange(start+token.length,start+token.length);});
  }
  async function uploadCoverBackground(file?: File) {
    if(!file)return;
    setCoverUploadBusy(true);
    try {
      if(!['image/jpeg','image/png'].includes(file.type))throw Error('请选择 JPG 或 PNG 图片。');
      if(file.size>10*1024*1024)throw Error('单张图片请控制在 10 MB 以内。');
      const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>typeof r.result==='string'?resolve(r.result):reject(Error('图片读取失败。'));r.onerror=()=>reject(Error('图片读取失败。'));r.readAsDataURL(file);});
      const result=await api<{src:string}>('/upload',send('POST',{data}));
      setCoverBg({src:result.src,x:0,y:0,scale:100});
    } catch(e) {toast((e as Error).message);} finally {setCoverUploadBusy(false);if(coverBgInput.current)coverBgInput.current.value='';}
  }
  function changeCoverScope(scope: string){
    setCoverScope(scope);
    const b=books.find(b=>b.id===editingBookId);
    const current=scope==='book'?undefined:scope==='spread'?spread:pageSpread(spread,scope==='right'?'right':'left');
    const paper=paperSettings(b,current),header=headerOf(b,current),background=paperBgOf(b,current)||null;
    setCoverPaperStyle(paper.style);setCoverPaperColor(paper.color);setCoverPaperRulingSize(paper.rulingSize);setCoverBg(background);setPaperAdvancedOpen(!!background);setCoverHeader({...header});setCoverHeaderOn(header.enabled);
    setCoverDate(current?.date||current?.days[0]?.date||spread?.date||spread?.days[0]?.date||today());
  }
  function notebookWithSettingsDraft(existing: Book) {
    const header=sanitizeHeader({...coverHeader,enabled:coverHeaderOn});
    const canScope=view==='workbench' && page>=0 && spread && existing.id===book?.id;
    const target=canScope
      ? coverScope==='book'
        ? undefined
        : coverScope==='spread'
          ? spread
          : pageSpread(spread,coverScope==='right'?'right':'left')
      : undefined;
    const currentPaper=paperSettings(existing,target);
    const currentHeader=sanitizeHeader({...headerOf(existing,target)});
    const currentBackground=paperBgOf(existing,target)||null;
    const paperChanged=currentPaper.style!==coverPaperStyle||currentPaper.color!==coverPaperColor||currentPaper.rulingSize!==coverPaperRulingSize;
    const headerChanged=JSON.stringify(currentHeader)!==JSON.stringify(header);
    const backgroundChanged=JSON.stringify(currentBackground)!==JSON.stringify(coverBg);
    const dateTarget=canScope
      ? coverScope==='left'||coverScope==='right'
        ? pageSpread(spread,coverScope)
        : spread
      : undefined;
    const currentDate=dateTarget?.date||dateTarget?.days[0]?.date||today();
    const dateChanged=!!canScope&&!!coverDate&&coverDate!==currentDate;
    let next:Book={...existing,title:coverTitle.trim()||'未命名笔记本',cover:coverType,coverAsset,format:coverFormat,paperTemplates:coverTemplates};
    if(canScope&&(coverScope==='left'||coverScope==='right')){
      const patch:Parameters<typeof patchPage>[3]={};
      if(paperChanged){patch.paperStyle=coverPaperStyle;patch.paperColor=coverPaperColor;patch.paperRulingSize=coverPaperRulingSize;}
      if(headerChanged)patch.header=header;
      if(backgroundChanged)patch.paperBg=coverBg;
      if(dateChanged)patch.date=coverDate;
      if(Object.keys(patch).length)next=patchPage(next,spread.id,coverScope,patch);
    }else{
      const id=canScope&&coverScope==='spread'?spread.id:undefined;
      if(paperChanged)next=applyPaper(next,coverPaperStyle,coverPaperColor,id,coverPaperRulingSize);
      if(headerChanged)next=applyHeader(next,header,id);
      if(backgroundChanged)next=applyPaperBg(next,coverBg,id);
      if(canScope&&dateChanged)next={...next,spreads:next.spreads.map(item=>item.id===spread.id?{...item,date:coverDate}:item)};
    }
    return next;
  }
  function saveCover() {
    const existing=books.find(b=>b.id===editingBookId);
    if(existing){
      change(all=>all.map(item=>item.id===existing.id?notebookWithSettingsDraft(item):item));
    }else{
      const header=sanitizeHeader({...coverHeader,enabled:coverHeaderOn});
      const b={...newBook(today().slice(0,7),coverType,coverTitle.trim()||'未命名笔记本',coverFormat,{paperStyle:coverPaperStyle,paperColor:coverPaperColor,paperRulingSize:coverPaperRulingSize,header}),coverAsset,paperBg:coverBg||undefined,paperTemplates:coverTemplates};
      change(all=>[...all,b]);enterBook(b);setPage(-1);setOpened(false);setView('workbench');
    }
    setModal(null);toast(existing?'笔记本设置已更新。':'已创建新笔记本。');
  }
  async function prepareFullBackup() {
    if(busy||uploading||writing.current)throw Error('手帐正在保存或处理，请稍后重试。');
    if(saveBlocked.current)throw Error('请先处理保存冲突；可导出本窗口内容作为应急副本。');
    if(dirty.current)pending.current=booksRef.current;
    await flush();
    if(pending.current||writing.current||saveBlocked.current)throw Error('手帐尚未保存，请先重试保存。');
    return revision.current;
  }
  async function receiveFullBackup() {
    const [restored,library]=await Promise.all([api<{revision:number;books:Book[]}>('/state'),api<Asset[]>('/materials')]);
    revision.current=restored.revision;saveBlocked.current=false;pending.current=null;
    history.current=[];future.current=[];
    restoreHistorySnapshot(restored.books);dirty.current=false;
    setAssets(library);setSaved('已保存到本机');setView('library');setLibraryOpen(false);setReading(false);setPanel(null);
    const fontStyles=document.querySelector<HTMLLinkElement>('link[data-user-fonts]');
    if(fontStyles)fontStyles.href='/api/fonts.css?restored='+Date.now();
  }
  async function exportBackup() {
    try {
      toast('正在整理手帐和原始照片…');
      const backupBooks = resolveNotebookAssetSources(books, assets) as Book[];
      const paths = notebookUploads(backupBooks);
      const images: Record<string, string> = {};
      for (const path of paths) {
        const response = await fetch(path);
        if (!response.ok) throw Error('部分照片读取失败，备份未完成。');
        const blob = await response.blob();
        images[path] = await new Promise<string>((ok, fail) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === 'string'
              ? ok(reader.result)
              : fail(Error('照片读取失败'));
          reader.onerror = fail;
          reader.readAsDataURL(blob);
        });
      }
      const blob = new Blob(
        [JSON.stringify({ format: 'shiguang-v1', books: backupBooks, images })],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = `拾光手帐备份-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('备份已导出，包含日志、排版和原始照片。');
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function restoreNotebookCopies(source: Book[]) {
    if(saveBlocked.current)throw Error('请先处理保存冲突，再恢复历史备份。');
    const copies=copyNotebooks(source,'恢复副本');
    const before=booksRef.current;
    await api('/validate',send('POST',{books:[...before,...copies]}));
    if(booksRef.current!==before)throw Error('恢复准备期间手帐发生了修改，请重试；现有内容没有被覆盖。');
    change(all=>[...all,...copies]);
    toast(`已添加 ${copies.length} 本恢复副本，正在保存。`);
  }
  async function resolveSaveConflict() {
    if(recoveringSave||writing.current)return;
    setRecoveringSave(true);
    try {
      const current=await api<{books:Book[];revision:number}>('/state');
      const local=booksRef.current;
      const copies=copyNotebooks(local,'本窗口副本');
      const merged=[...current.books,...copies];
      await api('/validate',send('POST',{books:merged}));
      if(booksRef.current!==local)throw Error('准备副本期间手帐发生了修改，请重试；本窗口内容仍保留。');
      // Undo may remove the new copies, but must never restore an obsolete server snapshot.
      history.current=[structuredClone(current.books)];future.current=[];
      revision.current=current.revision;saveBlocked.current=false;pending.current=merged;
      restoreHistorySnapshot(merged);
      setView('library');setLibraryOpen(false);setReading(false);setPanel(null);
      await flush();
    }catch(e){toast((e as Error).message);}
    finally{setRecoveringSave(false);}
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable ||
        target.closest('[role="dialog"], [role="alertdialog"], [data-page-overview]') ||
        reading ||
        modal ||
        busy
      )
        return;
      if (!reading && (e.metaKey || e.ctrlKey) && ((e.shiftKey&&e.key.toLowerCase()==='z')||e.key.toLowerCase()==='y')) {
        e.preventDefault();
        redo();
      } else if (!reading && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if(!reading&&spread&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='a'){
        e.preventDefault();setInlineId(null);commitSelectionIds(spread.elements.filter(p=>!p.locked&&!isPieceHidden(p)).map(p=>p.id));
      } else if (
        !reading &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selected
      ) {
        e.preventDefault();
        removePiece();
      } else if(!reading&&piece&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='d'){
        e.preventDefault();copyPiece();
      } else if(!reading&&piece&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();if(!e.repeat)remember();
        const step=e.shiftKey?10:1,r=canvas.current?.getBoundingClientRect();if(!r)return;
        if(selectionLocked)return;
        const box=clusterBox||pieceBox(piece),cw=canvas.current!.clientWidth,ch=canvas.current!.clientHeight;
        const dx=Math.max(-box.x,Math.min(cw-box.x-box.w,e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))/cw*100;
        const dy=Math.max(-box.y,Math.min(ch-box.y-box.h,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0))/ch*100;
        const ids=new Set(activePieces.map(p=>p.id));changeSpread(s=>({...s,elements:s.elements.map(p=>ids.has(p.id)?{...p,x:p.x+dx,y:p.y+dy}:p)}),false);
      } else if (e.key === 'ArrowRight') flip(1);
      else if (e.key === 'ArrowLeft') flip(-1);
      else if (e.key === 'Escape') finishEditing();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: 'stage_journal_entry',
          title: '准备一篇手帐',
          description:
            '把文字放入填写面板供用户查看，不生成、不保存、不发送到 AI。',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string', maxLength: 8000 } },
            required: ['text'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: (input: { text: string }) => {
            if (typeof input.text !== 'string' || input.text.length > 8000)
              throw Error('需要 8000 字以内的文字。');
            setReading(false);
            setRaw(input.text);
            setPanel('write');
            setOpened(true);
            return { staged: true };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {
      /* Unsupported experimental registry does not block the journal. */
    }
    return () => lifecycle.abort();
  }, []);
  const currentMonth = book?.month || today().slice(0, 7);
  const format = bookFormat(book);
  const isFlyleaf = page === -1;
  const decorative = (spread?.elements || []).map(p=>maskActive&&p.id===photoMaskDraft!.pieceId?photoMaskDraft!.piece:p);
  const pageElementRows=(()=>{
    const seen=new Set<string>();
    let groupNumber=0;
    return decorative.flatMap((p)=>{
      if(!p.groupId)return [{key:`piece:${p.id}`,members:[p],representative:p,groupNumber:0}];
      if(seen.has(p.groupId))return [];
      seen.add(p.groupId);
      groupNumber+=1;
      const members=decorative.filter(q=>q.groupId===p.groupId);
      return [{key:`group:${p.groupId}`,members,representative:p,groupNumber}];
    });
  })();
  const paper = isFlyleaf
    ? { ...paperSettings(book), style: 'blank' as PaperStyle }
    : paperSettings(book, spread);
  const paperDark =
    parseInt(paper.color.slice(1, 3), 16) * 0.299 +
      parseInt(paper.color.slice(3, 5), 16) * 0.587 +
      parseInt(paper.color.slice(5, 7), 16) * 0.114 <
    125;
  const cover = coverInfo(book?.cover);
  const canScopeNotebookSettings =
    editingBookId === book?.id && view === 'workbench' && page >= 0 && !!spread;
  const notebookScopeOptions = [
    { id: 'book', name: '整本笔记本' },
    { id: 'spread', name: '当前跨页' },
    { id: 'left', name: '仅左页' },
    { id: 'right', name: '仅右页' },
  ];
  const notebookScopeSummary =
    coverScope === 'book'
      ? '内页与页眉将应用于全部正文页'
      : coverScope === 'spread'
        ? '内页与页眉将应用于当前跨页'
        : coverScope === 'left'
          ? '内页与页眉将仅应用于当前左页'
          : '内页与页眉将仅应用于当前右页';
  const notebookSettingsPreview = (() => {
    if (!canScopeNotebookSettings || !book || !spread) return null;
    const previewBook=notebookWithSettingsDraft(book);
    const previewSpread = previewBook.spreads.find((item) => item.id === spread.id);
    return previewSpread ? { book: previewBook, spread: previewSpread } : null;
  })();
  const bg = !isFlyleaf ? paperBgOf(book, spread) : undefined;
  const orderedBooks = [...books].sort((a, b) => {
    const ia = recent.indexOf(a.id), ib = recent.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const photoProtectedSources=[...new Set([books,...history.current,...future.current].flatMap(notebookUploads))];
  const swatchDark = (c: string) =>
    parseInt(c.slice(1, 3), 16) * 0.299 +
      parseInt(c.slice(3, 5), 16) * 0.587 +
      parseInt(c.slice(5, 7), 16) * 0.114 <
    125;
  return (
    <div
      className={`app-shell compact-shell ${view === 'library' ? 'is-library' : reading ? 'is-reading' : 'is-editing'}`}
    >
      <input ref={canvasPhotoInput} type="file" accept="image/*" multiple hidden onChange={e=>void upload(e.target.files,false,true)}/>
      <aside className="rail" aria-label="主要功能">
        <div className="brand">s.</div>
        <button className={view==='library'?'active':''} aria-label="笔记库" onClick={()=>{if(reading)switchMode('edit');setView('library');setLibraryOpen(false);setPanel(null);setSelected(null);}}><BookOpen/><span>笔记库</span></button>
        <button className={reading&&view!=='library'?'active':''} aria-label={reading?'退出欣赏':'欣赏'} disabled={!book||busy} onClick={()=>switchMode(reading?'edit':'read')}><Eye/><span>{reading?'返回编辑':'欣赏'}</span></button>
        <button className={modal==='studio'?'active':''} aria-label="素材工作台" onClick={()=>{setMaterialStudioNotice('');setMaterialStudioTargetSource('');setModal('studio')}}><Sticker/><span>素材<br/>工作台</span></button>
        <button className={modal==='material-import'?'active':''} aria-label="导入新素材" onClick={()=>{setMaterialStudioTargetSource('');setModal('material-import')}}><ImagePlus/><span>导入<br/>新素材</span></button>
        <button className={panel==='write'?'active':''} aria-label="AI 创作" disabled={!ready||busy||!book} onClick={()=>{if(reading)switchMode('edit');setView('workbench');openWrite();}}><Sparkles/><span>AI 创作</span></button>
        <div className="rail-spacer"/>
        <button aria-label="备份与恢复" disabled={!ready||busy||uploading} onClick={()=>{finishEditing();setModal('backup');}}><Download/><span>备份</span></button>
        <button aria-label="设置" onClick={openSettings}><Settings/><span>设置</span></button>
        <small className="build-version" title="当前版本">v0.1.20</small>
      </aside>
      <main>
        {!reading && view!=='library' && !libraryOpen && <header className="compact-bar editor-header">
          <div className="notebook-title-tools">
            {books.length>1?<Pick label="切换笔记本" value={book?.id||''} onChange={id=>{const b=books.find(x=>x.id===id);if(b)chooseBook(b);}} items={orderedBooks.map(b=>({id:b.id,name:b.title}))}/>:<strong>{book?.title}</strong>}
            <button className="quiet" aria-label="笔记本设置" title="笔记本设置" disabled={!book} onClick={()=>startCover()}><Settings/></button>
            <button className="quiet" aria-label="全部跨页" title="全部跨页" disabled={!book||busy||uploading||opening||closing||!!flipping} onClick={()=>{finishEditing();setModal('index');}}><LayoutGrid/></button>
          </div>
          <fieldset className="book-tools creation-tools" aria-label="编辑工具">
            {opened && <>
              <div className="editor-page-navigation" role="group" aria-label="跨页导航与纸面大小">
                <button
                  className="quiet icon"
                  aria-label="上一跨页"
                  onClick={() => flip(-1)}
                  disabled={!!flipping}
                >
                  <ChevronLeft />
                </button>
                <span className="editor-page-counter" aria-live="polite">
                  {isFlyleaf
                    ? '扉页'
                    : spread
                      ? `${page + 1} / ${book?.spreads.length}`
                      : '第一张空白纸'}
                </span>
                <button
                  className="quiet icon"
                  aria-label="下一跨页"
                  onClick={() => flip(1)}
                  disabled={
                    !!flipping || (reading && page + 1 >= (book?.spreads.length || 0))
                  }
                >
                  <ChevronRight />
                </button>
                <label className="page-zoom editor-page-zoom">
                  <select aria-label="纸面大小" value={zoom} onChange={e=>setZoom(Number(e.target.value))}>
                    <option value={100}>适合窗口</option>
                    <option value={115}>115%</option>
                    <option value={130}>130%</option>
                    <option value={150}>150%</option>
                  </select>
                </label>
              </div>
              <span className="tool-divider"/>
            </>}
            <button className="quiet" aria-label="添加文字" title="文字" disabled={!spread||busy||!opened} onClick={addText}><Type/><span>文字</span></button>
            <button className="quiet" aria-label={uploading?'正在添加照片':'添加照片'} title="照片" disabled={!book||uploading||busy} onClick={()=>canvasPhotoInput.current?.click()}><ImagePlus/><span>{uploading?'添加中':'照片'}</span></button>
            <button className="quiet" aria-label="打开素材库" title="素材" disabled={!book} onClick={()=>{setLibraryOpen(true);setPanel(null);}}><Sticker/><span>素材</span></button>
            <button
              className={`quiet ${panel==='elements'?'active':''}`}
              aria-label="打开图层面板"
              title="图层"
              aria-pressed={panel==='elements'}
              disabled={!spread||busy||!opened}
              onClick={()=>setPanel(panel==='elements'?null:'elements')}
            >
              <Layers/><span>图层</span>
            </button>
            <button className="quiet" aria-label="打开旅行拼贴" title="旅行拼贴" disabled={!spread||busy||!opened} onClick={()=>{finishEditing();setCollageOpen(true);}}><Feather/><span>旅行拼贴</span></button>
            <ToolbarPopover label="添加" icon={<Plus/>} align="end" className="creation-add-popover" panelClassName="creation-add-menu" disabled={!spread||busy||!opened} closeOnAction>
              <div className="toolbar-popover-title">添加到纸面</div>
              <div className="creation-add-actions">
                <button type="button" className="quiet creation-add-action" aria-label="插入硫酸纸" onClick={addVellumSheet}><FileIcon/><span><strong>硫酸纸</strong><small>可调颜色与纸张浓度</small></span></button>
                <button type="button" className="quiet creation-add-action" aria-label="粘贴素材" onClick={()=>setClipboardPasteRequest(value=>value+1)}><ClipboardPaste/><span><strong>粘贴素材</strong><small>使用复制或剪切的内容</small></span></button>
              </div>
            </ToolbarPopover>
            <span className="tool-divider"/>
            <button className="quiet" aria-label="撤销调整" title="撤销" onClick={undo}><RotateCcw/><span>撤销</span></button><button className="quiet" aria-label="重做调整" title="重做" onClick={redo}><Redo2/><span>重做</span></button>
          </fieldset>
        </header>}
        {!reading&&!libraryOpen&&!photoMaskDraft&&view!=='library'&&book&&<div className={`fixed-element-tools ${piece?'has-selection':'is-empty'}`} data-editor-ui="true" style={{visibility:!opened||modal||designPreview||collageOpen?'hidden':undefined}}>
          {piece ? <>
          <div className="cluster-tools">
            <span>{multiSelection?`已选 ${activeUnitCount} 个对象`:cluster?'已选 1 个组合':editingGroup?'正在编辑组内元素':'空白拖框 · ⌘/Ctrl 或 Shift 追加'}</span>
            {cluster&&<><button className="quiet" disabled={selectionLocked} onClick={groupSelection}>编为一组</button><button className="quiet" disabled={selectionLocked||!piece.groupId} onClick={ungroupSelection}>解组</button><label>组合名称<input aria-label="组合名称" value={templateName} maxLength={40} onChange={e=>setTemplateName(e.target.value)}/></label><button className="quiet" onClick={saveCluster}>保存组合</button><button className="quiet" onClick={copyPiece}>复制组合</button><button className="quiet" disabled={selectionLocked} onClick={()=>setClipboardCutRequest(value=>value+1)}>剪切所选</button><button className="quiet" disabled={selectionLocked} onClick={()=>changeLayer('top')}>组合置顶</button><button className="quiet" disabled={selectionLocked} onClick={()=>changeLayer('bottom')}>组合置底</button><button className="quiet" disabled={selectionLocked} onClick={removePiece}>删除所选</button><button className="quiet" onClick={()=>enterGroup(piece)}>编辑组内元素</button></>}
            {editingGroup&&<button className="quiet" onClick={()=>{setEditingGroup(null);setInlineId(null);}}>返回整个组合</button>}
            <button className="quiet" aria-pressed={selectionLocked} onClick={()=>patchSelection({locked:!selectionLocked})}>{selectionLocked?<Unlock/>:<Lock/>}{selectionLocked?'解锁所选':'锁定所选'}</button>
            {cluster&&<button className="quiet" onClick={finishEditing}>完成</button>}
          </div>
          {!cluster&&<fieldset disabled={selectionLocked} className="single-piece-tools"><ElementControls piece={piece} height={piece.h??(selectionSize.h||15)} proportional={proportional} onProportional={()=>setProportional(!proportional)} onPatch={patch=>patchPiece(piece.id,patch)} onSize={changeSize} onLayer={changeLayer} onMaterialCut={startPageMaterialCut} onDelete={removePiece} onFinish={finishEditing} onReplace={()=>replaceInput.current?.click()} onReset={()=>patchPiece(piece.id,{h:undefined,stretch:false})}/>
          <CollageTools onMask={()=>void startPhotoMask()} piece={piece} onPatch={patch=>patchPiece(piece.id,patch)} onCaption={()=>addPhotoAttachment('caption')} onTape={()=>addPhotoAttachment('tape')} onCutout={()=>void cutout()} cropping={cropping} onCrop={()=>{setCropping(!cropping);if(piece.frame==='plain'||piece.frame==='cutout')patchPiece(piece.id,{h:piece.h||selectionSize.h,stretch:true});}} busy={busy} textRange={isCurrentTextSelection(textRange,piece)?textRange:null} onTextRange={setTextRange} onTextColor={colorText} onTextHighlight={highlightText}/></fieldset>}
          </> : <span className="selection-toolbar-placeholder">拖动纸面空白处可框选多个素材</span>}
        </div>}
        {book&&spread&&<CollageStudio open={collageOpen} onClose={()=>setCollageOpen(false)} feel={spread.paperFeel||book.paperFeel} color={paper.color} onFeel={paperFeel=>changeSpread(s=>({...s,paperFeel,pages:s.pages?Object.fromEntries(Object.entries(s.pages).map(([side,p])=>[side,{...p,paperFeel}])):undefined}))} onColor={paperColor=>changeSpread(s=>({...s,paperColor,pages:s.pages?Object.fromEntries(Object.entries(s.pages).map(([side,p])=>[side,{...p,paperColor}])):undefined}))} onCream={()=>{changeSpread(creamTravel);toast('已应用奶油纸旅行风格，保留原有内容和位置。');}} onCheck={()=>void checkLayout()} onTidy={()=>void checkLayout(true)} templates={book.collageTemplates||[]} onInsert={insertCluster} onCut={cutSelection} cutRequest={clipboardCutRequest} pasteRequest={clipboardPasteRequest} onPasteUnavailable={()=>toast('剪贴板里还没有手帐素材。')} suspended={!!modal}/>}
        {!reading&&layoutReport&&<div className="layout-report" data-editor-ui="true"><span>{layoutReport.length?`${layoutReport.length} 处排版提示`:'未发现遮挡或越界'}</span>{layoutReport.slice(0,8).map((issue,i)=><button className="quiet" key={i} onClick={()=>{setMultiIds(issue.ids);setSelected(issue.ids[0]);}}>{issue.message}</button>)}{layoutReport.length>0&&<small>空间不足时可增加跨页；组内重叠请双击调整。</small>}<button className="quiet" aria-label="关闭排版提示" onClick={()=>setLayoutReport(null)}><X/></button></div>}

        {ready&&saveStatusNeedsAttention&&<div className={`journal-save-bar ${saved.startsWith('保存冲突')?'has-conflict':''}`}>
          <span role="status" aria-live="polite">{saved}</span>
          {saved.startsWith('保存失败')&&<button className="quiet" onClick={()=>void flush()}>重试保存</button>}
          {saved.startsWith('保存冲突')&&<>
            <span>本机已有更新，本窗口的笔记本可保留为副本。</span>
            <button className="outline" disabled={recoveringSave} onClick={()=>void exportBackup()}>导出本窗口内容</button>
            <button className="outline" disabled={recoveringSave} onClick={()=>void resolveSaveConflict()}>{recoveringSave?'正在保留副本…':'保留副本并载入最新版本'}</button>
          </>}
        </div>}

        {view==='library'?(
          <section className="library-page">
            <header className="library-page-head">
              <div>
                <span className="eyebrow">拾光 / 我的笔记本</span>
                <h1>笔记库<span className="library-count">{books.length} 本</span></h1>
                
              </div>
<div className="library-head-actions"><button className="outline" onClick={()=>setModal('history')}>历史备份</button>              <button className="outline" onClick={() => {finishEditing();setModal('backup');}}>
                <FolderOpen />
                导入备份
              </button>              <button
                className="primary library-create"
                onClick={() => {
                  setEditingBookId(null);
                  setCoverTitle('拾光集');
                  setCoverType('linen-oat');
                  setCoverFormat('standard');
                  setCoverAsset('');
                  setCoverPaperStyle('blank');
                  setCoverPaperColor('#ffffff');
                  setCoverHeaderOn(true);
                  setCoverHeader(defaultHeader());
                  setCoverBg(null);
                  setCoverTemplates([]);
                  setCoverTab('cover');setCoverScope('book');setCoverDate('');
                  setModal('covers');
                }}
              >
                <Plus />
                <span>新建笔记本</span>
              </button></div>
            </header>
            <div className="library-shelf">
              {orderedBooks.map((b) => {
                const info = coverInfo(b.cover);
                return (
                  <div className="library-book" key={b.id}>
                    <div className="library-cover-space">
                    <button
                      className={`library-cover texture-${info.material.id} format-${bookFormat(b).id}`}
                      style={{ '--cover-base': info.colorway.color } as CSSProperties}
                      aria-label={`打开笔记本 ${b.title}`}
                      onClick={() => chooseBook(b)}
                    >
                      {!b.coverAsset && (info.material.id === "linen" ? <StationeryCover title={b.title} color={info.colorway.color}/> : <span className="cover-title-stamp">{b.title}<i>SHIGUANG JOURNAL</i></span>)}
                      {b.coverAsset ? (
                        <img src={resolveMaterial(b.coverAsset)} alt="" />
                      ) : null}
                    </button>
                    </div>
                    <button className="library-book-name" onClick={() => chooseBook(b)}>
                      {b.title}
                    </button>
                    <small>
                      {bookFormat(b).name} · {b.spreads.reduce((n, s) => n + s.days.length, 0)} 篇记录
                    </small>
                    <button
                      className="quiet library-book-settings"
                      aria-label={`设置笔记本 ${b.title}`}
                      onClick={() => { startCover(b); }}
                    >
                      <Settings />
                      设置
                    </button>
                    <button className="quiet library-book-delete" aria-label={`删除笔记本 ${b.title}`} onClick={()=>setDeletingBook(b)}>删除</button>
                  </div>
                );
              })}

            </div>
            {!books.length && (
              <p className="library-empty-hint">
                还没有笔记本。从右上的「新建笔记本」开始第一本拾光。
              </p>
            )}
          </section>
        ):libraryOpen?<MaterialLibrary assets={assets} onUpdated={setAssets} onInsert={insertLibraryAssets} onBack={()=>setLibraryOpen(false)} onOpenStudio={(targetSource)=>{setMaterialStudioNotice('');setMaterialStudioTargetSource(targetSource);setModal('studio')}} onSettings={openSettings} hasKey={settings.hasKey} vision={settings.vision}/>:<section className="workspace">
          {loadError ? (
            <div className="error-box">
              <h2>暂时读不到手帐</h2>
              <p>{loadError}</p>
              <button className="primary" onClick={() => location.reload()}>
                重新连接
              </button>
            </div>
          ) : (
            <div
              className={`editor-layout ${photoMaskDraft?'with-photo-mask':panel && !reading ? 'with-panel' : ''}`}
            >
              <div
                ref={workArea}
                className="work-area"
                data-fit-page={zoom === 100 ? 'true' : undefined}
                style={{'--page-zoom':zoom/100} as CSSProperties}
              >
                <span className="canvas-caption">
                  VOLUME {currentMonth.slice(-2)} ·{' '}
                  {monthName(currentMonth).toUpperCase()}
                </span>
                {reading && book ? (<ReadingDeck book={book} assets={assets} page={readingPage} onSelect={setReadingPage} onDelete={deleteOverviewSpread} actionsDisabled={busy||uploading}/>) : !book ? (
                  <div className="cover-stage">
                    <p className="microcopy">笔记库里还没有笔记本。</p>
                    <button className="primary" onClick={()=>setView('library')}>
                      <Plus />
                      去笔记库新建
                    </button>
                  </div>
                ) : (
                  <>
                    {(!opened || opening || closing) && (
                      <div className={`book-scene cover-stage notebook-${cover.material.id} ${opening || closing ? 'cover-transition-overlay' : ''}`} style={{'--spread-ratio':format.ratio,'--book-scale':format.scale} as CSSProperties}>
                        <div className={`rigid-cover-scene ${opening || closing ? 'is-turning' : ''}`} style={{'--closed-ratio':format.ratio/2} as CSSProperties}>
                          {<div className="rigid-underlay"><SpreadPreview book={book} spread={ensureFlyleaf(book).flyleaf!} assets={assets} flyleaf/></div>}
                          <button aria-label="打开手帐" disabled={opening || closing}
                            className={`book-cover rigid-cover ${opening ? 'cover-opening' : ''} ${closing ? 'cover-closing' : ''}`}
                            onClick={openBook}>
                            <span className={`rigid-face rigid-front texture-${cover.material.id}`} style={{'--cover-base':cover.colorway.color} as CSSProperties}>
                              {!book.coverAsset && (cover.material.id === "linen" ? <StationeryCover title={book.title} color={cover.colorway.color}/> : <span className="cover-title-stamp">{book.title}<i>SHIGUANG JOURNAL</i></span>)}
                              {book.coverAsset && <img className="cover-art" src={resolveMaterial(book.coverAsset)} alt="封面装饰"/>}
                            </span>
                            <span className={`rigid-face rigid-back texture-${cover.material.id}`} style={{'--cover-base':cover.colorway.color} as CSSProperties}><span className="cover-inside-edge"/><span className="cover-binding"/></span>
                            <span className="rigid-edge"/>
                          </button>
                        </div>
                        <div className="page-navigation cover-navigation"><span>{book.title || '拾光集'}</span><button className="quiet" onClick={openBook}>翻开<ChevronRight/></button></div>
                      </div>
                    )}
                    {(opened || opening || closing) && (
                      <div
                        className={`book-scene notebook-${cover.material.id}`}
                        style={
                          {
                            '--cover-base': cover.colorway.color,
                            '--spread-ratio': format.ratio,
                            '--book-scale': format.scale,
                          } as CSSProperties
                        }
                      >
                    <div
                      className={`open-book paper-${paper.style} ${isFlyleaf ? 'flyleaf-spread' : ''} ${selectionMarquee?'is-marquee-active':''}`}
                      style={
                        {
                          '--paper': paper.color,
                          '--ink': paperDark ? '#f5f5ed' : '#343b34',
                          '--ruling': paperDark ? '#ffffff35' : '#47556925',
                        } as CSSProperties
                      }
                      ref={canvas}
                      onPointerDown={canvasSelectionDown}
                      onPointerMove={canvasSelectionMove}
                      onPointerUp={finishCanvasSelection}
                      onPointerCancel={cancelCanvasSelection}
                    >
                      {isFlyleaf ? (
                        <>
                          <div
                            className={`cover-inside texture-${cover.material.id}`}
                            style={{ '--cover-base': cover.colorway.color } as CSSProperties}
                          >
                            <span className="cover-inside-edge" aria-hidden="true" />
                            <span className="cover-binding" aria-hidden="true" />
                          </div>
                          <div className="paper-page right-paper">
                            <div className="paper-ruling" />
                          </div>
                        </>
                      ) : (
                        <>
                          {book && spread && <NotebookPaper book={book} spread={spread} pageIndex={page}/>}
                        </>
                      )}
                      <div className="paper-grain" />
                      {decorative.filter(p=>!isPieceHidden(p)).map((p) => (
                        <div
                          key={p.id}
                          data-piece-id={p.id}
                          tabIndex={spread && !reading ? 0 : -1}
                          role={spread && !reading ? 'button' : undefined}
                          aria-label={
                            p.kind === 'doodle' && p.frame === 'vellum-sheet'
                              ? '编辑硫酸纸'
                              : p.kind === 'text'
                              ? `编辑${p.role === 'title' ? '标题' : '文字'}`
                              : `编辑${p.kind === 'photo' ? '照片' : '素材'}`
                          }
                          className={`piece piece-${p.kind} ${p.role || ''} ${activePieces.some(q=>q.id===p.id) ? 'selected' : ''} ${selectionPreviewIds.includes(p.id)?'selection-preview':''} ${pieceFrameClass(p)} ${p.stretch?'piece-stretched':''} ${pieceClasses(p)} ${cropping&&selected===p.id?'is-cropping':''}`}
                          style={{
                            ...pieceAppearance(p),
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            width: `${p.w}%`,
                            transform: `translate3d(var(--drag-x,0px),var(--drag-y,0px),0) rotate(${p.rotation}deg)`,
                            fontSize: `${(p.fontSize || 18) / 10}cqw`,

                            opacity: pieceDisplayOpacity(p),
                            color:p.color||(!isFlyleaf && book ? pageInk(book,spread,p.x>=50?'right':'left') : undefined),
                            height:p.h?`${p.h}%`:p.kind==='doodle'?'15%':undefined,
                            fontFamily:p.fontFamily==='serif'?'Georgia, Songti SC, serif':p.fontFamily==='sans'?'PingFang SC, sans-serif':undefined,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if(suppressSelectionClick.current&&e.detail>0)return;
                            if (spread && !reading) {
                              selectPiece(p,e.shiftKey||e.metaKey||e.ctrlKey);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !reading && !p.locked) {
                              selectPiece(p,e.shiftKey||e.metaKey||e.ctrlKey);
                              if(p.kind==='text'){setInlineId(p.id);setInlineText(p.text||'')}
                            }
                          }}
                          onDoubleClick={()=>{if(!suppressSelectionClick.current&&!reading&&!p.locked)enterGroup(p)}}
                          onPointerDown={(e) => pointerDown(e, p.id)}
                          onPointerMove={pointerMove}
                          onPointerUp={e=>{if(drag.current?.pointerId===e.pointerId)endPointerDrag();}}
                          onPointerCancel={e=>{if(drag.current?.pointerId===e.pointerId)cancelPointerDrag();}}
                          onLostPointerCapture={e=>{if(drag.current?.pointerId===e.pointerId)cancelPointerDrag();}}
                        >
                          {p.kind === 'text' ? (
                            inlineId===p.id&&!reading?<textarea className="inline-writing" aria-label="直接编辑纸面文字" rows={1} ref={el=>{if(el && document.activeElement!==el)el.focus()}} value={inlineText} maxLength={8000} onChange={e=>{setInlineText(e.target.value);setTextRange(null)}} onSelect={e=>{const t=e.currentTarget;if(t.selectionEnd>t.selectionStart)setTextRange({id:p.id,start:t.selectionStart,end:t.selectionEnd,text:t.value});}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){setInlineId(null)}else if((e.metaKey||e.ctrlKey)&&e.key==='Enter')e.currentTarget.blur()}} onBlur={()=>{if(inlineId===p.id){patchPiece(p.id,{text:inlineText});setInlineId(null)}}}/>:<div className="piece-text"><ColoredWriting piece={p}/></div>
                          ) : p.kind==='photo' ? <PhotoArtwork piece={p} alt="当天照片" maskPreview={maskActive&&p.id===photoMaskDraft!.pieceId?{shape:photoMaskDraft!.shape,photoRotation:photoMaskDraft!.photoRotation,ratio:p.w/(p.h||15)*(canvas.current?canvas.current.clientWidth/canvas.current.clientHeight:bookFormat(book).ratio)}:undefined}/> : p.material==='tape' ? <TapeArtwork piece={p}/> : p.kind==='doodle' ? (
                            <JournalDrawing piece={p}/>
                          ) : (
                            <img
                              draggable={false}
                              src={
                                p.kind === 'asset'
                                  ? resolveMaterial(p.src, p.assetId)
                                  : p.src
                              }
                              alt={assets.find((a) => a.id === p.assetId)?.name || '复古素材'}
                              style={{ objectPosition: `${p.crop ?? 50}% 50%`,transform:`scale(${p.flipX?-1:1},${p.flipY?-1:1})` }}
                            />
                          )}
                        </div>
                      ))}
                      {selectionMarquee&&<div className="canvas-selection-marquee" aria-hidden="true" style={{left:selectionMarquee.left,top:selectionMarquee.top,width:selectionMarquee.right-selectionMarquee.left,height:selectionMarquee.bottom-selectionMarquee.top}}/>}
                      {piece&&!isPieceHidden(piece)&&!reading&&!selectionLocked&&!cropping&&inlineId!==piece.id&&<div
                        data-selection-box
                        className={`selection-box ${multiSelection?'multi-move-box':''}`}
                        aria-label={multiSelection?'多选素材范围':'素材调整边框'}
                        title={multiSelection?'拖动任意已选素材或边框，可移动全部所选素材':undefined}
                        style={clusterBox?{left:clusterBox.x,top:clusterBox.y,width:clusterBox.w,height:clusterBox.h,transform:'translate3d(var(--drag-x,0px),var(--drag-y,0px),0)'}:{left:`${piece.x}%`,top:`${piece.y}%`,width:`${selectionSize.w||piece.w}%`,height:`${selectionSize.h||piece.h||15}%`,transform:`translate3d(var(--drag-x,0px),var(--drag-y,0px),0) rotate(${piece.rotation}deg)`}}
                        onPointerMove={pointerMove}
                        onPointerUp={e=>{if(drag.current?.pointerId===e.pointerId)endPointerDrag();}}
                        onPointerCancel={e=>{if(drag.current?.pointerId===e.pointerId)cancelPointerDrag();}}
                        onLostPointerCapture={e=>{if(drag.current?.pointerId===e.pointerId)cancelPointerDrag();}}
                      >
                        {multiSelection&&<><span className="selection-move-edge edge-top" onPointerDown={e=>pointerDown(e,piece.id,'move')}/><span className="selection-move-edge edge-right" onPointerDown={e=>pointerDown(e,piece.id,'move')}/><span className="selection-move-edge edge-bottom" onPointerDown={e=>pointerDown(e,piece.id,'move')}/><span className="selection-move-edge edge-left" onPointerDown={e=>pointerDown(e,piece.id,'move')}/></>}
                        {(multiSelection||cluster)&&<span className="selection-label">{multiSelection?`已选 ${activeUnitCount} 个对象`: '组合 · 等比缩放'}</span>}
                        {!multiSelection&&resizeHandles.map(([handle,label])=><button key={handle} className={`resize-handle handle-${handle}`} aria-label={label} title={`${label} · ${isCornerResizeHandle(handle)?'自动保持比例':'可单独调整比例'}`} onPointerDown={e=>pointerDown(e,piece.id,'resize-'+handle)}/>)}
                        {!multiSelection&&<button className="rotate-handle" aria-label="拖动旋转" title="围绕中心旋转 · Shift 按 15° 吸附" onPointerDown={e=>pointerDown(e,piece.id,'rotate')}><RefreshCw/></button>}
                      </div>}
                      {!spread && !reading && (
                        <div className="first-entry">
                          <span className="eyebrow">A PAGE OF YOUR OWN</span>
                          <h2>今天，有什么想留下？</h2>
                          <p>
                            一句话，一张照片。
                            <br />
                            剩下的，交给拾光。
                          </p>
                          <button
                            className="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              openWrite();
                            }}
                          >
                            <Plus />
                            写下第一篇
                          </button>
                        </div>
                      )}
                      <div className="book-gutter" />
                      <button
                        type="button"
                        className="page-corner corner-left"
                        aria-label={isFlyleaf ? '点击页角合上手帐' : '点击页角向前翻页'}
                        title={isFlyleaf ? '合上手帐' : '上一页'}
                        style={{ '--corner-paper': isFlyleaf ? `color-mix(in srgb, ${cover.colorway.color} 12%, #f4f1e9)` : paperSettings(book, spread, 'left').color } as CSSProperties}
                        disabled={busy || !!flipping}
                        onClick={() => flip(-1)}
                      />
                      <button
                        type="button"
                        className="page-corner corner-right"
                        aria-label="点击页角向后翻页"
                        title="下一页"
                        style={{ '--corner-paper': isFlyleaf ? paper.color : paperSettings(book, spread, 'right').color } as CSSProperties}
                        disabled={busy || !!flipping || (reading && page + 1 >= (book?.spreads.length || 0))}
                        onClick={() => flip(1)}
                      />
                      {flipping &&
                        activeTurn &&
                        book &&
                        sheetAt(book, activeTurn.target) && (
                          <PageTurn
                            book={book}
                            from={activeTurn.source}
                            to={sheetAt(book, activeTurn.target)!}
                            fromFlyleaf={activeTurn.sourceIndex === -1}
                            toFlyleaf={activeTurn.target === -1}
                            fromIndex={activeTurn.sourceIndex}
                            toIndex={activeTurn.target}
                            assets={assets}
                            direction={flipping}
                            progress={turnProgress}
                            settling={turnSettling}
                          />
                        )}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <span className="canvas-tag">
                  <Leaf
                    style={{ display: 'inline', width: 13, marginRight: 6 }}
                  />
                  自由跨页 · 翻到最后自动添页
                </span>
              </div>
              {photoMaskDraft&&maskActive&&!reading&&<PhotoMaskTools draft={photoMaskDraft} onShape={shape=>editMaskDraft({shape})} onPatch={patch=>patchPiece(photoMaskDraft.pieceId,patch)} onRotation={photoRotation=>editMaskDraft({photoRotation})} onSize={(axis,value)=>patchPiece(photoMaskDraft.pieceId,{[axis]:value,stretch:true})} onApply={()=>void applyPhotoMask()} onCancel={cancelPhotoMask}/>}
              {panel && !reading && (
                <aside className="side-panel">
                  <header>
                    <div>
                      <span className="eyebrow">
                        {panel === 'write'
                          ? 'AI STUDIO'
                          : 'LAYERS'}
                      </span>
                      <h2>
                        {panel === 'write'
                          ? 'AI 创作'
                          : '图层'}
                      </h2>
                    </div>
                    <button
                      className="quiet icon"
                      aria-label="收起面板"
                      onClick={() => setPanel(null)}
                    >
                      <PanelRightClose />
                    </button>
                  </header>
                  {panel === 'write' ? (
                    <div className="panel-scroll">
                      <p className="microcopy">
                        照片、文字和素材先放到页面上，
                        <br />
                        再交给拾光整理成手帐。
                      </p>
                      <button
                        className="primary full"
                        disabled={busy || !spread}
                        title={spread ? undefined : '先翻开手帐，在工作台上放好照片和文字'}
                        onClick={() => void generate(settings.hasKey, true, '')}
                      >
                        {busy ? <Loader2 className="spinning" /> : <Sparkles />}
                        {busy ? '正在整理这一页…' : '一键做成手帐'}
                      </button>
                      {!settings.hasKey && (
                        <button
                          className="text-link full"
                          onClick={openSettings}
                        >
                          首次使用，先连接你的 AI
                        </button>
                      )}
                      {spread && (
                        <div className="regenerate-box">
                          <h3>这一跨页，换个感觉</h3>
                          <label className="row"><input type="checkbox" checked={preserveLocks} onChange={e=>setPreserveLocks(e.target.checked)}/>保留已锁定元素的位置和样式</label>
                          <textarea
                            rows={2}
                            maxLength={1000}
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="例如：多一点留白，换成旧信件的感觉。"
                          />
                          <button
                            className="outline full"
                            disabled={busy}
                            onClick={() => void generate(settings.hasKey, true)}
                          >
                            <RefreshCw />
                            按指令整理并设计跨页
                          </button>
                          <p className="microcopy">
                            可要求润色、分段和逐段配贴纸；只要求排版时保留文字，所有修改均可撤销。
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="panel-scroll page-elements-panel">
                      <div className="page-elements-summary">
                        <span>{isFlyleaf?'扉页':'当前跨页'}</span>
                        <strong>{pageElementRows.length} 层</strong>
                      </div>
                      {pageElementRows.length ? (
                        <>
                          <div className="page-elements-list" role="list" aria-label="当前跨页图层">
                            {[...pageElementRows].reverse().map(({key,members,representative:p,groupNumber},index)=>{
                              const selectedIds=new Set(activePieces.map(q=>q.id));
                              const selectedCount=members.filter(member=>selectedIds.has(member.id)).length;
                              const isSelected=selectedCount===members.length;
                              const isPartial=selectedCount>0&&!isSelected;
                              const isLocked=members.every(member=>member.locked);
                              const hasLocked=members.some(member=>member.locked);
                              const isHidden=members.every(member=>isPieceHidden(member));
                              const hasHidden=members.some(member=>isPieceHidden(member));
                              const rowLabel=(item:Piece,itemIndex:number)=>{
                                const itemAsset=item.kind==='asset'?assets.find(a=>a.id===item.assetId):undefined;
                                const compactText=item.text?.replace(/\s+/g,' ').trim();
                                return item.kind==='doodle'&&item.frame==='vellum-sheet'
                                  ? '硫酸纸'
                                  : item.kind==='text'
                                  ? (compactText?compactText.slice(0,18):'空白文字')
                                  : item.kind==='photo'
                                    ? `照片 ${itemIndex+1}`
                                    : item.kind==='doodle'
                                      ? (item.material==='tape'?'胶带':'手绘素材')
                                      : itemAsset?.name||`素材 ${itemIndex+1}`;
                              };
                              const thumb=(item:Piece)=>item.kind==='text'?<Type/>:item.kind==='doodle'&&item.frame==='vellum-sheet'?<FileIcon/>:item.kind==='doodle'?<Feather/>:<img loading="lazy" src={item.kind==='asset'?resolveMaterial(item.src,item.assetId):item.src} alt=""/>;
                              if(members.length>1){
                                const groupLabel=pieceGroupName(p)||`组合${groupNumber}`;
                                return (
                                  <div className="page-element-group" key={key} role="group" aria-label={groupLabel}>
                                    <div style={{display:'flex',alignItems:'center',gap:4}}>
                                      <button
                                        type="button"
                                        style={{flex:1,minWidth:0,opacity:isHidden ? .55 : 1}}
                                        className={`page-element-row page-element-row-button page-element-group-row ${isSelected?'is-selected':''} ${isPartial?'is-partial':''} ${isLocked?'is-locked':''}`}
                                        aria-pressed={isSelected}
                                        aria-label={`${isSelected?'取消选择':'选择'} ${groupLabel}`}
                                        onClick={()=>toggleSidebarSelection(members)}
                                      >
                                        <span className={`page-element-check ${isSelected?'is-checked':''} ${isPartial?'is-partial':''}`} aria-hidden="true">{isSelected&&<Check/>}</span>
                                        <span className="page-element-main">
                                          <span className="page-element-thumb page-element-group-thumb" aria-hidden="true"><Layers/></span>
                                          <span className="page-element-copy"><strong>{groupLabel}</strong><small>{members.length} 个素材{hasHidden?' · 含隐藏':''}{hasLocked?' · 含锁定':''}</small></span>
                                        </span>
                                      </button>
                                      <LayerRowActions hidden={isHidden} locked={isLocked} onVisibility={()=>setLayerVisibility(members,!isHidden)} onLock={()=>setLayerLocked(members,!isLocked)} onRename={()=>renameLayer(members,true)} onUp={()=>moveLayer(members,'up')} onDown={()=>moveLayer(members,'down')}/>
                                    </div>
                                    <div className="page-element-children">
                                      {members.map((member,memberIndex)=>{
                                        const memberSelected=selectedIds.has(member.id),memberHidden=isPieceHidden(member),memberName=pieceLayerName(member)||rowLabel(member,memberIndex);
                                        return (
                                          <div key={member.id} style={{display:'flex',alignItems:'center',gap:4}}>
                                            <button
                                              type="button"
                                              style={{flex:1,minWidth:0,opacity:memberHidden ? .55 : 1}}
                                              className={`page-element-row page-element-row-button page-element-child-row ${memberSelected?'is-selected':''} ${member.locked?'is-locked':''}`}
                                              aria-pressed={memberSelected}
                                              aria-label={`${memberSelected?'取消选择':'选择'} ${groupLabel}中的${memberName}`}
                                              onClick={()=>toggleSidebarMember(member)}
                                            >
                                              <span className={`page-element-check ${memberSelected?'is-checked':''}`} aria-hidden="true">{memberSelected&&<Check/>}</span>
                                              <span className="page-element-main">
                                                <span className="page-element-thumb" aria-hidden="true">{thumb(member)}</span>
                                                <span className="page-element-copy"><strong>{memberName}</strong><small>{member.kind==='doodle'&&member.frame==='vellum-sheet'?'硫酸纸':member.kind==='text'?'文字':member.kind==='photo'?'照片':member.kind==='doodle'?'装饰':'素材'}{memberHidden?' · 已隐藏':''}{member.locked?' · 已锁定':''}</small></span>
                                              </span>
                                            </button>
                                            <LayerRowActions hidden={memberHidden} locked={member.locked} onVisibility={()=>setLayerVisibility([member],!memberHidden)} onLock={()=>setLayerLocked([member],!member.locked)} onRename={()=>renameLayer([member])}/>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              }
                              const label=pieceLayerName(p)||rowLabel(p,index);
                              return (
                                <div key={key} role="listitem" style={{display:'flex',alignItems:'center',gap:4}}>
                                  <button
                                    type="button"
                                    style={{flex:1,minWidth:0,opacity:isHidden ? .55 : 1}}
                                    aria-pressed={isSelected}
                                    aria-label={`${isSelected?'取消选择':'选择'} ${label}`}
                                    className={`page-element-row page-element-row-button ${isSelected?'is-selected':''} ${isLocked?'is-locked':''}`}
                                    onClick={()=>toggleSidebarSelection(members)}
                                  >
                                    <span className={`page-element-check ${isSelected?'is-checked':''}`} aria-hidden="true">{isSelected&&<Check/>}</span>
                                    <span className="page-element-main">
                                      <span className="page-element-thumb" aria-hidden="true">{thumb(p)}</span>
                                      <span className="page-element-copy"><strong>{label}</strong><small>{p.kind==='doodle'&&p.frame==='vellum-sheet'?'硫酸纸':p.kind==='text'?'文字':p.kind==='photo'?'照片':p.kind==='doodle'?'装饰':'素材'}{isHidden?' · 已隐藏':''}{isLocked?' · 已锁定':''}</small></span>
                                    </span>
                                  </button>
                                  <LayerRowActions hidden={isHidden} locked={isLocked} onVisibility={()=>setLayerVisibility(members,!isHidden)} onLock={()=>setLayerLocked(members,!isLocked)} onRename={()=>renameLayer(members)} onUp={()=>moveLayer(members,'up')} onDown={()=>moveLayer(members,'down')}/>
                                </div>
                              );
                            })}
                          </div>
                          <div className="page-elements-actions">
                            <span>已选择 {activeUnitCount} 个</span>
                            <button className="quiet" disabled={!activePieces.length} onClick={()=>setSelected(null)}>取消选择</button>
                          </div>
                        </>
                      ) : (
                        <div className="page-elements-empty">
                          <Layers/>
                          <strong>这一页还没有图层</strong>
                          <span>添加文字、照片或素材后，会显示在这里。</span>
                        </div>
                      )}
                    </div>
                  )}
                </aside>
              )}
            </div>
          )}
          <footer className="workspace-footer">
            <span>YOUR LIFE, IN LITTLE PIECES.</span>
            <span>
              {opened
                ? '拖动元素自由调整位置'
                : '一本属于你的，每月手帐。'}
            </span>
          </footer>
        </section>}
      </main>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      <input
        ref={replaceInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => void upload(e.target.files, true)}
      />
      <Dialog open={!!designPreview} onOpenChange={v=>!v&&setDesignPreview(null)}>
        <DialogContent className="journal-dialog design-preview-dialog">
          <DialogTitle>跨页设计预览</DialogTitle>
          <DialogDescription>{designPreview?.concept||'先看看整个跨页。满意后应用，原页在此之前保持不变。'}</DialogDescription>
          {designPreview&&<div className="design-preview-paper" style={{'--spread-ratio':bookFormat(designPreview.book).ratio,'--book-scale':bookFormat(designPreview.book).scale} as CSSProperties}><SpreadPreview book={designPreview.book} spread={designPreview.spread} pageIndex={designPreview.book.spreads.findIndex(s=>s.id===designPreview.spread.id)} assets={assets}/></div>}
          <div className="row"><button className="outline" onClick={()=>setDesignPreview(null)}>返回修改要求</button><button className="primary" onClick={applyDesignPreview}>应用这个设计</button></div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'paper'}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="journal-dialog">
          <DialogTitle>选择内页</DialogTitle>
          <DialogDescription>
            纸张样式和颜色由你决定，AI 重做时也会保留。
          </DialogDescription>
          <div className="field">
            <span>应用范围</span>
            <Pick
              label="内页应用范围"
              value={paperScope}
              onChange={v=>{setPaperScope(v);const current=paperSettings(book,v==='book'?undefined:v==='spread'?spread:pageSpread(spread,v==='right'?'right':'left'));setPaperStyle(current.style);setPaperColor(current.color);setPaperRulingSize(current.rulingSize);}}
              items={[
                { id: 'book', name: '整本手帐（所有正文页，含已有页面）' },
                ...(page >= 0 && spread ? [{ id: 'spread', name: '当前跨页' },{id:'left',name:'仅当前左页'},{id:'right',name:'仅当前右页'}] : []),
              ]}
            />
          </div>
          <div className="paper-options paper-options-four">
            {(
              [
                { id: 'blank', name: '空白' },
                { id: 'lines', name: '横线' },
                { id: 'grid', name: '方格' },
                { id: 'dots', name: '点阵' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                className={paperStyle === p.id ? 'chosen' : ''}
                onClick={() => setPaperStyle(p.id)}
              >
                <div
                  className={`paper-swatch paper-${p.id} ruling-${paperRulingSize}`}
                  style={
                    {
                      backgroundColor: paperColor,
                      '--ruling': swatchDark(paperColor) ? '#ffffff35' : '#47556945',
                    } as CSSProperties
                  }
                >
                  <div className="paper-ruling" />
                </div>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          {(paperStyle === 'lines' || paperStyle === 'grid') && (
            <div className="field ruling-size-field">
              <span>线格大小</span>
              <div className="ruling-size-options" role="group" aria-label="线格大小">
                {paperRulingSizes.map((size) => (
                  <button key={size.id} className={paperRulingSize === size.id ? 'chosen' : ''} aria-pressed={paperRulingSize === size.id} onClick={() => setPaperRulingSize(size.id)}>
                    {size.name}
                  </button>
                ))}
              </div>
              <small className="ruling-size-hint">小号更密，中号保持原来的间距，大号更疏。</small>
            </div>
          )}
          <div className="field">
            <span>纸张颜色</span>
            <div className="paper-colors">
              {[
                { c: '#ffffff', n: '纯白' },
                { c: '#f7f1e3', n: '米白' },
                { c: '#e3d3ae', n: '浅牛皮' },
                { c: '#2b2b28', n: '炭黑' },
              ].map(({ c, n }) => (
                <button
                  key={c}
                  aria-label={`选择颜色 ${n}`}
                  title={n}
                  aria-pressed={paperColor === c}
                  style={{ background: c }}
                  onClick={() => setPaperColor(c)}
                >
                  {paperColor === c ? <Check /> : null}
                </button>
              ))}
              <input
                type="color"
                aria-label="自定义纸张颜色"
                value={paperColor}
                onChange={(e) => setPaperColor(e.target.value)}
              />
            </div>
            {swatchDark(paperColor) && (
              <p className="microcopy">
                深色纸已自动换用浅色文字、页眉和线格，仍可自行调整。
              </p>
            )}
          </div>

          <button className="primary full" onClick={savePaper}>
            <Check />
            应用内页
          </button>
          <div className="field bg-field">
            <span>自定义内页背景</span>
            <input
              ref={bgInput}
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(e) => void uploadPaperBg(e.target.files)}
            />
            {bgForm ? (
              <div className="bg-editor">
                <div
                  className="bg-preview"
                  ref={bgPreview}
                  style={{ '--spread-ratio': format.ratio } as CSSProperties}
                  onPointerDown={bgPointerDown}
                  onPointerMove={bgPointerMove}
                  onPointerUp={() => (bgDrag.current = null)}
                  onPointerCancel={() => (bgDrag.current = null)}
                >
                  <img
                    src={bgForm.src}
                    alt="内页背景预览，可拖动调整位置"
                    draggable={false}
                    style={{ left: `${bgForm.x}%`, top: `${bgForm.y}%`, width: `${bgForm.scale}%` }}
                  />
                </div>
                <p className="microcopy">在预览里拖动调整位置，用滑杆调整缩放。</p>
                <div className="field">
                  <span>
                    缩放 <small>{Math.round(bgForm.scale)}%</small>
                  </span>
                  <Slider
                    aria-label="背景缩放"
                    value={[bgForm.scale]}
                    min={20}
                    max={300}
                    onValueChange={(v) =>
                      setBgForm((f) => (f ? { ...f, scale: Array.isArray(v) ? v[0] : v } : f))
                    }
                  />
                </div>
                <label className="field">
                  <span>模板名称</span>
                  <input
                    value={bgName}
                    maxLength={20}
                    onChange={(e) => setBgName(e.target.value)}
                  />
                </label>
                <div className="row">
                  <button className="outline" onClick={saveBgTemplate}>
                    存为模板
                  </button>
                  <button
                    className="outline"
                    onClick={() => applyBg('book', bgForm, '已设为整本默认内页背景。')}
                  >
                    整本应用
                  </button>
                  {page >= 0 && spread && (
                    <button
                      className="outline"
                      onClick={() => applyBg(paperScope==='left'||paperScope==='right'?paperScope:'spread', bgForm, '内页背景已应用。')}
                    >
                      {paperScope==='left'?'应用到左页':paperScope==='right'?'应用到右页':'应用到当前跨页'}
                    </button>
                  )}
                </div>
                <button className="quiet full" onClick={() => setBgForm(null)}>
                  重新上传
                </button>
              </div>
            ) : (
              <button className="outline full" onClick={() => bgInput.current?.click()}>
                <ImagePlus />
                上传 JPG / PNG 内页
              </button>
            )}
            {(book?.paperTemplates || []).length > 0 && (
              <div className="bg-templates">
                {book!.paperTemplates!.map((t) => (
                  <div className="bg-template" key={t.id}>
                    <img src={t.src} alt={t.name} />
                    <span>{t.name}</span>
                    <div className="row">
                      <button
                        className="quiet"
                        onClick={() => applyBg('book', t, `整本已套用「${t.name}」。`)}
                      >
                        整本
                      </button>
                      {page >= 0 && spread && (
                        <button
                          className="quiet"
                          onClick={() => applyBg(paperScope==='left'||paperScope==='right'?paperScope:'spread', t, `已套用「${t.name}」。`)}
                        >
                          本页
                        </button>
                      )}
                      <button
                        className="quiet"
                        aria-label={`删除模板 ${t.name}`}
                        onClick={() => removeBgTemplate(t.id)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="row">
              {(book?.paperBg || bg) && (
                <button
                  className="quiet"
                  onClick={() => applyBg('book', null, '已移除整本内页背景。')}
                >
                  移除整本背景
                </button>
              )}
              {page >= 0 && (spread?.paperBg !== undefined || spread?.pages?.left?.paperBg !== undefined || spread?.pages?.right?.paperBg !== undefined) && (
                <button
                  className="quiet"
                  onClick={() => applyBg(paperScope==='left'||paperScope==='right'?paperScope:'spread', null, '所选页面已恢复无背景。')}
                >
                  本页不用背景
                </button>
              )}
            </div>
            <p className="microcopy">背景铺在纸面下方，文字、照片和贴纸照常编辑。</p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'date'}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="journal-dialog">
          <DialogTitle>添加一个日期</DialogTitle>
          <DialogDescription>
            日期会作为独立文字放在纸上，可以移动、修改或删除。
          </DialogDescription>
          <label className="field">
            <span>日期</span>
            <input
              type="date"
              value={dateLabel}
              onChange={(e) => setDateLabel(e.target.value)}
            />
          </label>
          <div className="field">
            <span>显示方式</span>
            <Pick
              label="日期格式"
              value={dateFormat}
              onChange={setDateFormat}
              items={[
                { id: 'simple', name: '数字日期' },
                { id: 'weekday', name: '月日与星期' },
                { id: 'english', name: '英文日期' },
              ]}
            />
          </div>
          <div className="field">
            <span>放在哪一页</span>
            <Pick
              label="日期位置"
              value={dateSide}
              onChange={setDateSide}
              items={[
                { id: 'left', name: '左页' },
                { id: 'right', name: '右页' },
              ]}
            />
          </div>
          <button className="primary full" onClick={addDate}>
            <Plus />
            放入页面
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'header'}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="journal-dialog">
          <DialogTitle>页眉</DialogTitle>
          <DialogDescription>
            页眉固定在每张正文页顶部，日期取自本页记录日期并固定保存，不随今天变化。
          </DialogDescription>
          <div className="field">
            <span>应用范围</span>
            <Pick
              label="页眉应用范围"
              value={headerScope}
              onChange={v=>{setHeaderScope(v);const current=v==='book'?undefined:pageSpread(spread,v==='right'?'right':'left');setHeaderForm({...headerOf(book,current)});setHeaderDate(current?.date||current?.days[0]?.date||today());}}
              items={[
                { id: 'book', name: '整本手帐（所有正文页，含已有页面）' },
                ...(page >= 0 && spread ? [{ id: 'spread', name: '当前跨页' },{id:'left',name:'仅当前左页'},{id:'right',name:'仅当前右页'}] : []),
              ]}
            />
          </div>
          <div className="lock-card">
            <div>
              <PanelTop />
              <p>
                启用页眉
                <small>关闭后正文页不再显示页眉</small>
              </p>
            </div>
            <Switch
              aria-label="启用页眉"
              checked={headerForm.enabled}
              onCheckedChange={(v) => setHeaderForm((f) => ({ ...f, enabled: v }))}
            />
          </div>
          <label className="field">
            <span>页眉文字（可换行）</span>
            <textarea
              ref={headerText}
              rows={2}
              maxLength={120}
              value={headerForm.text}
              onChange={(e) => setHeaderForm((f) => ({ ...f, text: e.target.value }))}
            />
          </label>
          <div className="row">
            <button className="outline" onClick={() => insertToken('{日期}')}>
              插入日期
            </button>
            <button className="outline" onClick={() => insertToken('{星期}')}>
              插入星期
            </button>
            <button className="outline" onClick={() => insertToken('{页码}')}>
              插入页码
            </button>
          </div>
          <div className="field">
            <span>日期格式</span>
            <Pick
              label="日期格式"
              value={headerForm.dateFormat}
              onChange={(v) => setHeaderForm((f) => ({ ...f, dateFormat: v }))}
              items={headerDateFormats.map((f) => ({ id: f.id, name: f.name }))}
            />
          </div>
          {headerForm.dateFormat === 'custom' && (
            <label className="field">
              <span>自定义格式（yyyy 年 · MM 月 · dd 日，M d 不补零）</span>
              <input
                value={headerForm.customFormat || ''}
                maxLength={40}
                placeholder="yyyy年M月d日"
                onChange={(e) =>
                  setHeaderForm((f) => ({ ...f, customFormat: e.target.value }))
                }
              />
            </label>
          )}
          <div className="two-fields">
            <div className="field">
              <span>
                字号 <small>{headerForm.fontSize}</small>
              </span>
              <Slider
                aria-label="页眉字号"
                value={[headerForm.fontSize]}
                min={10}
                max={24}
                onValueChange={(v) =>
                  setHeaderForm((f) => ({ ...f, fontSize: Array.isArray(v) ? v[0] : v }))
                }
              />
            </div>
            <div className="field">
              <span>对齐</span>
              <Pick
                label="页眉对齐"
                value={headerForm.align}
                onChange={(v) =>
                  setHeaderForm((f) => ({ ...f, align: v as HeaderConfig['align'] }))
                }
                items={[
                  { id: 'left', name: '左对齐' },
                  { id: 'center', name: '居中' },
                  { id: 'right', name: '右对齐' },
                ]}
              />
            </div>
          </div>
          <div className="two-fields">
            <div className="field">
              <span>
                高度 <small>{headerForm.height}%</small>
              </span>
              <Slider
                aria-label="页眉高度"
                value={[headerForm.height]}
                min={4}
                max={16}
                onValueChange={(v) =>
                  setHeaderForm((f) => ({ ...f, height: Array.isArray(v) ? v[0] : v }))
                }
              />
            </div>
            <div className="field">
              <span>
                边距 <small>{headerForm.margin}%</small>
              </span>
              <Slider
                aria-label="页眉边距"
                value={[headerForm.margin]}
                min={0}
                max={16}
                onValueChange={(v) =>
                  setHeaderForm((f) => ({ ...f, margin: Array.isArray(v) ? v[0] : v }))
                }
              />
            </div>
          </div>
          <div className="field">
            <span>颜色</span>
            <div className="row">
              <input
                type="color"
                aria-label="页眉颜色"
                value={headerForm.color || (paperDark ? '#f5f5ed' : '#343b34')}
                onChange={(e) => setHeaderForm((f) => ({ ...f, color: e.target.value }))}
              />
              <button
                className="quiet"
                onClick={() => setHeaderForm((f) => ({ ...f, color: undefined }))}
              >
                随纸色自动
              </button>
            </div>
          </div>
          {page >= 0 && spread && (
            <label className="field">
              <span>本页记录日期（补写可修改）</span>
              <input
                type="date"
                value={headerDate}
                onChange={(e) => setHeaderDate(e.target.value)}
              />
            </label>
          )}

          <button className="primary full" onClick={saveHeader}>
            <Check />
            应用页眉
          </button>
        </DialogContent>
      </Dialog>
      <MaterialImporter
        open={modal === 'material-import'}
        onClose={() => setModal(null)}
        onReady={(message,targetSource) => {setMaterialStudioNotice(message);setMaterialStudioTargetSource(targetSource);setModal('studio')}}
        onImported={setAssets}
        onOpenLibrary={() => {setModal(null);if(reading)switchMode('edit');setView('workbench');setLibraryOpen(true);setPanel(null)}}
      />
      <MaterialStudio
        open={modal === 'studio'}
        onClose={() => setModal(null)}
        onImport={() => {setMaterialStudioTargetSource('');setModal('material-import')}}
        onImported={setAssets}
        onInsertPhotos={insertPhotoLibrary}
        photoProtectedSources={photoProtectedSources}
        notice={materialStudioNotice}
        targetSource={materialStudioTargetSource}
      />
      <PageMaterialCutter
        open={modal === 'material-cut'}
        target={pageMaterialCutTarget}
        onClose={()=>{setModal(null);setPageMaterialCutTarget(null)}}
        onBeforeSave={verifyPageMaterialCutDraft}
        onApply={applyPageMaterialCutOutputs}
      />
      <Dialog
        open={modal === 'settings'}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="journal-dialog app-settings-dialog">
          <header className="app-settings-heading">
            <DialogTitle>设置</DialogTitle>
            <DialogDescription>AI 创作、字体与本机照片管理</DialogDescription>
          </header>
          <section className="app-settings-ai" aria-labelledby="app-settings-ai-title">
            <div className="app-settings-section-heading">
              <h3 id="app-settings-ai-title">AI 创作</h3>
              <span>DeepSeek</span>
            </div>
            <label className="field">
              <span>模型</span>
              <select value={settingsForm.model||'deepseek-v4-flash-vision-exp'} onChange={(e)=>setSettingsForm((v)=>({...v,model:e.target.value,vision:e.target.value.includes('vision')}))}>
                <option value="deepseek-v4-flash-vision-exp">Vision（默认）</option>
                <option value="deepseek-v4-flash">V4 Flash（快速）</option>
                <option value="deepseek-v4-pro">V4 Pro（高质量）</option>
              </select>
            </label>
            <label className="field">
              <span>
                API 密钥
                <small>{settings.hasKey ? '已保存 · 留空不更改' : '尚未设置'}</small>
              </span>
              <input
                type="password"
                autoComplete="off"
                aria-describedby="app-settings-key-hint"
                value={settingsForm.apiKey || ''}
                onChange={(e) => setSettingsForm((v) => ({ ...v, apiKey: e.target.value }))}
                placeholder={settings.hasKey ? '粘贴新密钥以更换' : '粘贴 API 密钥'}
              />
            </label>
            <p className="app-settings-hint" id="app-settings-key-hint">密钥保存在本机，不会回显。{settingsForm.vision?'图片仅在你主动使用相关 AI 功能时发送。':'当前模型仅处理文字。'}</p>
            <details className="app-settings-advanced">
              <summary>高级选项<ChevronRight aria-hidden="true" /></summary>
              <div className="app-settings-advanced-content">
                <label className="field"><span>API 基础地址</span><input value={settingsForm.baseUrl} onChange={(e)=>setSettingsForm((v)=>({...v,baseUrl:e.target.value}))} placeholder="https://api.deepseek.com"/></label>
                <button className="outline" disabled={settingsSaving} onClick={() => void saveSettings(true)}>
                  {settingsSaving ? <Loader2 className="spinning" /> : <RefreshCw />}保存并测试连接
                </button>
                <p className="app-settings-hint">测试文字、JSON 与图片理解（Vision），可能产生少量调用费用。</p>
              </div>
            </details>
            <footer className="app-settings-actions">
              <button className="primary" disabled={settingsSaving} onClick={() => void saveSettings()}>
                {settingsSaving ? <Loader2 className="spinning" /> : <Check />}保存设置
              </button>
            </footer>
            {settingsFeedback && <output className="settings-feedback" aria-live="polite">{settingsFeedback}</output>}
          </section>
          <FontSettings />
          <button className="app-settings-trash" onClick={()=>{setModal(null);cancelPhotoMask();setPhotoTrashOpen(true);}}>
            <Trash2 aria-hidden="true" />
            <span><strong>照片回收站</strong><small>恢复或清理照片蒙版保留的原图</small></span>
            <ChevronRight aria-hidden="true" />
          </button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deletingBook} onOpenChange={value=>!value&&setDeletingBook(null)}>
        <DialogContent className="journal-dialog delete-notebook-dialog">
          <DialogTitle>删除「{deletingBook?.title}」？</DialogTitle>
          <DialogDescription>这本笔记的全部内页和记录将一并删除。请确认已保留需要的内容。</DialogDescription>
          <div className="delete-notebook-actions"><button className="outline" onClick={()=>setDeletingBook(null)}>取消</button><button className="delete-confirm" onClick={deleteNotebook}>删除笔记本</button></div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'covers'}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="journal-dialog cover-dialog">
          <header className="notebook-settings-heading">
            <span className="eyebrow">NOTEBOOK</span>
            <DialogTitle>{editingBookId ? '笔记本设置' : '新建笔记本'}</DialogTitle>
            <DialogDescription>
              先在预览中确认效果，保存后才会应用到笔记本。
            </DialogDescription>
          </header>

          <div className="notebook-settings-layout">
            <aside className="notebook-live-preview" aria-label="设置效果预览">
              <div className="preview-caption">
                <span>{coverTab === 'cover' ? '封面预览' : '当前页面预览'}</span>
                {coverTab !== 'cover' && canScopeNotebookSettings && (
                  <small>{coverScope === 'book' ? '整本样式' : coverScope === 'spread' ? '当前跨页' : coverScope === 'left' ? '仅左页' : '仅右页'}</small>
                )}
              </div>
              <div className="notebook-preview-stage">
                {coverTab === 'cover' ? (
                  <div
                    className={`settings-cover texture-${coverInfo(coverType).material.id} format-${coverFormat}`}
                    style={{ '--cover-base': coverInfo(coverType).colorway.color } as CSSProperties}
                  >
                    {coverAsset ? (
                      <img className="cover-art" src={resolveMaterial(coverAsset)} alt="封面装饰" />
                    ) : (
                      <span className="cover-title-stamp">
                        {coverTitle || '未命名笔记本'}
                        <i>SHIGUANG JOURNAL</i>
                      </span>
                    )}
                  </div>
                ) : notebookSettingsPreview ? (
                  <div
                    className="notebook-preview-spread"
                    style={{ '--spread-ratio': bookFormat(notebookSettingsPreview.book).ratio } as CSSProperties}
                  >
                    <SpreadPreview
                      book={notebookSettingsPreview.book}
                      spread={notebookSettingsPreview.spread}
                      pageIndex={page}
                      assets={assets}
                    />
                  </div>
                ) : (
                  <div
                    className={`settings-paper paper-${coverPaperStyle} ruling-${coverPaperRulingSize}`}
                    style={{
                      backgroundColor: coverPaperColor,
                      color: swatchDark(coverPaperColor) ? '#f5f5ed' : '#343b34',
                      '--ruling': swatchDark(coverPaperColor) ? '#ffffff30' : '#47556928',
                      aspectRatio: String((formats.find((item) => item.id === coverFormat)?.ratio || 1.43) / 2),
                    } as CSSProperties}
                  >
                    {coverBg && <div className="paper-bg-layer"><img alt="" src={coverBg.src} style={{ left: `${coverBg.x}%`, top: `${coverBg.y}%`, width: `${coverBg.scale}%` }} /></div>}
                    <div className="paper-ruling" />
                    {coverHeaderOn && (
                      <div
                        className="settings-header-preview"
                        style={{ textAlign: coverHeader.align, color: coverHeader.color, fontSize: `${coverHeader.fontSize / 5}cqw`, paddingInline: `${coverHeader.margin}%`, height: `${coverHeader.height}%` }}
                      >
                        {renderHeader(coverHeader, { date: coverDate || today(), page: 1 })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="notebook-preview-meta">
                <strong>{coverTitle || '未命名笔记本'}</strong>
                <span>
                  {coverTab === 'cover'
                    ? `${coverInfo(coverType).material.name} · ${coverInfo(coverType).colorway.name}`
                    : canScopeNotebookSettings
                      ? `第 ${page + 1} 跨页 · 保留当前页面内容`
                      : '新笔记本正文示例'}
                </span>
              </div>
            </aside>

            <div className="notebook-settings-controls">
              <Tabs value={coverTab} onValueChange={(value) => { setCoverTab(String(value)); requestAnimationFrame(() => { if (notebookSettingsScroll.current) notebookSettingsScroll.current.scrollTop = 0; }); }}>
                <TabsList aria-label="笔记本设置分类">
                  <TabsTrigger value="cover"><BookOpen />封面</TabsTrigger>
                  <TabsTrigger value="paper"><Layers />内页</TabsTrigger>
                  <TabsTrigger value="header"><PanelTop />页眉</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="notebook-settings-scroll" ref={notebookSettingsScroll}>
                {coverTab !== 'cover' && canScopeNotebookSettings && (
                  <section className="notebook-scope-card" aria-labelledby="notebook-scope-title">
                    <div className="settings-section-heading">
                      <div>
                        <strong id="notebook-scope-title">应用到</strong>
                        <small>选择本次内页和页眉设置影响的页面</small>
                      </div>
                      <span>{coverScope === 'book' ? '全部正文页' : coverScope === 'spread' ? '当前两页' : coverScope === 'left' ? '当前左页' : '当前右页'}</span>
                    </div>
                    <div className="notebook-scope-options" role="radiogroup" aria-label="设置应用范围">
                      {notebookScopeOptions.map((option) => (
                        <button
                          key={option.id}
                          role="radio"
                          aria-checked={coverScope === option.id}
                          className={coverScope === option.id ? 'chosen' : ''}
                          onClick={() => changeCoverScope(option.id)}
                        >
                          {coverScope === option.id && <Check />}
                          {option.name}
                        </button>
                      ))}
                    </div>
                    {coverScope === 'book' && (
                      <p className="notebook-scope-warning">
                        保存后，本次修改的内页或页眉设置将统一全部正文页，并替换对应的单页设置；页面内容和素材位置不会改变。
                      </p>
                    )}
                  </section>
                )}

                {coverTab === 'cover' && (
                  <>
                    <section className="notebook-settings-section">
                      <div className="settings-section-heading">
                        <div><strong>基本信息</strong><small>名称与笔记本的页面比例</small></div>
                      </div>
                      <label className="field">
                        <span>笔记本名称</span>
                        <input value={coverTitle} maxLength={40} onChange={(event) => setCoverTitle(event.target.value)} />
                      </label>
                      <div className="field">
                        <span>开本规格</span>
                        <div className="format-options format-options-two">
                          {formats.map((item) => (
                            <button key={item.id} className={`format-option ${coverFormat === item.id ? 'chosen' : ''}`} onClick={() => setCoverFormat(item.id)}>
                              <span className="format-mini" style={{ width: `${Math.round(item.ratio * 40)}px`, height: '40px' }} />
                              <span>{item.name}</span>
                              <small>{item.desc}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>

                    <section className="notebook-settings-section">
                      <div className="settings-section-heading">
                        <div><strong>封面质感</strong><small>先选材质，再挑选喜欢的颜色</small></div>
                      </div>
                      <div className="field">
                        <span>材质</span>
                        <div className="material-tabs">
                          {coverMaterials.map((material) => (
                            <button key={material.id} className={coverInfo(coverType).material.id === material.id ? 'active' : ''} onClick={() => setCoverType(material.colorways[0].id)}>
                              {material.name}
                            </button>
                          ))}
                        </div>
                        <div className="colorway-grid">
                          {coverInfo(coverType).material.colorways.map((colorway) => (
                            <button key={colorway.id} className={`colorway ${coverType === colorway.id ? 'chosen' : ''}`} onClick={() => setCoverType(colorway.id)}>
                              <span className={`colorway-cover texture-${coverInfo(coverType).material.id} format-${coverFormat}`} style={{ '--cover-base': colorway.color } as CSSProperties} />
                              <span>{colorway.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  </>
                )}

                {coverTab === 'paper' && (
                  <>
                    <section className="notebook-settings-section">
                      <div className="settings-section-heading">
                        <div><strong>纸张样式</strong><small>选择线格和纸张底色</small></div>
                      </div>
                      <div className="field">
                        <div className="paper-options paper-options-four">
                          {([
                            { id: 'blank', name: '空白' },
                            { id: 'lines', name: '横线' },
                            { id: 'grid', name: '方格' },
                            { id: 'dots', name: '点阵' },
                          ] as const).map((option) => (
                            <button key={option.id} className={coverPaperStyle === option.id ? 'chosen' : ''} onClick={() => setCoverPaperStyle(option.id)}>
                              <div className={`paper-swatch paper-${option.id} ruling-${coverPaperRulingSize}`} style={{ backgroundColor: coverPaperColor, '--ruling': swatchDark(coverPaperColor) ? '#ffffff35' : '#47556945' } as CSSProperties}>
                                <div className="paper-ruling" />
                              </div>
                              <span>{option.name}</span>
                            </button>
                          ))}
                        </div>
                        {(coverPaperStyle === 'lines' || coverPaperStyle === 'grid') && (
                          <div className="ruling-size-field">
                            <span>线格大小</span>
                            <div className="ruling-size-options" role="group" aria-label="线格大小">
                              {paperRulingSizes.map((size) => (
                                <button key={size.id} className={coverPaperRulingSize === size.id ? 'chosen' : ''} aria-pressed={coverPaperRulingSize === size.id} onClick={() => setCoverPaperRulingSize(size.id)}>
                                  {size.name}
                                </button>
                              ))}
                            </div>
                            <small className="ruling-size-hint">小号更密，中号保持原来的间距，大号更疏。</small>
                          </div>
                        )}
                        <div className="paper-colors cover-paper-colors">
                          {[
                            { c: '#ffffff', n: '纯白' },
                            { c: '#f7f1e3', n: '米白' },
                            { c: '#e3d3ae', n: '浅牛皮' },
                            { c: '#2b2b28', n: '炭黑' },
                          ].map(({ c, n }) => (
                            <button key={c} aria-label={`选择颜色 ${n}`} title={n} aria-pressed={coverPaperColor === c} style={{ background: c }} onClick={() => setCoverPaperColor(c)}>
                              {coverPaperColor === c ? <Check /> : null}
                            </button>
                          ))}
                          <input type="color" aria-label="自定义纸张颜色" value={coverPaperColor} onChange={(event) => setCoverPaperColor(event.target.value)} />
                          <span className="paper-color-label">自定义颜色</span>
                        </div>
                      </div>
                    </section>

                    <details className="notebook-settings-advanced" open={paperAdvancedOpen} onToggle={(event) => setPaperAdvancedOpen(event.currentTarget.open)}>
                      <summary>
                        <span className="advanced-icon"><ImagePlus /></span>
                        <span><strong>自定义内页背景</strong><small>上传图片、调整位置或使用已保存模板</small></span>
                        <ChevronRight className="advanced-chevron" />
                      </summary>
                      <div className="advanced-content">
                        <input hidden type="file" ref={coverBgInput} accept="image/jpeg,image/png" onChange={(event) => void uploadCoverBackground(event.target.files?.[0])} />
                        <button className="outline full" disabled={coverUploadBusy} onClick={() => coverBgInput.current?.click()}><ImagePlus />{coverUploadBusy ? '正在导入…' : '上传 JPG / PNG 内页'}</button>
                        {coverBg && (
                          <>
                            <div className="bg-preview" style={{ '--spread-ratio': coverFormat === 'tn-regular' ? 1.05 : 1.43 } as CSSProperties}
                              onPointerDown={(event) => { bgDrag.current = { x: event.clientX, y: event.clientY, bx: coverBg.x, by: coverBg.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
                              onPointerMove={(event) => { const drag = bgDrag.current; if (!drag) return; const rect = event.currentTarget.getBoundingClientRect(); setCoverBg((value) => value ? { ...value, x: Math.max(-200, Math.min(100, drag.bx + (event.clientX - drag.x) / rect.width * 100)), y: Math.max(-200, Math.min(100, drag.by + (event.clientY - drag.y) / rect.height * 100)) } : value); }}
                              onPointerUp={() => { bgDrag.current = null; }} onPointerCancel={() => { bgDrag.current = null; }}>
                              <img src={coverBg.src} alt="拖动调整内页背景位置" draggable={false} style={{ left: `${coverBg.x}%`, top: `${coverBg.y}%`, width: `${coverBg.scale}%` }} />
                            </div>
                            <span className="advanced-value">拖动调整位置 · 缩放 {Math.round(coverBg.scale)}%</span>
                            <Slider aria-label="内页背景缩放" value={[coverBg.scale]} min={20} max={300} onValueChange={(value) => setCoverBg((current) => current ? { ...current, scale: Array.isArray(value) ? value[0] : value } : current)} />
                            <label className="field"><span>模板名称</span><input value={coverTemplateName} maxLength={20} onChange={(event) => setCoverTemplateName(event.target.value)} /></label>
                            <div className="row"><button className="outline" onClick={() => { setCoverTemplates((templates) => [...(templates || []), { ...coverBg, id: uid(), name: coverTemplateName.trim() || '我的内页' }]); toast('模板将在保存笔记本时一并保存。'); }}>存为模板</button><button className="quiet" onClick={() => setCoverBg(null)}>移除背景</button></div>
                          </>
                        )}
                        {!!coverTemplates?.length && <div className="settings-template-list">{coverTemplates.map((template) => <button key={template.id} className="outline" onClick={() => setCoverBg({ src: template.src, x: template.x, y: template.y, scale: template.scale })}><img src={template.src} alt="" />{template.name}</button>)}</div>}
                      </div>
                    </details>
                  </>
                )}

                {coverTab === 'header' && (
                  <>
                    {canScopeNotebookSettings && (
                      <section className="notebook-settings-section notebook-date-section">
                        <div className="settings-section-heading">
                          <div><strong>页面日期</strong><small>用于页眉中的日期与星期变量，只修改当前所选页面</small></div>
                        </div>
                        <label className="field">
                          <span>{coverScope === 'left' ? '左页记录日期' : coverScope === 'right' ? '右页记录日期' : '当前跨页记录日期'}</span>
                          <input type="date" value={coverDate} onChange={(event) => setCoverDate(event.target.value)} />
                        </label>
                      </section>
                    )}

                    <section className="notebook-settings-section">
                      <div className="settings-section-heading">
                        <div><strong>页眉内容</strong><small>在每张正文页顶部显示固定信息</small></div>
                      </div>
                      <div className="lock-card notebook-header-switch">
                        <div><PanelTop /><p>启用正文页眉<small>{coverHeaderOn ? '当前会显示页眉内容' : '关闭后不显示页眉，已有正文不受影响'}</small></p></div>
                        <Switch aria-label="启用正文页眉" checked={coverHeaderOn} onCheckedChange={setCoverHeaderOn} />
                      </div>
                      {coverHeaderOn && (
                        <>
                          <label className="field">
                            <span>页眉文字（可换行）</span>
                            <textarea ref={coverHeaderText} rows={3} maxLength={120} value={coverHeader.text} onChange={(event) => setCoverHeader((value) => ({ ...value, text: event.target.value }))} />
                          </label>
                          <div className="notebook-token-row" aria-label="插入页眉变量">
                            <button className="outline" onClick={() => insertCoverToken('{日期}')}>＋ 日期</button>
                            <button className="outline" onClick={() => insertCoverToken('{星期}')}>＋ 星期</button>
                            <button className="outline" onClick={() => insertCoverToken('{页码}')}>＋ 页码</button>
                          </div>
                        </>
                      )}
                    </section>

                    {coverHeaderOn && (
                      <details className="notebook-settings-advanced" key={`header-advanced-${coverScope}`}>
                        <summary>
                          <span className="advanced-icon"><Settings /></span>
                          <span><strong>页眉高级样式</strong><small>日期格式、字号、对齐、尺寸与颜色</small></span>
                          <ChevronRight className="advanced-chevron" />
                        </summary>
                        <div className="advanced-content">
                          <div className="field">
                            <span>日期格式</span>
                            <Pick label="日期格式" value={coverHeader.dateFormat} onChange={(value) => setCoverHeader((current) => ({ ...current, dateFormat: value }))} items={headerDateFormats.map((item) => ({ id: item.id, name: item.name }))} />
                          </div>
                          {coverHeader.dateFormat === 'custom' && (
                            <label className="field"><span>自定义格式（M、d 不补零）</span><input value={coverHeader.customFormat || ''} maxLength={40} placeholder="yyyy年M月d日" onChange={(event) => setCoverHeader((current) => ({ ...current, customFormat: event.target.value }))} /></label>
                          )}
                          <div className="two-fields">
                            <div className="field"><span>字号 <small>{coverHeader.fontSize}</small></span><Slider aria-label="页眉字号" value={[coverHeader.fontSize]} min={10} max={24} onValueChange={(value) => setCoverHeader((current) => ({ ...current, fontSize: Array.isArray(value) ? value[0] : value }))} /></div>
                            <div className="field"><span>对齐</span><Pick label="页眉对齐" value={coverHeader.align} onChange={(value) => setCoverHeader((current) => ({ ...current, align: value as HeaderConfig['align'] }))} items={[{ id: 'left', name: '左对齐' }, { id: 'center', name: '居中' }, { id: 'right', name: '右对齐' }]} /></div>
                          </div>
                          <div className="two-fields">
                            <div className="field"><span>高度 <small>{coverHeader.height}%</small></span><Slider aria-label="页眉高度" value={[coverHeader.height]} min={4} max={16} onValueChange={(value) => setCoverHeader((current) => ({ ...current, height: Array.isArray(value) ? value[0] : value }))} /></div>
                            <div className="field"><span>边距 <small>{coverHeader.margin}%</small></span><Slider aria-label="页眉边距" value={[coverHeader.margin]} min={0} max={16} onValueChange={(value) => setCoverHeader((current) => ({ ...current, margin: Array.isArray(value) ? value[0] : value }))} /></div>
                          </div>
                          <div className="field">
                            <span>颜色</span>
                            <div className="row"><input type="color" aria-label="页眉颜色" value={coverHeader.color || (swatchDark(coverPaperColor) ? '#f5f5ed' : '#343b34')} onChange={(event) => setCoverHeader((current) => ({ ...current, color: event.target.value }))} /><button className="quiet" onClick={() => setCoverHeader((current) => ({ ...current, color: undefined }))}>随纸色自动</button></div>
                          </div>
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <footer className="notebook-settings-footer">
            <span><strong>{editingBookId ? '尚未保存' : '新笔记本'}</strong>{editingBookId ? notebookScopeSummary : '封面、内页与页眉将作为整本默认设置'}</span>
            <button className="outline" onClick={() => setModal(null)}>取消</button>
            <button className="primary" disabled={coverUploadBusy} onClick={saveCover}><Check />{editingBookId ? '保存设置' : '创建笔记本'}</button>
          </footer>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'index'}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="journal-dialog page-index-dialog">
          <DialogTitle>全部跨页</DialogTitle>
          <DialogDescription>
            {book?.title || '当前笔记本'} · 点击预览跳转，或选择需要导出的页面。
          </DialogDescription>
          {book && <NotebookPageOverview key={book.id} book={book} assets={assets}
            currentPage={opened?page:null} showCover
            disabled={busy||uploading||opening||closing||!!flipping}
            onDelete={deleteOverviewSpread}
            onSelect={index=>{finishEditing();if(index===null)setOpened(false);else{setPage(index);setOpened(true);}setModal(null);}}
          />}
        </DialogContent>
      </Dialog>
      <PhotoTrash open={photoTrashOpen} onClose={()=>setPhotoTrashOpen(false)} onPrepare={preparePhotoSave} onRestore={restoreTrashPhoto}/>
      <FullBackup open={modal==='backup'} onClose={()=>setModal(null)} onPrepare={prepareFullBackup} onRestored={receiveFullBackup}/>
      <JournalHistory open={modal==='history'} onClose={()=>setModal(null)} onRestore={restoreNotebookCopies}/>
      {notice && (
        <output className="toast">
          <Leaf />
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice('')}>
            <X />
          </button>
        </output>
      )}
    </div>
  );
}
