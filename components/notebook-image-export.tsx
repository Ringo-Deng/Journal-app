'use client';
/* oxlint-disable next/no-img-element -- Preview the locally generated PNG without image optimization. */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SpreadPreview } from './page-turn';
import { bookFormat, type Book, type Asset } from '@/lib/journal';
import { exportFontCSS } from '@/lib/export-fonts';
import {
  createImageExportZip, imageExportArchiveFilename, imageExportCrop, imageExportFilename,
  imageExportPageLabel, orderedImageExportPages, type ImageExportPage, type ImageExportSide,
} from '@/lib/image-export';
import { toCanvas } from '../vendor/html-to-image/es/index';

type Source = { book: Book; assets: Asset[]; page: ImageExportPage };
type Result = { url: string; filename: string; count: number };

export default function NotebookImageExport({ book, assets, pages, open, onClose }: {
  book: Book; assets: Asset[]; pages: ImageExportPage[]; open: boolean; onClose: () => void;
}) {
  const paper = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const operation = useRef(0);
  const resultURL = useRef('');
  const [side, setSide] = useState<ImageExportSide>('spread');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const orderedPages = orderedImageExportPages(pages);
  const selectionKey = orderedPages.map(page => `${page.spread.id}:${page.pageIndex}:${page.flyleaf}`).join('|');
  const clearResult = useCallback(() => {
    if (resultURL.current) URL.revokeObjectURL(resultURL.current);
    resultURL.current = '';
    setResult(null);
  }, []);

  useEffect(() => {
    operation.current++;
    inFlight.current = false;
    setBusy(false);
    setSource(null);
    setError('');
    setProgress('');
    clearResult();
  }, [book.id, selectionKey, open, clearResult]);
  useEffect(() => () => {
    operation.current++;
    if (resultURL.current) URL.revokeObjectURL(resultURL.current);
  }, []);

  async function generate() {
    if (inFlight.current || !open || !orderedPages.length) return;
    inFlight.current = true;
    const token = ++operation.current;
    setBusy(true);
    setError('');
    clearResult();
    let currentLabel = '所选页面';
    try {
      // Freeze the chosen pages and their contents for this export operation.
      const snapshot = structuredClone({ book, assets, pages: orderedPages });
      const entries: { name: string; blob: Blob }[] = [];
      for (let index = 0; index < snapshot.pages.length; index++) {
        if (operation.current !== token) return;
        const page = snapshot.pages[index];
        currentLabel = imageExportPageLabel(page);
        setProgress(`正在生成 ${index + 1} / ${snapshot.pages.length}：${currentLabel}`);
        // Only one paper exists at a time. flushSync makes its DOM match this page
        // before image decoding and capture begin; no timeout can capture the old page.
        flushSync(() => setSource({ book: snapshot.book, assets: snapshot.assets, page }));
        const node = paper.current;
        if (!node) throw Error('纸面预览尚未准备好，请重试');
        const captureRoot = node.firstElementChild as HTMLElement | null;
        if (captureRoot) Object.assign(captureRoot.style, { width: '100%', height: '100%' });
        await document.fonts.ready;
        await Promise.all(Array.from(node.querySelectorAll('img')).map(img => img.decode().catch(() => {
          throw Error('页面中的图片未能读取，请恢复图片后重试');
        })));
        const fontEmbedCSS = await exportFontCSS(page.spread.elements);
        if (operation.current !== token) return;
        const full = await toCanvas(node, {
          pixelRatio: 2, fontEmbedCSS, backgroundColor: '#fff',
          style: { position: 'relative', left: '0', top: '0', insetInlineStart: '0', insetBlockStart: '0', margin: '0', transform: 'none', containerType: 'normal' },
        });
        if (operation.current !== token) return;
        const crop = imageExportCrop(full.width, full.height, side);
        const output = document.createElement('canvas');
        output.width = crop.width;
        output.height = crop.height;
        const context = output.getContext('2d');
        if (!context) throw Error('浏览器无法生成图片');
        context.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        const blob = await new Promise<Blob>((resolve, reject) => {
          output.toBlob(value => value ? resolve(value) : reject(Error('PNG 图片生成失败')), 'image/png');
        });
        entries.push({ name: imageExportFilename(snapshot.book.title, page, side), blob });
      }
      if (operation.current !== token) return;
      currentLabel = '图片压缩包';
      if (entries.length > 1) setProgress(`正在打包 ${entries.length} 张图片…`);
      const blob = entries.length === 1 ? entries[0].blob : await createImageExportZip(entries);
      if (operation.current !== token) return;
      const url = URL.createObjectURL(blob);
      resultURL.current = url;
      setResult({
        url,
        filename: entries.length === 1 ? entries[0].name : imageExportArchiveFilename(snapshot.book.title, side),
        count: entries.length,
      });
    } catch (cause) {
      if (operation.current !== token) return;
      const message = (cause instanceof Error ? cause.message : '请重试').replace(/[。.!！?？\s]+$/u, '');
      setError(`${currentLabel}生成失败：${message}。本次未生成下载文件，所选页面已保留。`);
    } finally {
      if (operation.current === token) {
        inFlight.current = false;
        setBusy(false);
        setSource(null);
        setProgress('');
      }
    }
  }

  return <Dialog open={open} onOpenChange={value => !value && !inFlight.current && onClose()}>
    <DialogContent className="journal-dialog image-export-dialog" showCloseButton={!busy}>
      <DialogTitle>导出笔记图片</DialogTitle>
      <DialogDescription>已选 {orderedPages.length} 个页面，保留文字、照片和排版。{orderedPages.length > 1 ? '每个页面生成一张高清 PNG，按笔记本顺序打包下载。' : '保存为高清 PNG 图片。'}</DialogDescription>
      {!orderedPages.length && <p role="status">所选页面已不存在，请关闭后重新选择。</p>}
      <label className="export-scope">导出范围<select value={side} disabled={busy} onChange={event => { setSide(event.target.value as ImageExportSide); clearResult(); setError(''); }}>
        <option value="spread">左右两页</option><option value="left">仅左页</option><option value="right">仅右页</option>
      </select></label>
      {result?.count === 1 && <img className="export-image-preview" src={result.url} alt="导出图片预览" />}
      {result && result.count > 1 && <p role="status">已生成 {result.count} 张 PNG 图片，可下载压缩包。</p>}
      {progress && <p role="status" aria-live="polite">{progress}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="delete-notebook-actions">
        <button className="outline" disabled={busy} onClick={() => !inFlight.current && onClose()}>关闭</button>
        {result ? <a className="primary" href={result.url} download={result.filename}>{result.count === 1 ? '保存 PNG 图片' : `下载 ${result.count} 张图片（ZIP）`}</a> :
          <button className="primary" disabled={busy || !orderedPages.length} onClick={() => void generate()}>{busy ? '正在生成…' : error ? '重新生成' : '生成图片'}</button>}
      </div>
      {source && <div className="image-export-source" ref={paper} aria-hidden="true" inert style={{ width: 1000, height: 1000 / bookFormat(source.book).ratio, '--spread-ratio': bookFormat(source.book).ratio } as CSSProperties}>
        <SpreadPreview book={source.book} spread={source.page.spread} assets={source.assets} flyleaf={source.page.flyleaf} pageIndex={source.page.pageIndex} />
      </div>}
    </DialogContent>
  </Dialog>;
}
