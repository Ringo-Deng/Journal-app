'use client';
/* oxlint-disable next/no-img-element -- User photographs are served by the local journal service. */
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SpreadPreview } from './page-turn';
import { bookFormat, type Book, type BookFormat } from '@/lib/journal';
import { chronologicalPhotos, createPhotoBook, MAX_PHOTO_BOOK_PHOTOS, photoBookStyles, type PhotoBookPhoto, type PhotoBookStyle } from '@/lib/photo-book';
import './photo-book-creator.css';

export default function PhotoBookCreator({ initialPhotos, onClose, onCreate }: {
  initialPhotos: PhotoBookPhoto[]; onClose: () => void; onCreate: (book: Book) => Promise<void>;
}) {
  const [photos, setPhotos] = useState(() => [...initialPhotos]);
  const [title, setTitle] = useState('我的照片手帐');
  const [style, setStyle] = useState<PhotoBookStyle>('cream');
  const [format, setFormat] = useState<BookFormat>('standard');
  const [stage, setStage] = useState<'photos' | 'preview'>('photos');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const working = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const draft = useMemo(() => {
    if (!photos.length || stage !== 'preview') return { book: null, error: '' };
    try { return { book: createPhotoBook({ photos, title, style, format }), error: '' }; }
    catch (cause) { return { book: null, error: (cause as Error).message }; }
  }, [photos, title, style, format, stage]);
  const previewPage = draft.book ? Math.min(page, draft.book.spreads.length - 1) : 0;

  async function importFiles(files: FileList | null) {
    if (!files?.length || working.current) return;
    if (photos.length + files.length > MAX_PHOTO_BOOK_PHOTOS) { setError(`单本最多 ${MAX_PHOTO_BOOK_PHOTOS} 张。请减少本次选择；没有截掉或导入任何照片。`); return; }
    working.current = true; setBusy(true); setError('');
    const added: PhotoBookPhoto[] = [], failed: string[] = [];
    try {
      for (const [index, file] of Array.from(files).entries()) {
        setMessage(`正在导入 ${index + 1} / ${files.length}：${file.name}`);
        try {
          if (file.size > 80 * 1024 * 1024) throw Error('单张照片不能超过 80 MB');
          const params = new URLSearchParams({ filename: file.name, lastModified: String(file.lastModified) });
          const response = await fetch('/api/photos/import?' + params, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
          const data = await response.json() as { item?: PhotoBookPhoto; error?: string };
          if (!response.ok || !data.item) throw Error(data.error || '导入失败');
          added.push(data.item);
        } catch (cause) { failed.push(`${file.name}：${(cause as Error).message}`); }
      }
      // Repeated selections remain explicit occurrences; storage may deduplicate the underlying file.
      setPhotos(current => [...current, ...added]);
      setMessage(`已导入 ${added.length} 张，每张都会进入正文。`);
      if (failed.length) setError(`${failed.length} 张导入失败，未生成手帐。请重新选择失败照片：${failed.join('；')}`);
    } finally { working.current = false; setBusy(false); if (input.current) input.current.value = ''; }
  }
  function move(index: number, delta: number) {
    setPhotos(current => { const next = [...current], target = index + delta; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  async function save() {
    if (working.current || !draft.book) return;
    working.current = true; setBusy(true); setError('');
    try { await onCreate(draft.book); }
    catch (cause) { setError((cause as Error).message); }
    finally { working.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !working.current) onClose(); }}>
    <DialogContent className="journal-dialog photo-book-dialog" showCloseButton={!busy}>
      <DialogTitle>从照片做一本</DialogTitle>
      <DialogDescription>选一组照片，让它们成为一本可以继续编辑的手帐。</DialogDescription>
      <div className="photo-book-steps"><span aria-current={stage === 'photos' ? 'step' : undefined}>1 选择照片</span><span aria-current={stage === 'preview' ? 'step' : undefined}>2 整册预览</span></div>
      {stage === 'photos' ? <>
        <div className="photo-book-actions"><button className="primary" disabled={busy} onClick={() => input.current?.click()}><ImagePlus/>导入照片</button>
          <button className="outline" disabled={busy || photos.length < 2} onClick={() => setPhotos(current => chronologicalPhotos(current))}>按时间从早到晚</button><span>{photos.length} 张 · 当前顺序</span></div>
        <p className="microcopy">按下面的顺序排入正文，可用箭头调整。取消成册后，已导入的原片仍在照片库。</p>
        <div className="photo-book-photos">{photos.map((photo, index) => <div className="photo-book-photo" key={`${photo.id}-${index}`}>
          <img src={photo.thumbnailSrc || photo.src} alt={photo.originalName || `照片 ${index + 1}`} loading="lazy"/>
          <span>{index + 1}</span><div><button className="quiet" aria-label={`前移照片 ${index + 1}`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ChevronLeft/></button><button className="quiet" aria-label={`后移照片 ${index + 1}`} disabled={busy || index === photos.length - 1} onClick={() => move(index, 1)}><ChevronRight/></button><button className="quiet" aria-label={`移出照片 ${index + 1}`} disabled={busy} onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}><X/></button></div>
        </div>)}</div>
        {!photos.length && <div className="photo-book-empty">旅行、日常或某个纪念日，从几张照片开始。</div>}
      </> : <>
        <div className="photo-book-fields"><label className="field"><span>手帐名称</span><input value={title} maxLength={20} disabled={busy} onChange={event => setTitle(event.target.value)}/></label><label className="field"><span>开本</span><select value={format} disabled={busy} onChange={event => { setFormat(event.target.value as BookFormat); setPage(0); }}><option value="standard">常规</option><option value="tn-regular">Travel Notes</option></select></label></div>
        <div className="photo-book-styles" aria-label="整册风格">{photoBookStyles.map(item => <button className={style === item.id ? 'chosen' : ''} key={item.id} disabled={busy} aria-pressed={style === item.id} onClick={() => { setStyle(item.id); setPage(0); }}><span className="photo-book-swatch" style={{ background: item.paper, borderLeftColor: item.accent }}/><strong>{item.name}</strong><small>{item.detail}</small></button>)}</div>
        {draft.book && <>
          <div className="photo-book-preview" style={{ aspectRatio: bookFormat(draft.book).ratio, '--photo-book-ratio': bookFormat(draft.book).ratio } as CSSProperties}><SpreadPreview book={draft.book} spread={draft.book.spreads[previewPage]} assets={[]} pageIndex={previewPage}/></div>
          <div className="photo-book-pagination"><button className="quiet" aria-label="预览上一跨页" disabled={busy || previewPage === 0} onClick={() => setPage(previewPage - 1)}><ChevronLeft/></button><span>{previewPage + 1} / {draft.book.spreads.length} 个跨页</span><button className="quiet" aria-label="预览下一跨页" disabled={busy || previewPage === draft.book.spreads.length - 1} onClick={() => setPage(previewPage + 1)}><ChevronRight/></button></div>
          <p className="microcopy">全部 {photos.length} 张照片已排入正文。封面沿用拾光材质，另附标题扉页；照片、文字和纸胶带都能继续编辑。</p>
        </>}
      </>}
      {message && <p className="photo-book-status" role="status">{message}</p>}
      {(error || draft.error) && <p className="photo-book-error" role="alert">{error || draft.error}</p>}
      <footer className="photo-book-actions"><button className="outline" disabled={busy} onClick={stage === 'photos' ? onClose : () => { setStage('photos'); setError(''); }}> {stage === 'photos' ? '取消' : '返回选照片'}</button>
        {stage === 'photos' ? <button className="primary" disabled={busy || !photos.length || !!error} onClick={() => { setStage('preview'); setPage(0); setMessage(''); }}>预览整本</button> : <button className="primary" disabled={busy || !draft.book} onClick={() => void save()}>{busy && <Loader2 className="spinning"/>}{busy ? '正在创建…' : '创建并自由编辑'}</button>}
      </footer>
      <input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={event => void importFiles(event.target.files)}/>
    </DialogContent>
  </Dialog>;
}
