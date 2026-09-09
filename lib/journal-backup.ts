import type { Book } from './journal';

/** Keep page and image references intact while giving restored notebooks new identities. */
export function copyNotebooks(books: Book[], suffix: string): Book[] {
  return books.map(book => ({ ...structuredClone(book), id: crypto.randomUUID(), title: `${book.title || '未命名笔记本'} · ${suffix}` }));
}

/** Include every uploaded image in the notebook, including non-body pages. */
export function notebookUploads(books: Book[]): string[] {
  const paths = new Set<string>();
  const add = (src?: string) => { if (src?.startsWith('/uploads/')) paths.add(src); };
  for (const book of books) {
    for(const t of book.collageTemplates||[])for(const p of t.elements){add(p.src);add(p.photoOriginal);}
    add(book.coverAsset);
    add(book.paperBg?.src);
    for (const template of book.paperTemplates || []) add(template.src);
    for (const spread of [...book.spreads, ...(book.flyleaf ? [book.flyleaf] : [])]) {
      add(spread.paperBg?.src);
      add(spread.pages?.left?.paperBg?.src);
      add(spread.pages?.right?.paperBg?.src);
      for (const day of spread.days) for (const photo of day.photos) add(photo);
      for (const piece of spread.elements) { add(piece.src); add(piece.photoOriginal); }
    }
  }
  return [...paths];
}

export function remapNotebookUploads(book: Book, mapping: Record<string, string>): Book {
  const next = structuredClone(book);
  const remap = (src: string) => mapping[src] || src;
  for(const t of next.collageTemplates||[])for(const p of t.elements){if(p.src)p.src=remap(p.src);if(p.photoOriginal)p.photoOriginal=remap(p.photoOriginal);}
  if (next.coverAsset) next.coverAsset = remap(next.coverAsset);
  if (next.paperBg) next.paperBg.src = remap(next.paperBg.src);
  for (const template of next.paperTemplates || []) template.src = remap(template.src);
  for (const spread of [...next.spreads, ...(next.flyleaf ? [next.flyleaf] : [])]) {
    if (spread.paperBg) spread.paperBg.src = remap(spread.paperBg.src);
    for(const page of [spread.pages?.left,spread.pages?.right])if(page?.paperBg)page.paperBg.src=remap(page.paperBg.src);
    for (const day of spread.days) day.photos = day.photos.map(remap);
    for (const piece of spread.elements) {
      if (piece.src) piece.src = remap(piece.src);
      if (piece.photoOriginal) piece.photoOriginal = remap(piece.photoOriginal);
    }
  }
  return next;
}
