'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import StationeryCover from '@/components/stationery-cover';
import { bookFormat, coverInfo, type Book } from '@/lib/journal';
import './journal-history.css';

type HistoryEntry = {
  id: string;
  createdAt: string;
  reason: 'daily' | 'before-delete';
  bookCount: number;
  spreadCount: number;
  titles: string[];
};
type Snapshot = HistoryEntry & { books: Book[] };
type Props = { open: boolean; onClose: () => void; onRestore: (books: Book[]) => Promise<void> };

async function request<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', signal });
  const result = await response.json();
  if (!response.ok) throw Error((result as { error?: string }).error || '历史备份读取失败，请重试。');
  return result as T;
}

export default function JournalHistory({ open, onClose, onRestore }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setWarning(''); setSelected(''); setSnapshot(null); setEntries([]);
    void request<{ entries: HistoryEntry[]; warning?: string }>('/api/history', controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        setEntries(result.entries); setWarning(result.warning || ''); setSelected(result.entries[0]?.id || '');
      })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, reload]);

  useEffect(() => {
    if (!open || !selected) return;
    const controller = new AbortController();
    setPreviewLoading(true); setSnapshot(null); setError('');
    void request<Snapshot>(`/api/history/${encodeURIComponent(selected)}`, controller.signal)
      .then(result => { if (!controller.signal.aborted) setSnapshot(result); })
      .catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    return () => controller.abort();
  }, [open, selected]);

  async function restore() {
    if (!snapshot || snapshot.id !== selected || restoring) return;
    setRestoring(true); setError('');
    try { await onRestore(structuredClone(snapshot.books)); onClose(); }
    catch (cause) { setError((cause as Error).message || '恢复未完成，请重试。'); }
    finally { setRestoring(false); }
  }

  return <Dialog open={open} onOpenChange={value => { if (!value && !restoring) onClose(); }}>
    <DialogContent className="journal-dialog journal-history-dialog" showCloseButton={!restoring}>
      <DialogTitle>历史备份</DialogTitle>
      <DialogDescription>每天首次保存、删除笔记本或跨页前自动留存，自动快照最多保留 30 份；完整备份恢复的历史另外保留。选好时间后，将当时的笔记本恢复为副本。</DialogDescription>
      {warning && <p className="microcopy" role="status">{warning}</p>}
      {error && <p className="history-error" role="alert">{error} <button className="quiet" disabled={restoring} onClick={() => setReload(value => value + 1)}>重新加载</button></p>}
      {loading ? <p role="status">正在读取历史备份…</p> : !entries.length && !error ? <p className="microcopy">还没有历史备份。已有笔记本在下一次保存时会自动留存。</p> : null}
      {!!entries.length && <div className="journal-history-layout">
        <div className="journal-history-list" role="group" aria-label="选择备份时间">
          {entries.map(entry => <button key={entry.id} className={`history-entry ${selected === entry.id ? 'active' : ''}`} aria-pressed={selected === entry.id} disabled={restoring} onClick={() => setSelected(entry.id)}>
            <strong>{new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false })}</strong>
            <span>{entry.reason === 'before-delete' ? '删除前备份' : '每日备份'} · {entry.bookCount} 本 · {entry.spreadCount} 个跨页</span>
          </button>)}
        </div>
        <div className="journal-history-preview" aria-label="备份中的笔记本" aria-busy={previewLoading}>
          {previewLoading && <p role="status">正在预览…</p>}
          {snapshot?.books.map(book => {
            const info = coverInfo(book.cover);
            return <article className="history-book" key={book.id}>
              <div className={`library-cover history-cover texture-${info.material.id} format-${bookFormat(book).id}`} style={{ '--cover-base': info.colorway.color } as CSSProperties} aria-hidden="true">
                {book.coverAsset ? <img src={book.coverAsset} alt="" /> : info.material.id === 'linen' ? <StationeryCover title={book.title} color={info.colorway.color} /> : <span className="cover-title-stamp">{book.title}<i>SHIGUANG JOURNAL</i></span>}
              </div>
              <div><strong>{book.title}</strong><p>{book.spreads.length} 个跨页 · {book.spreads.reduce((count, spread) => count + spread.days.length, 0)} 篇记录</p></div>
            </article>;
          })}
        </div>
      </div>}
      <p className="microcopy">恢复会新增笔记本，保留你目前的内容。历史备份引用本机原图；迁移到其他电脑时，请使用“导出备份”。</p>
      <div className="journal-history-actions"><button className="outline" disabled={restoring} onClick={onClose}>关闭</button><button className="primary" disabled={!snapshot?.books.length || snapshot.id !== selected || previewLoading || restoring} onClick={() => void restore()}>{restoring ? '正在恢复…' : `恢复${snapshot ? ` ${snapshot.books.length} 本` : ''}为副本`}</button></div>
    </DialogContent>
  </Dialog>;
}
