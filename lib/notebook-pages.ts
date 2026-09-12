import type { Book } from './journal';

/** Remove only a regular spread; its image files remain available to undo/history. */
export function removeNotebookSpread(book: Book, spreadId: string): Book {
  if (!book.spreads.some(spread => spread.id === spreadId)) return book;
  return { ...book, spreads: book.spreads.filter(spread => spread.id !== spreadId) };
}

/** Keep the same sheet when earlier spreads disappear; otherwise use its next neighbour. */
export function pageAfterSpreadRemoval(before: Book, after: Book, page: number): number {
  if (page === -1 && after.flyleaf) return -1;
  const id = before.spreads[page]?.id;
  const retained = id ? after.spreads.findIndex(spread => spread.id === id) : -1;
  if (retained >= 0) return retained;
  return after.spreads.length ? Math.max(0, Math.min(page, after.spreads.length - 1)) : -1;
}
