import type { Book } from './journal';

/** Remove only a regular spread; its image files remain available to undo/history. */
export function removeNotebookSpread(book: Book, spreadId: string): Book {
  if (!book.spreads.some(spread => spread.id === spreadId)) return book;
  return { ...book, spreads: book.spreads.filter(spread => spread.id !== spreadId) };
}

/** Move one regular spread to the position of another without touching either page's contents. */
export function reorderNotebookSpread(book: Book, spreadId: string, targetIndex: number): Book {
  const sourceIndex = book.spreads.findIndex(spread => spread.id === spreadId);
  if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return book;
  const boundedTarget = Math.max(0, Math.min(targetIndex, book.spreads.length - 1));
  if (sourceIndex === boundedTarget) return book;
  const spreads = [...book.spreads];
  const [spread] = spreads.splice(sourceIndex, 1);
  spreads.splice(boundedTarget, 0, spread);
  return { ...book, spreads };
}

/** Follow the same spread by identity after it moves to a different page number. */
export function pageAfterSpreadReorder(before: Book, after: Book, page: number): number {
  if (page < 0) return -1;
  const id = before.spreads[page]?.id;
  const relocated = id ? after.spreads.findIndex(spread => spread.id === id) : -1;
  if (relocated >= 0) return relocated;
  return after.spreads.length ? Math.max(0, Math.min(page, after.spreads.length - 1)) : -1;
}

/** Keep the same sheet when earlier spreads disappear; otherwise use its next neighbour. */
export function pageAfterSpreadRemoval(before: Book, after: Book, page: number): number {
  if (page === -1 && after.flyleaf) return -1;
  const id = before.spreads[page]?.id;
  const retained = id ? after.spreads.findIndex(spread => spread.id === id) : -1;
  if (retained >= 0) return retained;
  return after.spreads.length ? Math.max(0, Math.min(page, after.spreads.length - 1)) : -1;
}
