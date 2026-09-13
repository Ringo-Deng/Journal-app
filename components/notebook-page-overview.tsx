"use client";

import { useState, type CSSProperties, type DragEvent } from "react";
import { Download, GripVertical, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { bookFormat, type Asset, type Book } from "@/lib/journal";
import NotebookImageExport from "./notebook-image-export";
import ReadingJpgImage from "./reading-jpg-image";
import "./notebook-page-overview.css";

type NotebookPageOverviewProps = {
  book: Book;
  assets: Asset[];
  currentPage: number | null;
  onSelect: (page: number | null) => void;
  onDelete: (spreadId: string) => void;
  onReorder: (spreadId: string, targetIndex: number) => void;
  disabled?: boolean;
  showCover?: boolean;
};

export default function NotebookPageOverview(props: NotebookPageOverviewProps) {
  return <PageOverview key={props.book.id} {...props} />;
}

function PageOverview({
  book,
  assets,
  currentPage,
  onSelect,
  onDelete,
  onReorder,
  disabled = false,
  showCover = false,
}: NotebookPageOverviewProps) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const offset = book.flyleaf ? 1 : 0;
  const sheets = [
    ...(book.flyleaf ? [{ spread: book.flyleaf, pageIndex: -1, flyleaf: true }] : []),
    ...book.spreads.map((spread, pageIndex) => ({ spread, pageIndex, flyleaf: false })),
  ];
  // Page identities survive reordering and deletion; only existing pages can be exported.
  const selectedPages = sheets.filter((sheet) => selectedIds.includes(sheet.spread.id));
  const allSelected = sheets.length > 0 && selectedPages.length === sheets.length;
  const deleteIndex = book.spreads.findIndex((spread) => spread.id === deleteId);
  const pendingDelete = deleteIndex >= 0 ? book.spreads[deleteIndex] : null;
  const blocked = disabled || exportOpen || !!pendingDelete;
  const draggingIndex = book.spreads.findIndex((spread) => spread.id === draggingId);

  function toggleSelection(id: string) {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  }

  function cancelSelection() {
    setSelecting(false);
    setSelectedIds([]);
  }

  function beginDrag(event: DragEvent<HTMLButtonElement>, spreadId: string) {
    if (blocked || selecting) {
      event.preventDefault();
      return;
    }
    setDraggingId(spreadId);
    setDragOverId(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", spreadId);
    const card = event.currentTarget.closest(".notebook-overview-card");
    if (card instanceof HTMLElement) {
      event.dataTransfer.setDragImage(card, card.offsetWidth / 2, 24);
    }
  }

  function dragOver(event: DragEvent<HTMLElement>, spreadId: string) {
    if (!draggingId || draggingId === spreadId || blocked || selecting) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverId(spreadId);
  }

  function dropOn(event: DragEvent<HTMLElement>, targetIndex: number) {
    event.preventDefault();
    const spreadId = draggingId || event.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setDragOverId(null);
    if (spreadId) onReorder(spreadId, targetIndex);
  }

  function endDrag() {
    setDraggingId(null);
    setDragOverId(null);
  }

  return (
    <div
      className="notebook-page-overview"
      data-page-overview="true"
      style={{ "--overview-spread-ratio": bookFormat(book).ratio } as CSSProperties}
    >
      <div className="notebook-overview-toolbar" aria-label="页面管理">
        <p className="notebook-overview-hint" role={selecting ? "status" : undefined}>
          {selecting
            ? `已选 ${selectedPages.length} 项`
            : book.spreads.length > 1
              ? "拖动缩略图左上角把手调整顺序；点击打开页面"
              : "点击缩略图打开页面"}
        </p>
        <div className="notebook-overview-actions">
          {selecting ? (
            <>
              <button
                type="button"
                className="outline"
                disabled={blocked || sheets.length === 0}
                onClick={() => setSelectedIds(allSelected ? [] : sheets.map((sheet) => sheet.spread.id))}
              >
                {allSelected ? "取消全选" : "全选"}
              </button>
              <button
                type="button"
                className="primary"
                disabled={blocked || selectedPages.length === 0}
                onClick={() => setExportOpen(true)}
              >
                <Download aria-hidden="true" />导出所选
              </button>
              <button type="button" className="quiet" disabled={blocked} onClick={cancelSelection}>
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="outline"
              disabled={blocked || sheets.length === 0}
              onClick={() => setSelecting(true)}
            >
              <Download aria-hidden="true" />选择导出
            </button>
          )}
        </div>
      </div>

      <div className="notebook-overview-grid" aria-label="全部页面">
        {showCover && (
          <article className="notebook-overview-card notebook-overview-cover">
            <button
              type="button"
              className="notebook-overview-open"
              disabled={blocked || selecting}
              aria-label={selecting ? "封面不参与图片导出" : "打开封面"}
              aria-current={!selecting && currentPage === null ? "page" : undefined}
              onClick={() => onSelect(null)}
            >
              <div className="notebook-overview-preview">
                <ReadingJpgImage book={book} assets={assets} index={null} alt="封面" />
              </div>
              <span className="notebook-overview-caption">封面</span>
            </button>
          </article>
        )}
        {sheets.map((sheet) => {
          const label = sheet.flyleaf ? "扉页" : `第 ${sheet.pageIndex + 1} 个跨页`;
          const selected = selectedIds.includes(sheet.spread.id);
          const isDragging = draggingId === sheet.spread.id;
          const isDragTarget = dragOverId === sheet.spread.id && draggingIndex >= 0;
          const dropAfter = isDragTarget && draggingIndex < sheet.pageIndex;
          return (
            <article
              className={`notebook-overview-card${selecting && selected ? " is-selected" : ""}${isDragging ? " is-dragging" : ""}${isDragTarget ? ` is-drag-target ${dropAfter ? "drop-after" : "drop-before"}` : ""}`}
              key={sheet.spread.id}
              onDragOver={sheet.flyleaf ? undefined : (event) => dragOver(event, sheet.spread.id)}
              onDrop={sheet.flyleaf ? undefined : (event) => dropOn(event, sheet.pageIndex)}
            >
              <button
                type="button"
                className="notebook-overview-open"
                disabled={blocked}
                aria-label={selecting ? `${selected ? "取消选择" : "选择"}${label}` : `打开${label}`}
                aria-pressed={selecting ? selected : undefined}
                aria-current={!selecting && currentPage === sheet.pageIndex ? "page" : undefined}
                onClick={() => selecting ? toggleSelection(sheet.spread.id) : onSelect(sheet.pageIndex)}
              >
                <div className="notebook-overview-preview">
                  <ReadingJpgImage
                    book={book}
                    assets={assets}
                    index={sheet.flyleaf ? 0 : sheet.pageIndex + offset}
                    alt={label}
                  />
                </div>
                <span className="notebook-overview-caption">{label}</span>
              </button>
              {!selecting && !sheet.flyleaf && book.spreads.length > 1 && (
                <button
                  type="button"
                  className="notebook-overview-drag-handle"
                  draggable={!blocked}
                  aria-label={`拖动${label}调整顺序`}
                  title="拖动调整顺序"
                  disabled={blocked}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => beginDrag(event, sheet.spread.id)}
                  onDragEnd={endDrag}
                  onKeyDown={(event) => {
                    const step = event.key === "ArrowLeft" || event.key === "ArrowUp"
                      ? -1
                      : event.key === "ArrowRight" || event.key === "ArrowDown"
                        ? 1
                        : 0;
                    if (!step) return;
                    event.preventDefault();
                    onReorder(sheet.spread.id, sheet.pageIndex + step);
                  }}
                >
                  <GripVertical aria-hidden="true" />
                </button>
              )}
              {selecting ? (
                <label className="notebook-overview-checkbox">
                  <input
                    type="checkbox"
                    aria-label={`导出${label}`}
                    checked={selected}
                    disabled={blocked}
                    onChange={() => toggleSelection(sheet.spread.id)}
                  />
                </label>
              ) : !sheet.flyleaf && (
                <button
                  type="button"
                  className="notebook-overview-delete"
                  aria-label={`删除${label}`}
                  title={`删除${label}`}
                  disabled={blocked}
                  onClick={() => setDeleteId(sheet.spread.id)}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              )}
            </article>
          );
        })}
        {!showCover && sheets.length === 0 && (
          <p className="notebook-overview-empty">这本手帐还没有内页。</p>
        )}
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="journal-dialog notebook-overview-delete-dialog">
          <DialogTitle>删除第 {deleteIndex + 1} 个跨页？</DialogTitle>
          <DialogDescription>
            这个跨页的左右两页及其中的文字、照片和素材都将删除。删除后可以在编辑模式中撤销，也可以从历史快照恢复。
          </DialogDescription>
          <div className="delete-notebook-actions">
            <button type="button" className="outline" onClick={() => setDeleteId(null)}>取消</button>
            <button
              type="button"
              className="delete-confirm"
              disabled={disabled || !pendingDelete}
              onClick={() => {
                if (!pendingDelete || disabled) return;
                onDelete(pendingDelete.id);
                setDeleteId(null);
              }}
            >
              删除跨页
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {exportOpen && (
        <NotebookImageExport
          book={book}
          assets={assets}
          pages={selectedPages}
          open={exportOpen}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
