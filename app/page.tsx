'use client';
import StationeryCover from '@/components/stationery-cover';
import CollageTools from '@/components/collage-tools';
import CollageStudio from '@/components/collage-studio';
import {pieceAppearance,pieceClasses,PhotoArtwork,TapeArtwork,ColoredWriting} from '@/components/piece-appearance';
import {creamTravel,unionBoxes,transformCluster,cloneCluster,instantiateTemplate} from '@/lib/collage';
import {layoutIssues,tidyLayout} from '@/lib/layout-safety.mjs';
import type {CollageTemplate} from '@/lib/journal';
import { restorePosition, restoreHistoryPosition, type WorkspacePosition } from '@/lib/workspace-view';
import { JournalApiError, saveJournalSnapshot } from '@/lib/journal-save';
import JournalHistory from '@/components/journal-history';
import NotebookImageExport from '@/components/notebook-image-export';
import NotebookPaper from '@/components/notebook-paper';
import { pageSpread, patchPage, pageInk, reserveHeaderSpace } from '@/lib/journal';
import { notebookUploads, remapNotebookUploads, copyNotebooks } from '@/lib/journal-backup';
import JournalDrawing from '@/components/journal-drawing';
import ElementControls from '@/components/element-controls';
import {resizeBox,resizeHandles,normalizeAngle,reorderPiece,type Box} from '@/lib/piece-transform';
import {addBlankSpread} from '@/lib/journal';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye } from 'lucide-react';
import ReadingDeck from '@/components/reading-deck';
import ReadingJpgImage from '@/components/reading-jpg-image';
import PageTurn, {SpreadPreview} from '@/components/page-turn';
import type { CSSProperties } from 'react';
import { paperSettings, applyPaper, type PaperStyle } from '@/lib/journal';
import MaterialStudio from '@/components/material-studio';
import MaterialImporter from '@/components/material-importer';
import MaterialLibrary from '@/components/material-library';
import LayerRowActions from '@/components/layer-row-actions';
import {isPieceHidden,pieceGroupName,pieceLayerName,reorderLayerBlock,withLayerMeta} from '@/lib/layer-meta';
import {buildSnapTargets,snapMoveBox,type SnapGuides} from '@/lib/snap-guides';
/* oxlint-disable next/no-img-element -- Local editable images intentionally bypass remote image optimization. */
/* oxlint-disable jsx-a11y/no-static-element-interactions -- Draggable canvas objects expose keyboard selection and coordinate controls. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Layers,
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
  Image as ImageIcon,
  ArrowUpToLine,
  ArrowDownToLine,
  FolderOpen,
  RefreshCw,
  PanelTop,
  List,
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
  pieceKey,
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
  const [imageExportOpen,setImageExportOpen]=useState(false);
  const [multiIds,setMultiIds]=useState<string[]>([]);
  const [editingGroup,setEditingGroup]=useState<string|null>(null);
  const [collageOpen,setCollageOpen]=useState(false);
  const [cropping,setCropping]=useState(false);
  const [layoutReport,setLayoutReport]=useState<{message:string;ids:string[];type:string}[]|null>(null);
  const [textRange,setTextRange]=useState<{id:string;start:number;end:number;text:string}|null>(null);
  const [templateName,setTemplateName]=useState('我的照片拼贴');
  const [clusterBox,setClusterBox]=useState<Box|undefined>();
  const selectTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pendingSelection=useRef<Piece|null>(null);
  useEffect(()=>()=>{if(selectTimer.current)clearTimeout(selectTimer.current);},[]);
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
  const [panel, setPanel] = useState<'write' | 'edit' | 'elements' | null>(null),
    [selected, _setSelected] = useState<string | null>(null),
    [modal, setModal] = useState<
      'settings' | 'covers' | 'index' | 'material-import' | 'studio' | 'paper' | 'date' | 'header' | 'history' | null
    >(null);
  const [materialStudioNotice,setMaterialStudioNotice]=useState('');
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
    [paperScope, setPaperScope] = useState('book');
  const [bgForm, setBgForm] = useState<PaperBg | null>(null),
    [bgName, setBgName] = useState('我的内页');
  const [headerForm, setHeaderForm] = useState<HeaderConfig>(defaultHeader()),
    [headerScope, setHeaderScope] = useState('book'),
    [headerDate, setHeaderDate] = useState(today());
  const [dateLabel, setDateLabel] = useState(today()),
    [dateFormat, setDateFormat] = useState('simple'),
    [dateSide, setDateSide] = useState('left');
  const [turnTarget, setTurnTarget] = useState(0),
    [turnProgress, setTurnProgress] = useState(0),
    [turnSettling, setTurnSettling] = useState(false);
  const turnRef = useRef<{
      direction: number;
      target: number;
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
  const [snapGuides,setSnapGuides]=useState<SnapGuides>({});
  const workArea=useRef<HTMLDivElement>(null);
  const [preserveLocks, setPreserveLocks] = useState(true);
  const [designPreview,setDesignPreview]=useState<{book:Book;spread:Spread;before:string;concept?:string}|null>(null);
  const [readingPage,setReadingPage]=useState(0);
  const editingPosition=useRef<WorkspacePosition|null>(null);
  const scrollRestore=useRef<{scrollTop:number;scrollLeft:number}|null>(null);
  function switchMode(value: unknown) {
    if(value==='read' && book){
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
  const [recoveringSave, setRecoveringSave] = useState(false);
  const saveBlocked = useRef(false);
  const historyGroup = useRef<string | null>(null);
  const bookAnimation = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if(bookAnimation.current)clearTimeout(bookAnimation.current); }, []);
  const [editingBookId,setEditingBookId]=useState<string|null>(null),
    [coverTitle, setCoverTitle] = useState('拾光集'),
    [coverType, setCoverType] = useState('linen-oat'),
    [coverFormat, setCoverFormat] = useState<Book['format']>('standard'),
    [coverAsset, setCoverAsset] = useState(''),
    [coverPaperStyle, setCoverPaperStyle] = useState<PaperStyle>('blank'),
    [coverPaperColor, setCoverPaperColor] = useState('#ffffff'),
    [coverHeaderOn, setCoverHeaderOn] = useState(true);
  const [coverTab, setCoverTab] = useState('cover');
  const [coverScope,setCoverScope]=useState('book');
  const [coverDate,setCoverDate]=useState('');
  const [coverHeader, setCoverHeader] = useState<HeaderConfig>(defaultHeader);
  const [coverBg, setCoverBg] = useState<PaperBg | null>(null);
  const [coverTemplates, setCoverTemplates] = useState<Book['paperTemplates']>([]);
  const coverBgInput = useRef<HTMLInputElement>(null);
  const coverHeaderText = useRef<HTMLTextAreaElement>(null);
  const [coverUploadBusy, setCoverUploadBusy] = useState(false);
  const [coverTemplateName, setCoverTemplateName] = useState('我的内页');
  const canvas = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    canvasPhotoInput=useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
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
      id:string; x:number; y:number; mode:string; box:Box;
      canvasW:number; canvasH:number; cx:number; cy:number;
      angle:number; started:boolean; members:Piece[]; boxes:Box[]; crop?:{x:number;y:number}; snap?:ReturnType<typeof buildSnapTargets>;
    } | null>(null);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);
  const book = books.find((b) => b.id === bookId) || books[0],
    spread = book ? (page === -1 ? book.flyleaf : book.spreads[page]) : undefined,
    piece = spread?.elements.find((e) => e.id === selected);
  const activePieces=spread?.elements.filter(p=>multiIds.length?multiIds.includes(p.id):p.id===selected||!!piece?.groupId&&piece.groupId!==editingGroup&&p.groupId===piece.groupId)||[];
  const activeUnitCount=new Set(activePieces.map(p=>p.groupId?`group:${p.groupId}`:`piece:${p.id}`)).size;
  const multiSelection=activeUnitCount>1;
  const cluster=activePieces.length>1;
  const selectionLocked=activePieces.some(p=>p.locked);
  function setSelected(value:string|null){
    if(value!==selected)historyGroup.current=null;
    if(value!==selected)setCropping(false);
    if(value===null){if(selectTimer.current)clearTimeout(selectTimer.current);pendingSelection.current=null;setMultiIds([]);setEditingGroup(null);setLayoutReport(null);}
    _setSelected(value);
  }
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
    historyGroup.current=null;
    history.current.push(structuredClone(booksRef.current));
    if (history.current.length > 30) history.current.shift();
    future.current = [];
  };
  const change = (fn: (all: Book[]) => Book[], withHistory = true) => {
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
  const patchPiece = (id: string, patch: Partial<Piece>, withHistory = true) =>
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
  const patchContinuous = (id: string, patch: Partial<Piece>) => {
    const key=`${book?.id}/${spread?.id}/${id}/${Object.keys(patch).sort().join(',')}`;
    patchPiece(id,patch,historyGroup.current!==key);
    historyGroup.current=key;
  };
  const finishContinuous = () => { historyGroup.current=null; };
  function finishEditing(){
    if(inlineId){const p=spread?.elements.find(p=>p.id===inlineId);if(p&&p.text!==inlineText)patchPiece(inlineId,{text:inlineText});setInlineId(null);}
    setSelected(null);setMultiIds([]);setEditingGroup(null);setCropping(false);if(panel==='edit')setPanel(null);
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
  function commitSelectionIds(ids:string[]){
    if(!spread)return;
    const unique=[...new Set(ids)].filter(id=>spread.elements.some(p=>p.id===id));
    if(!unique.length){setSelected(null);return;}
    const pieces=spread.elements.filter(p=>unique.includes(p.id));
    const units=new Set(pieces.map(p=>p.groupId?`group:${p.groupId}`:`piece:${p.id}`));
    setEditingGroup(null);
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
  function selectPiece(p:Piece,add=false) {
    if(panel!=='elements')setPanel(null);
    if(add){
      if(selectTimer.current)clearTimeout(selectTimer.current);
      const pending=pendingSelection.current;pendingSelection.current=null;
      const current=pending?selectionIdsFor(pending):activePieces.map(q=>q.id),ids=selectionIdsFor(p);
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
    if(selectTimer.current)clearTimeout(selectTimer.current);
    pendingSelection.current=null;
    const memberIds=members.map(p=>p.id),current=activePieces.map(p=>p.id),selectedCount=memberIds.filter(id=>current.includes(id)).length;
    if(selectedCount===memberIds.length){commitSelectionIds(current.filter(id=>!memberIds.includes(id)));return;}
    if(current.length&&(activePieces.some(p=>p.locked)||members.some(p=>p.locked))){toast('锁定素材不能加入多选，请先解锁。');return;}
    if(!current.length){setMultiIds([]);setEditingGroup(null);setSelected(members[0].id);return;}
    commitSelectionIds([...current,...memberIds]);
  }
  function toggleSidebarMember(p:Piece){
    if(selectTimer.current)clearTimeout(selectTimer.current);
    pendingSelection.current=null;
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
  function enterGroup(p:Piece){if(selectTimer.current)clearTimeout(selectTimer.current);pendingSelection.current=null;setMultiIds([]);setSelected(p.id);setEditingGroup(p.groupId||null);if(p.kind==='text'){setInlineId(p.id);setInlineText(p.text||'');}}
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
    if(!piece)return;
    if(color===null){patchPiece(piece.id,{colorRuns:undefined});return;}
    if(!textRange||textRange.id!==piece.id||textRange.text!==piece.text){toast('请重新选中文字后设置颜色。');return;}
    patchPiece(piece.id,{colorRuns:[...(piece.colorRuns||[]),{start:textRange.start,end:textRange.end,color}].slice(-100)});
  }
  function highlightText(color:string|null){
    if(!piece)return;
    if(color===null){patchPiece(piece.id,{highlightRuns:undefined});return;}
    if(!textRange||textRange.id!==piece.id||textRange.text!==piece.text){toast('请重新选中文字后添加荧光标记。');return;}
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
    const outside=(e:MouseEvent)=>{const target=e.target;if(!(target instanceof Element)||target.closest('[data-piece-id],.selection-box,[data-editor-ui],.side-panel,[role="dialog"],[role="alertdialog"]'))return;finishEditing();};
    document.addEventListener('click',outside);return()=>document.removeEventListener('click',outside);
  });
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
    setOpening(false);setClosing(false);setSnapGuides({});
    const position=restoreHistoryPosition(snapshot,bookId,page,opened);
    setBookId(position.bookId);setPage(position.page);setOpened(position.opened);
    if(!position.bookId)setView('library');
    setInlineId(null);setTextRange(null);setSelected(null);
    setDesignPreview(null);historyGroup.current=null;
    editingPosition.current=null;scrollRestore.current=null;
    dirty.current=true;
    booksRef.current=snapshot;
    setBooks(snapshot);
  }
  const undo = () => {
    const previous = history.current.pop();
    if (previous) {
      future.current.push(structuredClone(booksRef.current));
      if(future.current.length>30)future.current.shift();
      restoreHistorySnapshot(previous);
      toast('已撤销上一步');
    } else toast('还没有可以撤销的修改');
  };
  const redo = () => {
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
      changeSpread((s) => ({
        ...s,
        removed: [
          ...(s.removed || []),
          ...s.elements.filter((e) => ids.has(e.id)).map(pieceKey),
        ],
        elements: s.elements.filter((e) => !ids.has(e.id)).map(e=>e.attachedTo&&ids.has(e.attachedTo)?{...e,attachedTo:undefined}:e),
      }));
      setSelected(null);
    }
  };
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
      progress: 0,
      settling: false,
    };
    setSelected(null);
    setFlipping(direction > 0 ? 'next' : 'previous');
    setTurnTarget(target);
    setTurnProgress(0);
    setTurnSettling(false);
    return true;
  }
  /* 翻页进度直接写入 DOM，避免每帧重渲染整个工作台。 */
  function paintTurn(progress: number, direction: number) {
    const el = canvas.current?.querySelector<HTMLElement>(
      '.page-turn-layer .turn-moving',
    );
    if (el)
      el.style.transform = `rotateY(${(direction > 0 ? -180 : 180) * progress}deg)`;
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
      else {if(complete)setPage(t.target);setFlipping('');setTurnProgress(0);setTurnSettling(false);turnRef.current=null;}
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
    setCoverTitle(b?.title || '拾光集');
    setCoverType(coverInfo(b?.cover).colorway.id);
    setCoverFormat(b?.format || 'standard');
    setCoverAsset(b?.coverAsset || '');
    const paper = paperSettings(b);
    setCoverPaperStyle(paper.style);
    setCoverPaperColor(paper.color);
    setCoverHeaderOn(headerOf(b).enabled);
    setCoverHeader({...headerOf(b)});
    setCoverBg(b?.paperBg || null);
    setCoverTemplates(b?.paperTemplates || []);
    setCoverTab('cover');
    setCoverScope('book');
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
        if (file.size > 10 * 1024 * 1024)
          throw Error('单张照片请控制在 10 MB 以内。');
        const data = await new Promise<string>((ok, fail) => {
          const r = new FileReader();
          r.onload = () =>
            typeof r.result === 'string'
              ? ok(r.result)
              : fail(Error('照片读取失败'));
          r.onerror = () => fail(Error('照片读取失败。'));
          r.readAsDataURL(file);
        });
        const result = await api<{ src: string }>(
          '/upload',
          send('POST', { data }),
        );
        added.push(result.src);
      }
      if(insertOnCanvas&&book){
        const additions:Piece[]=added.map((src,i)=>({id:uid(),kind:'photo',src,photoOriginal:src,x:(page===-1?58:8)+(i%3)*28,y:12+Math.floor(i/3)*18,w:24,rotation:0,locked:false,frame:'plain'}));
        if(page>=0&&!book.spreads.length)change(all=>all.map(b=>b.id===book.id?addBlankSpread(b):b),false);
        changeSpread(s=>({...s,elements:[...s.elements,...additions]}));
        setReading(false);setLibraryOpen(false);setOpened(true);setPanel(null);setSelected(additions.at(-1)?.id||null);toast(`已添加 ${added.length} 张照片，可直接拖动调整。`);
      }else if (replace && piece)
        patchPiece(piece.id, { src: added[0], photoOriginal: added[0] });
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
              instruction: inst ?? instruction,
              elements: regen ? spread!.elements.map(p=>({...p,locked:isPieceHidden(p)||!!p.groupId || preserveLocks && p.locked})) : [],
            }),
          )
        : localResult(days, currentTheme);
      const currentBook=booksRef.current.find(b=>b.id===book.id);
      if (regen && JSON.stringify(currentBook?sheetAt(currentBook,page):undefined) !== JSON.stringify(spread)) throw Error('设计期间页面发生了修改，请重新设计以包含最新内容。');
      if (regen) {
        if(result.elements)result.elements=reserveHeaderSpace(result.elements,headerSpace,spread!.elements.filter(p=>isPieceHidden(p)||(preserveLocks&&p.locked)).map(p=>p.id));
        const protectedSpread={...spread!,elements:spread!.elements.map(p=>({...p,locked:isPieceHidden(p)||!!p.groupId||preserveLocks&&p.locked}))};
        const designed=regenerateSpread(protectedSpread,result,assets);
        designed.elements=designed.elements.map(p=>{
          const original=spread!.elements.find(q=>q.id===p.id);
          const restored=p.groupId?{...p,locked:original?.locked||false}:p;
          return original?withLayerMeta(restored,{hidden:isPieceHidden(original)||undefined,layerName:pieceLayerName(original),groupName:pieceGroupName(original)}):restored;
        });
        setDesignPreview({book,spread:designed,before:JSON.stringify(spread),concept:result.designConcept});
      } else {
        const updated = appendDay(book, day, result, assets, Math.max(0, page), entrySide==='left'?0:1, headerSpace);
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
  function pointerDown(e: React.PointerEvent, id: string, mode = 'move') {
    if (reading || inlineId === id || e.button !== 0 || busy || turnRef.current) return;
    e.stopPropagation();
    const p=spread?.elements.find(p=>p.id===id),paper=canvas.current;
    if(!p||!paper)return;
    if(e.shiftKey&&mode==='move')return;
    const members=multiIds.includes(id)?activePieces:p.groupId&&p.groupId!==editingGroup?spread!.elements.filter(q=>q.groupId===p.groupId):[p];
    if(selectTimer.current)clearTimeout(selectTimer.current);
    if(members.some(p=>p.locked))return;
    const r=paper.getBoundingClientRect(),cw=paper.clientWidth,ch=paper.clientHeight,boxes=members.map(pieceBox);
    const box=members.length>1?unionBoxes(boxes):boxes[0];
    const cx=r.left+paper.clientLeft+box.x+box.w/2,cy=r.top+paper.clientTop+box.y+box.h/2;
    const movingIds=new Set(members.map(member=>member.id));
    const snap=mode==='move'&&!(cropping&&p.kind==='photo')?buildSnapTargets(cw,ch,(spread?.elements||[]).filter(q=>!movingIds.has(q.id)&&!isPieceHidden(q)).map(pieceBox)):undefined;
    setSnapGuides({});
    drag.current={id,x:e.clientX,y:e.clientY,mode:cropping&&p.kind==='photo'?'crop':mode,box,canvasW:cw,canvasH:ch,cx,cy,angle:Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI,started:false,members,boxes,crop:{x:p.crop??50,y:p.cropY??50},snap};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    const d=drag.current;if(!d)return;
    const dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(!d.started){if(Math.hypot(dx,dy)<3)return;remember();d.started=true;}
    if(d.mode==='crop'){patchPiece(d.id,{crop:Math.max(0,Math.min(100,d.crop!.x-dx/d.box.w*100)),cropY:Math.max(0,Math.min(100,d.crop!.y-dy/d.box.h*100))},false);return;}
    let box={...d.box};
    if(d.mode==='rotate'){
      box.rotation=normalizeAngle(d.box.rotation+Math.atan2(e.clientY-d.cy,e.clientX-d.cx)*180/Math.PI-d.angle);
      if(e.shiftKey)box.rotation=Math.round(box.rotation/15)*15;
    }else if(d.mode.startsWith('resize-')){
      box=resizeBox(d.box,d.mode.slice(7),dx,dy,d.members.length>1||proportional||e.shiftKey);
      const scale=Math.min(1,d.canvasW/box.w,d.canvasH/box.h);box.w*=scale;box.h*=scale;
      box.x=Math.max(0,Math.min(d.canvasW-box.w,box.x));box.y=Math.max(0,Math.min(d.canvasH-box.h,box.y));
    }else{
      box.x=d.box.x+dx;box.y=d.box.y+dy;
      if(!e.altKey&&d.snap){const snapped=snapMoveBox(box,d.snap,6);box={...box,...snapped.box};setSnapGuides(snapped.guides);}
      else setSnapGuides({});
    }
    if(d.mode!=='move')setSnapGuides({});
    if(d.members.length>1){const transformed=transformCluster(d.members,d.boxes,d.box,box,d.canvasW,d.canvasH);const updates=new Map(transformed.map(p=>[p.id,p]));changeSpread(s=>({...s,elements:s.elements.map(p=>updates.get(p.id)||p)}),false);}
    else if(d.mode==='rotate')patchPiece(d.id,{rotation:box.rotation},false);
    else if(d.mode==='move')patchPiece(d.id,{x:box.x/d.canvasW*100,y:box.y/d.canvasH*100},false);
    else patchPiece(d.id,{x:box.x/d.canvasW*100,y:box.y/d.canvasH*100,w:box.w/d.canvasW*100,h:box.h/d.canvasH*100,stretch:true},false);
  }
  function endPointerDrag(){drag.current=null;setSnapGuides({});}
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
  function savePaper() {
    if (!book) return;
    change((all) =>
      all.map((b) =>
        b.id === book.id
          ? (paperScope === 'left' || paperScope === 'right') && spread
            ? patchPage(b,spread.id,paperScope,{paperStyle,paperColor})
            : applyPaper(
              b,
              paperStyle,
              paperColor,
              paperScope === 'spread' && page >= 0 ? spread?.id : undefined,
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
    setPanel('edit');
    setModal(null);
  }
  const resolveMaterial = (src: string | undefined, id?: string) =>
    assets.find((a) => (id ? a.id === id : a.originalSrc === src))?.src || src;
  function addText() {
    if (!spread) return;
    const p: Piece = {
      id: uid(),
      kind: 'text',
      text: '写在这里…',
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
    const paper=paperSettings(b,current),header=headerOf(b,current);
    setCoverPaperStyle(paper.style);setCoverPaperColor(paper.color);setCoverBg(paperBgOf(b,current)||null);setCoverHeader({...header});setCoverHeaderOn(header.enabled);
    setCoverDate(current?.date||current?.days[0]?.date||spread?.date||spread?.days[0]?.date||today());
  }
  function saveCover() {
    const header=sanitizeHeader({...coverHeader,enabled:coverHeaderOn});
    const existing=books.find(b=>b.id===editingBookId);
    if(existing){
      change(all=>all.map(b=>{
        if(b.id!==existing.id)return b;
        let next:Book={...b,title:coverTitle.trim()||'未命名笔记本',cover:coverType,coverAsset,format:coverFormat,paperTemplates:coverTemplates};
        const canScope=view==='workbench' && page>=0 && spread && existing.id===book?.id;
        if(canScope&&(coverScope==='left'||coverScope==='right')){
          next=patchPage(next,spread.id,coverScope,{paperStyle:coverPaperStyle,paperColor:coverPaperColor,header,paperBg:coverBg,...(coverDate?{date:coverDate}:{})});
        }else{
          const id=canScope&&coverScope==='spread'?spread.id:undefined;
          next=applyPaper(next,coverPaperStyle,coverPaperColor,id);
          next=applyHeader(next,header,id);
          next=applyPaperBg(next,coverBg,id);
          if(canScope&&coverDate)next={...next,spreads:next.spreads.map(s=>s.id===spread.id?{...s,date:coverDate}:s)};
        }
        return next;
      }));
    }else{
      const b={...newBook(today().slice(0,7),coverType,coverTitle.trim()||'未命名笔记本',coverFormat,{paperStyle:coverPaperStyle,paperColor:coverPaperColor,header}),coverAsset,paperBg:coverBg||undefined,paperTemplates:coverTemplates};
      change(all=>[...all,b]);enterBook(b);setPage(-1);setOpened(false);setView('workbench');
    }
    setModal(null);toast(existing?'笔记本设置已更新。':'已创建新笔记本。');
  }
  async function exportBackup() {
    try {
      toast('正在整理手帐和原始照片…');
      const paths = notebookUploads(books);
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
        [JSON.stringify({ format: 'shiguang-v1', books, images })],
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
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const input = JSON.parse(await file.text());
      if (
        input.format !== 'shiguang-v1' ||
        !Array.isArray(input.books) ||
        input.books.length > 240
      )
        throw Error('不是有效的拾光备份文件。');
      const mapping: Record<string, string> = {};
      for (const [path, data] of Object.entries(input.images || {})) {
        mapping[path] = (
          await api<{ src: string }>('/upload', send('POST', { data }))
        ).src;
      }
      const restored = (input.books as Book[]).map(b => ({...remapNotebookUploads(b,mapping),id:uid()}));
      await api(
        '/validate',
        send('POST', {
          books: [
            ...books,
            ...restored,
          ],
        }),
      );
      change((all) =>
        [
          ...all,
          ...restored,
        ],
      );
      toast('备份已导入。');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable ||
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
      } else if (reading && book && ['ArrowRight','ArrowLeft'].includes(e.key)) {
        e.preventDefault();setPage(p=>Math.max(-1,Math.min(book.spreads.length-1,p+(e.key==='ArrowRight'?1:-1))));
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
  const decorative = spread?.elements || [];
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
  const bg = !isFlyleaf ? paperBgOf(book, spread) : undefined;
  const orderedBooks = [...books].sort((a, b) => {
    const ia = recent.indexOf(a.id), ib = recent.indexOf(b.id);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
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
        <button className={libraryOpen?'active':''} aria-label="素材库" disabled={!book} onClick={()=>{if(reading)switchMode('edit');setView('workbench');setLibraryOpen(true);setPanel(null);}}><Layers/><span>素材</span></button>
        <button className={modal==='material-import'?'active':''} aria-label="导入素材" onClick={()=>setModal('material-import')}><ImagePlus/><span>导入</span></button>
        <button className={panel==='write'?'active':''} aria-label="AI 创作" disabled={!ready||busy||!book} onClick={()=>{if(reading)switchMode('edit');setView('workbench');openWrite();}}><Sparkles/><span>AI 创作</span></button>
        <div className="rail-spacer"/>
        <button aria-label="导出笔记图片" disabled={!book||(!opened&&!reading)||opening||closing||!!flipping} onClick={()=>{finishEditing();setImageExportOpen(true);}}><ImageIcon/><span>导出图片</span></button>
        <button aria-label="导出备份" onClick={()=>void exportBackup()}><Download/><span>备份</span></button>
        <button aria-label="AI 设置" onClick={openSettings}><Settings/><span>设置</span></button>
        <small className="build-version" title="当前版本">v0.1.20</small>
      </aside>
      <main>
        {!reading && view!=='library' && !libraryOpen && <header className="compact-bar editor-header">
          <div className="notebook-title-tools">
            {books.length>1?<Pick label="切换笔记本" value={book?.id||''} onChange={id=>{const b=books.find(x=>x.id===id);if(b)chooseBook(b);}} items={orderedBooks.map(b=>({id:b.id,name:b.title}))}/>:<strong>{book?.title}</strong>}
            <button className="quiet" aria-label="笔记本设置" title="笔记本设置" disabled={!book} onClick={()=>startCover()}><Settings/></button>
            <button className="quiet" aria-label="记录索引" title="记录索引" onClick={()=>setModal('index')}><List/></button>
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
            <button className="quiet" disabled={!spread||busy||!opened} onClick={addText}><Type/><span>文字</span></button>
            <button className="quiet" disabled={!book||uploading||busy} onClick={()=>canvasPhotoInput.current?.click()}><ImagePlus/><span>{uploading?'添加中':'照片'}</span></button>
            <button className="quiet" disabled={!book} onClick={()=>{setLibraryOpen(true);setPanel(null);}}><Layers/><span>素材</span></button>
            <button
              className={`quiet ${panel==='elements'?'active':''}`}
              aria-pressed={panel==='elements'}
              disabled={!spread||busy||!opened}
              onClick={()=>setPanel(panel==='elements'?null:'elements')}
            >
              <Layers/><span>图层</span>
            </button>
            <button className="quiet" disabled={!spread||busy||!opened} onClick={()=>{finishEditing();setCollageOpen(true);}}><Feather/><span>旅行拼贴</span></button>
            <span className="tool-divider"/>
            <button className="quiet" aria-label="撤销调整" onClick={undo}><RotateCcw/><span>撤销</span></button><button className="quiet" aria-label="重做调整" onClick={redo}><Redo2/><span>重做</span></button>
          </fieldset>
        </header>}
        {!reading&&!libraryOpen&&view!=='library'&&opened&&spread&&<div className={`fixed-element-tools ${piece?'has-selection':'is-empty'}`} data-editor-ui="true" style={{visibility:modal||designPreview||imageExportOpen||collageOpen?'hidden':undefined}}>
          {piece ? <>
          <div className="cluster-tools">
            <span>{multiSelection?`已选 ${activeUnitCount} 个素材`:cluster?'已选 1 个组合':editingGroup?'正在编辑组内元素':'⌘/Ctrl 或 Shift 点击可多选'}</span>
            {cluster&&<><button className="quiet" disabled={selectionLocked} onClick={groupSelection}>编为一组</button><button className="quiet" disabled={selectionLocked||!piece.groupId} onClick={ungroupSelection}>解组</button><label>组合名称<input aria-label="组合名称" value={templateName} maxLength={40} onChange={e=>setTemplateName(e.target.value)}/></label><button className="quiet" onClick={saveCluster}>保存组合</button><button className="quiet" onClick={copyPiece}>复制组合</button><button className="quiet" disabled={selectionLocked} onClick={()=>changeLayer('top')}>组合置顶</button><button className="quiet" disabled={selectionLocked} onClick={()=>changeLayer('bottom')}>组合置底</button><button className="quiet" disabled={selectionLocked} onClick={removePiece}>删除所选</button><button className="quiet" onClick={()=>enterGroup(piece)}>编辑组内元素</button></>}
            {editingGroup&&<button className="quiet" onClick={()=>{setEditingGroup(null);setInlineId(null);}}>返回整个组合</button>}
            <button className="quiet" aria-pressed={selectionLocked} onClick={()=>patchSelection({locked:!selectionLocked})}>{selectionLocked?<Unlock/>:<Lock/>}{selectionLocked?'解锁所选':'锁定所选'}</button>
            {cluster&&<button className="quiet" onClick={finishEditing}>完成</button>}
          </div>
          {!cluster&&<fieldset disabled={selectionLocked} className="single-piece-tools"><ElementControls piece={piece} height={piece.h??(selectionSize.h||15)} proportional={proportional} onProportional={()=>setProportional(!proportional)} onPatch={patch=>patchPiece(piece.id,patch)} onSize={changeSize} onLayer={changeLayer} onCopy={copyPiece} onDelete={removePiece} onFinish={finishEditing} onEdit={()=>enterGroup(piece)} onMore={()=>setPanel('edit')} onReplace={()=>replaceInput.current?.click()} onReset={()=>patchPiece(piece.id,{h:undefined,stretch:false})}/>
          <CollageTools piece={piece} onPatch={patch=>patchPiece(piece.id,patch)} onCaption={()=>addPhotoAttachment('caption')} onTape={()=>addPhotoAttachment('tape')} onCutout={()=>void cutout()} cropping={cropping} onCrop={()=>{setCropping(!cropping);if(piece.frame==='plain'||piece.frame==='cutout')patchPiece(piece.id,{h:piece.h||selectionSize.h,stretch:true});}} busy={busy} hasTextRange={!!textRange&&textRange.id===piece.id&&textRange.end>textRange.start} onTextColor={colorText} onTextHighlight={highlightText}/></fieldset>}
          </> : <span className="selection-toolbar-placeholder">选择素材后可在这里调整</span>}
        </div>}
        {book&&spread&&<CollageStudio open={collageOpen} onClose={()=>setCollageOpen(false)} feel={spread.paperFeel||book.paperFeel} color={paper.color} onFeel={paperFeel=>changeSpread(s=>({...s,paperFeel,pages:s.pages?Object.fromEntries(Object.entries(s.pages).map(([side,p])=>[side,{...p,paperFeel}])):undefined}))} onColor={paperColor=>changeSpread(s=>({...s,paperColor,pages:s.pages?Object.fromEntries(Object.entries(s.pages).map(([side,p])=>[side,{...p,paperColor}])):undefined}))} onCream={()=>{changeSpread(creamTravel);toast('已应用奶油纸旅行风格，保留原有内容和位置。');}} onCheck={()=>void checkLayout()} onTidy={()=>void checkLayout(true)} templates={book.collageTemplates||[]} onInsert={insertCluster}/>}
        {!reading&&layoutReport&&<div className="layout-report" data-editor-ui="true"><span>{layoutReport.length?`${layoutReport.length} 处排版提示`:'未发现遮挡或越界'}</span>{layoutReport.slice(0,8).map((issue,i)=><button className="quiet" key={i} onClick={()=>{setMultiIds(issue.ids);setSelected(issue.ids[0]);}}>{issue.message}</button>)}{layoutReport.length>0&&<small>空间不足时可增加跨页；组内重叠请双击调整。</small>}<button className="quiet" aria-label="关闭排版提示" onClick={()=>setLayoutReport(null)}><X/></button></div>}

        {ready&&<div className={`journal-save-bar ${saved.startsWith('保存冲突')?'has-conflict':''}`}>
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
<div className="library-head-actions"><button className="outline" onClick={()=>setModal('history')}>历史备份</button>              <button className="outline" onClick={() => importInput.current?.click()}>
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
        ):libraryOpen?<MaterialLibrary assets={assets} onUpdated={setAssets} onInsert={insertLibraryAssets} onBack={()=>setLibraryOpen(false)} onImport={()=>setModal('material-import')} onOpenStudio={()=>{setMaterialStudioNotice('');setModal('studio')}} onSettings={openSettings} hasKey={settings.hasKey} vision={settings.vision}/>:<section className="workspace">
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
              className={`editor-layout ${panel && !reading ? 'with-panel' : ''}`}
            >
              <div ref={workArea} className="work-area" style={{'--page-zoom':zoom/100} as CSSProperties}>
                <span className="canvas-caption">
                  VOLUME {currentMonth.slice(-2)} ·{' '}
                  {monthName(currentMonth).toUpperCase()}
                </span>
                {reading && book ? (<ReadingDeck book={book} assets={assets} page={readingPage} onSelect={setReadingPage}/>) : !book ? (
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
                      className={`open-book paper-${paper.style} ${isFlyleaf ? 'flyleaf-spread' : ''}`}
                      style={
                        {
                          '--paper': paper.color,
                          '--ink': paperDark ? '#f5f5ed' : '#343b34',
                          '--ruling': paperDark ? '#ffffff35' : '#47556925',
                        } as CSSProperties
                      }
                      ref={canvas}
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
                      {snapGuides.x!==undefined&&<span aria-hidden="true" data-editor-ui="true" style={{position:'absolute',left:snapGuides.x,top:0,bottom:0,width:1,background:'rgba(59,130,246,.72)',boxShadow:'0 0 0 1px rgba(255,255,255,.55)',zIndex:9999,pointerEvents:'none'}}/>}
                      {snapGuides.y!==undefined&&<span aria-hidden="true" data-editor-ui="true" style={{position:'absolute',top:snapGuides.y,left:0,right:0,height:1,background:'rgba(59,130,246,.72)',boxShadow:'0 0 0 1px rgba(255,255,255,.55)',zIndex:9999,pointerEvents:'none'}}/>}
                      {decorative.filter(p=>!isPieceHidden(p)).map((p) => (
                        <div
                          key={p.id}
                          data-piece-id={p.id}
                          tabIndex={spread && !reading ? 0 : -1}
                          role={spread && !reading ? 'button' : undefined}
                          aria-label={
                            p.kind === 'text'
                              ? `编辑${p.role === 'title' ? '标题' : '文字'}`
                              : `编辑${p.kind === 'photo' ? '照片' : '素材'}`
                          }
                          className={`piece piece-${p.kind} ${p.role || ''} ${activePieces.some(q=>q.id===p.id) ? 'selected' : ''} ${p.frame || ''} ${p.stretch?'piece-stretched':''} ${pieceClasses(p)} ${cropping&&selected===p.id?'is-cropping':''}`}
                          style={{
                            ...pieceAppearance(p),
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            width: `${p.w}%`,
                            transform: `rotate(${p.rotation}deg)`,
                            fontSize: `${(p.fontSize || 18) / 10}cqw`,

                            opacity: p.opacity ?? 1,
                            color:p.color || (!isFlyleaf && book ? pageInk(book,spread,p.x>=50?'right':'left') : undefined),background:p.kind==='text'?p.background:undefined,
                            height:p.h?`${p.h}%`:p.kind==='doodle'?'15%':undefined,
                            fontFamily:p.fontFamily==='serif'?'Georgia, Songti SC, serif':p.fontFamily==='sans'?'PingFang SC, sans-serif':undefined,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (spread && !reading) {
                              if(e.shiftKey||e.metaKey||e.ctrlKey)selectPiece(p,true);else{if(selectTimer.current)clearTimeout(selectTimer.current);pendingSelection.current=p;selectTimer.current=setTimeout(()=>{selectPiece(p);pendingSelection.current=null;selectTimer.current=null;},350);}
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !reading && !p.locked) {
                              if(e.shiftKey||e.metaKey||e.ctrlKey)selectPiece(p,true);else{if(selectTimer.current)clearTimeout(selectTimer.current);pendingSelection.current=p;selectTimer.current=setTimeout(()=>{selectPiece(p);pendingSelection.current=null;selectTimer.current=null;},350);}
                              if(p.kind==='text'){setInlineId(p.id);setInlineText(p.text||'')}
                            }
                          }}
                          onDoubleClick={()=>{if(!reading&&!p.locked)enterGroup(p)}}
                          onPointerDown={(e) => pointerDown(e, p.id)}
                          onPointerMove={pointerMove}
                          onPointerUp={endPointerDrag}
                          onPointerCancel={endPointerDrag}
                        >
                          {p.kind === 'text' ? (
                            inlineId===p.id&&!reading?<textarea className="inline-writing" aria-label="直接编辑纸面文字" ref={el=>{if(el && document.activeElement!==el)el.focus()}} value={inlineText} maxLength={8000} onChange={e=>setInlineText(e.target.value)} onSelect={e=>{const t=e.currentTarget;setTextRange(t.selectionEnd>t.selectionStart?{id:p.id,start:t.selectionStart,end:t.selectionEnd,text:t.value}:null);}} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){setInlineId(null)}else if((e.metaKey||e.ctrlKey)&&e.key==='Enter')e.currentTarget.blur()}} onBlur={()=>{if(inlineId===p.id){patchPiece(p.id,{text:inlineText});setInlineId(null)}}}/>:<div className="piece-text"><ColoredWriting piece={p}/></div>
                          ) : p.kind==='photo' ? <PhotoArtwork piece={p} alt="当天照片"/> : p.material==='tape' ? <TapeArtwork piece={p}/> : p.kind==='doodle' ? (
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
                      {piece&&!isPieceHidden(piece)&&!reading&&!selectionLocked&&!cropping&&inlineId!==piece.id&&<div
                        className={`selection-box ${multiSelection?'multi-move-box':''}`}
                        aria-label={multiSelection?'多选素材移动区域':'素材调整边框'}
                        title={multiSelection?'按住框内任意空白处拖动全部所选素材':undefined}
                        style={clusterBox?{left:clusterBox.x,top:clusterBox.y,width:clusterBox.w,height:clusterBox.h}:{left:`${piece.x}%`,top:`${piece.y}%`,width:`${selectionSize.w||piece.w}%`,height:`${selectionSize.h||piece.h||15}%`,transform:`rotate(${piece.rotation}deg)`}}
                        onPointerDown={multiSelection?e=>pointerDown(e,piece.id,'move'):undefined}
                        onPointerMove={pointerMove}
                        onPointerUp={endPointerDrag}
                        onPointerCancel={endPointerDrag}
                      >
                        <span className="selection-label">{multiSelection?`已选 ${activeUnitCount} 个 · 拖动框内移动`:cluster?'组合 · 等比缩放':piece.kind==='text'?'文字':piece.kind==='photo'?'照片':'素材'}</span>
                        {!multiSelection&&resizeHandles.map(([handle,label])=><button key={handle} className={`resize-handle handle-${handle}`} aria-label={label} title={label+' · Shift 保持比例'} onPointerDown={e=>pointerDown(e,piece.id,'resize-'+handle)}/>)}
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
                        book &&
                        spread &&
                        sheetAt(book, turnTarget) && (
                          <PageTurn
                            book={book}
                            from={spread}
                            to={sheetAt(book, turnTarget)!}
                            fromFlyleaf={page === -1}
                            toFlyleaf={turnTarget === -1}
                            fromIndex={page}
                            toIndex={turnTarget}
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
              {panel && !reading && (
                <aside className="side-panel">
                  <header>
                    <div>
                      <span className="eyebrow">
                        {panel === 'write'
                          ? 'AI STUDIO'
                          : panel === 'elements'
                            ? 'LAYERS'
                          : 'MAKE IT YOURS'}
                      </span>
                      <h2>
                        {panel === 'write'
                          ? 'AI 创作'
                          : panel === 'elements'
                            ? '图层'
                          : '调整这一小片'}
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
                            可要求润色、分段、逐段加框和配贴纸；只要求排版时保留文字，所有修改均可撤销。
                          </p>
                        </div>
                      )}
                    </div>
                  ) : panel === 'elements' ? (
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
                                return item.kind==='text'
                                  ? (compactText?compactText.slice(0,18):'空白文字')
                                  : item.kind==='photo'
                                    ? `照片 ${itemIndex+1}`
                                    : item.kind==='doodle'
                                      ? (item.material==='tape'?'胶带':'手绘素材')
                                      : itemAsset?.name||`素材 ${itemIndex+1}`;
                              };
                              const thumb=(item:Piece)=>item.kind==='text'?<Type/>:item.kind==='doodle'?<Feather/>:<img loading="lazy" src={item.kind==='asset'?resolveMaterial(item.src,item.assetId):item.src} alt=""/>;
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
                                                <span className="page-element-copy"><strong>{memberName}</strong><small>{member.kind==='text'?'文字':member.kind==='photo'?'照片':member.kind==='doodle'?'装饰':'素材'}{memberHidden?' · 已隐藏':''}{member.locked?' · 已锁定':''}</small></span>
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
                                      <span className="page-element-copy"><strong>{label}</strong><small>{p.kind==='text'?'文字':p.kind==='photo'?'照片':p.kind==='doodle'?'装饰':'素材'}{isHidden?' · 已隐藏':''}{isLocked?' · 已锁定':''}</small></span>
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
                  ) : (
                    <div className="panel-scroll">
                      {piece ? (
                        <>
                          <div className="selected-preview">
                            {piece.kind === 'text' ? (
                              <Type />
                            ) : (
                              <img
                                src={
                                  piece.kind === 'asset'
                                    ? resolveMaterial(piece.src, piece.assetId)
                                    : piece.src
                                }
                                alt="选中元素预览"
                              />
                            )}
                            <span>
                              {piece.kind === 'text'
                                ? '文字片段'
                                : piece.kind === 'photo'
                                  ? '生活照片'
                                  : assets.find((a) => a.id === piece.assetId)
                                      ?.name || '拼贴素材'}
                            </span>
                          </div>
                          {piece.kind === 'text' && (
                            <label className="field">
                              <span>修改文字</span>
                              <textarea
                                rows={6}
                                value={piece.text || ''}
                                maxLength={8000}
                                onBlur={finishContinuous}
                                onChange={(e) =>
                                  patchContinuous(piece.id, { text: e.target.value })
                                }
                              />
                            </label>
                          )}
                          <div className="field">
                            <span>
                              大小 <small>{Math.round(piece.w)}%</small>
                            </span>
                            <Slider
                              aria-label="元素大小"
                              value={[piece.w]}
                              min={5}
                              max={70}
                              onValueCommitted={finishContinuous}
                              onValueChange={(v) =>
                                patchContinuous(piece.id, {
                                  w: Array.isArray(v) ? v[0] : v,
                                })
                              }
                            />
                          </div>
                          <div className="field">
                            <span>
                              旋转 <small>{Math.round(piece.rotation)}°</small>
                            </span>
                            <Slider
                              aria-label="旋转角度"
                              value={[piece.rotation]}
                              min={-180}
                              max={180}
                              onValueCommitted={finishContinuous}
                              onValueChange={(v) =>
                                patchContinuous(piece.id, {
                                  rotation: Array.isArray(v) ? v[0] : v,
                                })
                              }
                            />
                          </div>
                          {piece.kind === 'text' && (
                            <div className="field">
                              <span>字号</span>
                              <Slider
                                aria-label="文字字号"
                                value={[piece.fontSize || 18]}
                                min={12}
                                max={48}
                                onValueCommitted={finishContinuous}
                              onValueChange={(v) =>
                                  patchContinuous(piece.id, {
                                    fontSize: Array.isArray(v) ? v[0] : v,
                                  })
                                }
                              />
                            </div>
                          )}
                          {piece.kind === 'photo' && (
                            <>
                              <div className="field">
                                <span>照片边框</span>
                                <Pick
                                  label="照片边框"
                                  value={piece.frame || 'polaroid'}
                                  onChange={(v) =>
                                    patchPiece(piece.id, { frame: v })
                                  }
                                  items={[
                                    { id: 'polaroid', name: '拍立得' },
                                    { id: 'torn', name: '撕纸边缘' },
                                    { id: 'stamp', name: '邮票齿孔' },
                                    { id: 'plain', name: '完整原图' },
                                  ]}
                                />
                              </div>
                              {piece.frame !== 'plain' && (
                                <div className="field">
                                  <span>调整裁切位置</span>
                                  <Slider
                                    aria-label="照片裁切位置"
                                    value={[piece.crop ?? 50]}
                                    min={0}
                                    max={100}
                                    onValueCommitted={finishContinuous}
                              onValueChange={(v) =>
                                      patchContinuous(piece.id, {
                                        crop: Array.isArray(v) ? v[0] : v,
                                      })
                                    }
                                  />
                                </div>
                              )}
                              <button
                                className="outline full"
                                disabled={busy}
                                onClick={() => void cutout()}
                              >
                                {busy ? (
                                  <Loader2 className="spinning" />
                                ) : (
                                  <Sparkles />
                                )}
                                本地抠出主体
                              </button>
                              <p className="microcopy">
                                使用 Mac 本地识别，不发送照片、不消耗 AI 用量。
                              </p>
                              <button
                                className="outline full"
                                onClick={() => replaceInput.current?.click()}
                              >
                                <ImageIcon />
                                替换照片
                              </button>
                              <button
                                className="quiet full"
                                onClick={() =>
                                  patchPiece(piece.id, {
                                    src: piece.photoOriginal || piece.src,
                                    crop: 50,
                                    frame: 'plain',
                                  })
                                }
                              >
                                恢复完整原图
                              </button>
                            </>
                          )}
                          <div className="field">
                            <span>位置</span>
                            <div className="two-fields">
                              <label>
                                横向
                                <input
                                  aria-label="横向位置"
                                  type="number"
                                  min="0"
                                  max="95"
                                  value={Math.round(piece.x)}
                                  onChange={(e) =>
                                    patchPiece(piece.id, {
                                      x: Math.max(
                                        0,
                                        Math.min(95, Number(e.target.value)),
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                纵向
                                <input
                                  aria-label="纵向位置"
                                  type="number"
                                  min="0"
                                  max="95"
                                  value={Math.round(piece.y)}
                                  onChange={(e) =>
                                    patchPiece(piece.id, {
                                      y: Math.max(
                                        0,
                                        Math.min(95, Number(e.target.value)),
                                      ),
                                    })
                                  }
                                />
                              </label>
                            </div>
                          </div>
                          <div className="row">
                            <button
                              className="outline"
                              onClick={() =>
                                changeSpread((s) => ({
                                  ...s,
                                  elements: [
                                    ...s.elements.filter(
                                      (e) => e.id !== piece.id,
                                    ),
                                    { ...piece },
                                  ],
                                }))
                              }
                            >
                              <ArrowUpToLine />
                              置顶
                            </button>
                            <button
                              className="outline"
                              onClick={() =>
                                changeSpread((s) => ({
                                  ...s,
                                  elements: [
                                    { ...piece },
                                    ...s.elements.filter(
                                      (e) => e.id !== piece.id,
                                    ),
                                  ],
                                }))
                              }
                            >
                              <ArrowDownToLine />
                              置底
                            </button>
                          </div>
                          <div className="lock-card">
                            <div>
                              {piece.locked ? <Lock /> : <Unlock />}
                              <p>
                                {piece.locked
                                  ? '重做时保留此元素'
                                  : '允许 AI 重新设计'}
                                <small>开启后，可在重设计时选择保留</small>
                              </p>
                            </div>
                            <Switch
                              aria-label="重做时保留此元素"
                              checked={piece.locked}
                              onCheckedChange={(v) =>
                                patchPiece(piece.id, { locked: v })
                              }
                            />
                          </div>
                          <button className="danger full" onClick={removePiece}>
                            <Trash2 />
                            移除这一元素
                          </button>
                        </>
                      ) : (
                        <div className="empty-editor">
                          <Feather />
                          <p>
                            点选纸上的文字、照片或素材，
                            <br />
                            就能调整它。
                          </p>
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
                ? '拖动元素调整位置 · 自动吸附并显示参考线 · 按住 Alt 临时关闭吸附'
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
      <input
        ref={importInput}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => void importBackup(e.target.files?.[0])}
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
              onChange={v=>{setPaperScope(v);const current=paperSettings(book,v==='book'?undefined:pageSpread(spread,v==='right'?'right':'left'));setPaperStyle(current.style);setPaperColor(current.color);}}
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
                  className={`paper-swatch paper-${p.id}`}
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
        onReady={(message) => {setMaterialStudioNotice(message);setModal('studio')}}
      />
      <MaterialStudio
        open={modal === 'studio'}
        onClose={() => setModal(null)}
        onImported={setAssets}
        notice={materialStudioNotice}
      />
      <Dialog
        open={modal === 'settings'}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="journal-dialog">
          <DialogTitle>连接你的 AI</DialogTitle>
          <DialogDescription>
            目前固定使用 DeepSeek。默认选择 Vision，密钥保存在本机，不随手帐备份导出。
          </DialogDescription>
          <label className="field">
            <span>AI 服务</span>
            <input value="DeepSeek" disabled readOnly />
          </label>
          <label className="field">
            <span>默认模型</span>
            <select value={settingsForm.model||'deepseek-v4-flash-vision-exp'} onChange={(e)=>setSettingsForm((v)=>({...v,model:e.target.value,vision:e.target.value.includes('vision')}))}>
              <option value="deepseek-v4-flash-vision-exp">Vision（默认）</option>
              <option value="deepseek-v4-flash">V4 Flash（快速）</option>
              <option value="deepseek-v4-pro">V4 Pro（高质量）</option>
            </select>
          </label>
          <label className="field">
            <span>
              API 密钥{' '}
              <small>{settings.hasKey ? '● 已保存' : '尚未保存'}</small>
            </span>
            <input
              type="password"
              autoComplete="off"
              value={settingsForm.apiKey || ''}
              onChange={(e) => setSettingsForm((v) => ({ ...v, apiKey: e.target.value }))}
              placeholder={settings.hasKey ? '•••••••• 已保存（留空不更改）' : '仅在此处填写密钥'}
            />
          </label>
          <p className="microcopy">密钥不会回显；重新打开时留空不代表被清除。需要更换时直接粘贴新密钥。</p>
          <div className="lock-card"><div><ImageIcon/><p>图片理解<small>{settingsForm.vision?'当前默认使用 Vision；图片仅在你主动使用相关 AI 功能时发送。':'当前模型按文字模式使用。'}</small></p></div></div>
          <details className="ai-advanced">
            <summary>高级设置</summary>
            <label className="field"><span>API 基础地址</span><input value={settingsForm.baseUrl} onChange={(e)=>setSettingsForm((v)=>({...v,baseUrl:e.target.value}))} placeholder="https://api.deepseek.com"/></label>
          </details>
          <button className="primary full" disabled={settingsSaving} onClick={() => void saveSettings()}>
            {settingsSaving ? <Loader2 className="spinning" /> : <Check />}保存设置
          </button>
          <button className="outline full" disabled={settingsSaving} onClick={() => void saveSettings(true)}>
            {settingsSaving ? <Loader2 className="spinning" /> : <RefreshCw />}保存并完整测试 AI
          </button>
          <p className="microcopy">完整测试会依次检查文字、JSON 与图片理解（Vision），可能产生少量调用费用。</p>
          {settingsFeedback && <output className="settings-feedback" aria-live="polite">{settingsFeedback}</output>}
        </DialogContent>
      </Dialog>
      {imageExportOpen && book && (()=>{const index=reading?readingPage-1:page;const target=index<0?book.flyleaf:book.spreads[index];return target?<NotebookImageExport key={`${book.id}-${index}`} book={book} spread={target} assets={assets} pageIndex={index} flyleaf={index<0} open onClose={()=>setImageExportOpen(false)}/>:null;})()}
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
          <DialogTitle>{editingBookId?'笔记本设置':'新建笔记本'}</DialogTitle>
          <DialogDescription>
            选择封面、内页和页眉，左侧实时预览。
          </DialogDescription>

          <div className="notebook-settings-layout">
            <aside className="notebook-live-preview">
              <div className="preview-caption">{coverTab === 'cover' ? '封面预览' : '正文预览'}</div>
              {coverTab === 'cover' ? <div className={`settings-cover texture-${coverInfo(coverType).material.id} format-${coverFormat}`} style={{'--cover-base':coverInfo(coverType).colorway.color} as CSSProperties} /> :
                <div className={`settings-paper paper-${coverPaperStyle}`} style={{backgroundColor:coverPaperColor, color:swatchDark(coverPaperColor)?'#f5f5ed':'#343b34','--ruling':swatchDark(coverPaperColor)?'#ffffff30':'#47556928',aspectRatio:String((formats.find(f=>f.id===coverFormat)?.ratio || 1.43)/2)} as CSSProperties}>
                  {coverBg && <div className="paper-bg-layer"><img alt="" src={coverBg.src} style={{left:`${coverBg.x}%`,top:`${coverBg.y}%`,width:`${coverBg.scale}%`}}/></div>}
                  <div className="paper-ruling" />
                  {coverHeaderOn && <div className="settings-header-preview" style={{textAlign:coverHeader.align,color:coverHeader.color,fontSize:`${coverHeader.fontSize / 5}cqw`,paddingInline:`${coverHeader.margin}%`,height:`${coverHeader.height}%`}}>{renderHeader(coverHeader,{date:'2026-09-06',page:1})}</div>}
                </div>}
              <strong>{coverTitle || '未命名笔记本'}</strong>
              <span>{coverInfo(coverType).material.name} · {coverInfo(coverType).colorway.name}</span>
            </aside>
            <div className="notebook-settings-controls">
              <Tabs value={coverTab} onValueChange={v=>setCoverTab(String(v))}><TabsList aria-label="笔记本设置分类"><TabsTrigger value="cover">封面与开本</TabsTrigger><TabsTrigger value="paper">内页</TabsTrigger><TabsTrigger value="header">页眉</TabsTrigger></TabsList></Tabs>
              <div className="notebook-settings-scroll">
                {coverTab!=='cover' && editingBookId===book?.id && view==='workbench' && page>=0 && <div className="field"><span>应用范围</span><Pick label="设置应用范围" value={coverScope} onChange={changeCoverScope} items={[{id:'book',name:'整本笔记本'},{id:'spread',name:'当前跨页'},{id:'left',name:'仅当前左页'},{id:'right',name:'仅当前右页'}]}/></div>}

                {coverTab === 'cover' && <>          <div className="two-fields">
            <label className="field">
              <span>笔记本名称</span>
              <input
                value={coverTitle}
                maxLength={40}
                onChange={(e) => setCoverTitle(e.target.value)}
              />
            </label>
          </div>
          <div className="field">
            <span>开本规格</span>
            <div className="format-options format-options-two">
              {formats.map((f) => (
                <button
                  key={f.id}
                  className={`format-option ${coverFormat === f.id ? 'chosen' : ''}`}
                  onClick={() => setCoverFormat(f.id)}
                >
                  <span
                    className="format-mini"
                    style={{ width: `${Math.round(f.ratio * 40)}px`, height: '40px' }}
                  />
                  <span>{f.name}</span>
                  <small>{f.desc}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>封面材质</span>
            <div className="material-tabs">
              {coverMaterials.map((m) => (
                <button
                  key={m.id}
                  className={coverInfo(coverType).material.id === m.id ? 'active' : ''}
                  onClick={() => setCoverType(m.colorways[0].id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <div className="colorway-grid">
              {coverInfo(coverType).material.colorways.map((c) => (
                <button
                  key={c.id}
                  className={`colorway ${coverType === c.id ? 'chosen' : ''}`}
                  onClick={() => setCoverType(c.id)}
                >
                  <span
                    className={`colorway-cover texture-${coverInfo(coverType).material.id} format-${coverFormat}`}
                    style={{ '--cover-base': c.color } as CSSProperties}
                  />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
</>}
                {coverTab === 'paper' && <>          <div className="field">
            <span>整本内页</span>
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
                  className={coverPaperStyle === p.id ? 'chosen' : ''}
                  onClick={() => setCoverPaperStyle(p.id)}
                >
                  <div
                    className={`paper-swatch paper-${p.id}`}
                    style={
                      {
                        backgroundColor: coverPaperColor,
                        '--ruling': swatchDark(coverPaperColor) ? '#ffffff35' : '#47556945',
                      } as CSSProperties
                    }
                  >
                    <div className="paper-ruling" />
                  </div>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <div className="paper-colors cover-paper-colors">
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
                  aria-pressed={coverPaperColor === c}
                  style={{ background: c }}
                  onClick={() => setCoverPaperColor(c)}
                >
                  {coverPaperColor === c ? <Check /> : null}
                </button>
              ))}
              <input
                type="color"
                aria-label="自定义纸张颜色"
                value={coverPaperColor}
                onChange={(e) => setCoverPaperColor(e.target.value)}
              />
            </div>
          </div>

                  <div className="field"><span>自定义内页背景</span>
                    <input hidden type="file" ref={coverBgInput} accept="image/jpeg,image/png" onChange={e=>void uploadCoverBackground(e.target.files?.[0])}/>
                    <button className="outline" disabled={coverUploadBusy} onClick={()=>coverBgInput.current?.click()}><ImagePlus/>{coverUploadBusy?'正在导入…':'上传 JPG / PNG 内页'}</button>
                    {coverBg && <>
                      <div className="bg-preview" style={{'--spread-ratio':coverFormat==='tn-regular'?1.05:1.43} as CSSProperties}
                        onPointerDown={e=>{bgDrag.current={x:e.clientX,y:e.clientY,bx:coverBg.x,by:coverBg.y};e.currentTarget.setPointerCapture(e.pointerId);}}
                        onPointerMove={e=>{const d=bgDrag.current;if(!d)return;const r=e.currentTarget.getBoundingClientRect();setCoverBg(f=>f?{...f,x:Math.max(-200,Math.min(100,d.bx+(e.clientX-d.x)/r.width*100)),y:Math.max(-200,Math.min(100,d.by+(e.clientY-d.y)/r.height*100))}:f);}}
                        onPointerUp={()=>{bgDrag.current=null;}} onPointerCancel={()=>{bgDrag.current=null;}}>
                        <img src={coverBg.src} alt="拖动调整内页背景位置" draggable={false} style={{left:`${coverBg.x}%`,top:`${coverBg.y}%`,width:`${coverBg.scale}%`}}/>
                      </div>
                      <span>拖动调整位置 · 缩放 {Math.round(coverBg.scale)}%</span>
                      <Slider aria-label="整本背景缩放" value={[coverBg.scale]} min={20} max={300} onValueChange={v=>setCoverBg(f=>f?{...f,scale:Array.isArray(v)?v[0]:v}:f)}/>
                      <label className="field"><span>模板名称</span><input value={coverTemplateName} maxLength={20} onChange={e=>setCoverTemplateName(e.target.value)}/></label>
                      <div className="row"><button className="outline" onClick={()=>{setCoverTemplates(t=>[...(t||[]),{...coverBg,id:uid(),name:coverTemplateName.trim()||'我的内页'}]);toast('模板将在保存笔记本时一并保存。');}}>存为模板</button><button className="quiet" onClick={()=>setCoverBg(null)}>移除背景</button></div>
                    </>}
                    {!!coverTemplates?.length && <div className="settings-template-list">{coverTemplates.map(t=><button key={t.id} className="outline" onClick={()=>setCoverBg({src:t.src,x:t.x,y:t.y,scale:t.scale})}><img src={t.src} alt=""/>{t.name}</button>)}</div>}
                  </div>
                </>}
                {coverTab === 'header' && <>
                  {editingBookId===book?.id && view==='workbench' && page>=0 && <label className="field"><span>{coverScope==='left'?'左页':coverScope==='right'?'右页':'当前跨页'}记录日期</span><input type="date" value={coverDate} onChange={e=>setCoverDate(e.target.value)}/></label>}
                  <div className="lock-card"><span>启用正文页眉</span><Switch aria-label="启用正文页眉" checked={coverHeaderOn} onCheckedChange={setCoverHeaderOn}/></div>
                  {coverHeaderOn && <>          <label className="field">
            <span>页眉文字（可换行）</span>
            <textarea
              ref={coverHeaderText}
              rows={2}
              maxLength={120}
              value={coverHeader.text}
              onChange={(e) => setCoverHeader((f) => ({ ...f, text: e.target.value }))}
            />
          </label>
          <div className="row">
            <button className="outline" onClick={() => insertCoverToken('{日期}')}>
              插入日期
            </button>
            <button className="outline" onClick={() => insertCoverToken('{星期}')}>
              插入星期
            </button>
            <button className="outline" onClick={() => insertCoverToken('{页码}')}>
              插入页码
            </button>
          </div>
          <div className="field">
            <span>日期格式</span>
            <Pick
              label="日期格式"
              value={coverHeader.dateFormat}
              onChange={(v) => setCoverHeader((f) => ({ ...f, dateFormat: v }))}
              items={headerDateFormats.map((f) => ({ id: f.id, name: f.name }))}
            />
          </div>
          {coverHeader.dateFormat === 'custom' && (
            <label className="field">
              <span>自定义格式（yyyy 年 · MM 月 · dd 日，M d 不补零）</span>
              <input
                value={coverHeader.customFormat || ''}
                maxLength={40}
                placeholder="yyyy年M月d日"
                onChange={(e) =>
                  setCoverHeader((f) => ({ ...f, customFormat: e.target.value }))
                }
              />
            </label>
          )}
          <div className="two-fields">
            <div className="field">
              <span>
                字号 <small>{coverHeader.fontSize}</small>
              </span>
              <Slider
                aria-label="页眉字号"
                value={[coverHeader.fontSize]}
                min={10}
                max={24}
                onValueChange={(v) =>
                  setCoverHeader((f) => ({ ...f, fontSize: Array.isArray(v) ? v[0] : v }))
                }
              />
            </div>
            <div className="field">
              <span>对齐</span>
              <Pick
                label="页眉对齐"
                value={coverHeader.align}
                onChange={(v) =>
                  setCoverHeader((f) => ({ ...f, align: v as HeaderConfig['align'] }))
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
                高度 <small>{coverHeader.height}%</small>
              </span>
              <Slider
                aria-label="页眉高度"
                value={[coverHeader.height]}
                min={4}
                max={16}
                onValueChange={(v) =>
                  setCoverHeader((f) => ({ ...f, height: Array.isArray(v) ? v[0] : v }))
                }
              />
            </div>
            <div className="field">
              <span>
                边距 <small>{coverHeader.margin}%</small>
              </span>
              <Slider
                aria-label="页眉边距"
                value={[coverHeader.margin]}
                min={0}
                max={16}
                onValueChange={(v) =>
                  setCoverHeader((f) => ({ ...f, margin: Array.isArray(v) ? v[0] : v }))
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
                value={coverHeader.color || (swatchDark(coverPaperColor) ? '#f5f5ed' : '#343b34')}
                onChange={(e) => setCoverHeader((f) => ({ ...f, color: e.target.value }))}
              />
              <button
                className="quiet"
                onClick={() => setCoverHeader((f) => ({ ...f, color: undefined }))}
              >
                随纸色自动
              </button>
            </div>
          </div>
</>}
                </>}
              </div>
            </div>
          </div>
          <footer className="notebook-settings-footer"><span>{coverScope==='book'?'内页与页眉应用于全部正文页':coverScope==='spread'?'应用于当前跨页':coverScope==='left'?'仅应用于当前左页':'仅应用于当前右页'}</span><button className="outline" onClick={()=>setModal(null)}>取消</button><button className="primary" disabled={coverUploadBusy} onClick={saveCover}><Check/>{editingBookId?'保存设置':'创建笔记本'}</button></footer>
        </DialogContent>
      </Dialog>
      <Dialog
        open={modal === 'index'}
        onOpenChange={(v) => !v && setModal(null)}
      >
        <DialogContent className="journal-dialog page-index-dialog">
          <DialogTitle>页面与记录索引</DialogTitle>
          <DialogDescription>
            {book?.title || '当前笔记本'} · 包含扉页、手工拼贴与空白跨页，点击预览直接跳转。
          </DialogDescription>
          {book && (book.flyleaf || book.spreads.length) ? (
            <div className="page-index-grid">
              {[...(book.flyleaf?[{sheet:book.flyleaf,index:-1}]:[]),...book.spreads.map((sheet,index)=>({sheet,index}))].map(({sheet,index})=><button
                className="page-index-item" key={sheet.id} aria-label={index===-1?'跳转到扉页':`跳转到第 ${index+1} 跨页`} aria-current={index===page?'page':undefined}
                onClick={()=>{setSelected(null);setPage(index);setOpened(true);setModal(null);}}
              >
                <div className="page-index-preview" style={{aspectRatio:bookFormat(book).ratio}} aria-hidden="true"><ReadingJpgImage book={book} assets={assets} index={index===-1?0:index+(book.flyleaf?1:0)} alt=""/></div>
                <strong>{index===-1?'扉页':`第 ${index+1} 跨页`}</strong>
                <small>{sheet.days.length?sheet.days.map(d=>`${d.date} · ${d.title}`).join(' / '):`${sheet.date?sheet.date+' · ':''}${sheet.elements.length?`手工排版 · ${sheet.elements.length} 个元素`:'空白页'}`}</small>
              </button>)}
            </div>
          ) : (
            <p className="microcopy">这本笔记本还没有内页。</p>
          )}
          <div className="row">
            {book && (
              <button className="outline" onClick={() => startCover()}>
                <Settings />
                当前笔记本设置
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
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
