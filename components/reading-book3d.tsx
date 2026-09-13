"use client";
import {
  Component,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Book3DView from "./book3d/Book3DView";
import { createReadingTextures } from "./book3d/reading-textures";
import { type Book3DContent, type Book3DHandle } from "./book3d/book-scene-context";
import { usePageTurnSound } from "./book3d/use-page-turn-sound";
import { bookFormat, coverInfo, type Book, type Asset } from "@/lib/journal";
import { stationerySpineColor } from "@/lib/stationery-cover";
import { readingBookPlan } from "@/lib/reading-book-plan";
import type { BookPosition } from "@/lib/book3d-motion";
export type ReadingBook3DHandle = Book3DHandle;
class ReaderBoundary extends Component<
  { children: ReactNode; onError: (error?: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default forwardRef<
  Book3DHandle,
  {
    toolbar?: HTMLDivElement | null;
    book: Book;
    assets: Asset[];
    readingIndex: number;
    startOpen: boolean;
    onReadingIndex: (index: number) => void;
    onPosition: (position: BookPosition) => void;
    onError: (error?: unknown) => void;
  }
>(function ReadingBook3D(props, ref) {
  const { book, assets } = props;
  const latest = useRef(props);
  latest.current = props;
  const [content, setContent] = useState<Book3DContent>();
  useEffect(() => {
    const source = createReadingTextures(book, assets);
    const plan = readingBookPlan(book.spreads.length, !!book.flyleaf);
    const material = coverInfo(book.cover);
    const stationery = !book.coverAsset && material.material.id === "linen";
    const custom = !book.coverAsset && material.material.id === "custom";
    setContent({
      id: crypto.randomUUID(),
      title: book.title || "拾光集",
      color: material.colorway.color,
      spineColor: stationery ? stationerySpineColor(material.colorway.color) : undefined,
      plainSpine: stationery || custom,
      plainCover: custom,
      // Use the smooth physical-material path for the stationery editions so the
      // generic cloth normal/roughness maps cannot make the checks look dirty.
      material: stationery
        ? "leather"
        : ["linen", "canvas"].includes(material.material.id)
          ? "fabric"
          : "leather",
      ratio: bookFormat(book).ratio,
      leaves: plan.leaves,
      initialLeaf: plan.leafForReading(latest.current.readingIndex),
      startOpen: latest.current.startOpen,
      page: source.page,
      cover: source.cover,
      prepare: source.prepare,
    });
    return () => source.dispose();
  }, [book, assets]);
  const fail = useCallback((error?: unknown) => latest.current.onError(error), []);
  const playPageTurnSound = usePageTurnSound();
  const position = useCallback((value: BookPosition) => {
    latest.current.onPosition(value);
    if (value.opened) {
      const plan = readingBookPlan(
        latest.current.book.spreads.length,
        !!latest.current.book.flyleaf,
      );
      const index = plan.readingForLeaf(value.turned);
      if (index !== latest.current.readingIndex) latest.current.onReadingIndex(index);
    }
  }, []);
  if (!content) return <p role="status">正在准备手帐…</p>;
  return (
    <ReaderBoundary onError={fail}>
      <Book3DView
        key={content.id}
        content={content}
        initialPaperStyle="bound"
        toolbar={props.toolbar}
        ref={ref}
        onPageTurnStart={playPageTurnSound}
        onPosition={position}
        onError={fail}
      />
    </ReaderBoundary>
  );
});
