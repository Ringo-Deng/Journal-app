import { createContext, useContext, useMemo } from "react";
import {
  BOOK,
  bookGeometry,
  stackTop,
  sampleSheet,
  coverHeight,
  coverPose,
  nextBookTurn,
  type BookPosition,
} from "@/lib/book3d-motion";
import type { CoverMaterial } from "./cover-materials";

export type Book3DContent = {
  id: string;
  title: string;
  color: string;
  material: CoverMaterial;
  ratio: number;
  leaves: number;
  initialLeaf: number;
  startOpen: boolean;
  page: (index: number) => HTMLCanvasElement;
  cover: () => HTMLCanvasElement;
  prepare: (leaf: number) => Promise<void>;
};
export type Book3DHandle = { next(): void; prev(): void };
export const BookSceneContext = createContext<Book3DContent | undefined>(undefined);
export function useBookScene() {
  const content = useContext(BookSceneContext);
  return useMemo(() => {
    const geometry = content ? bookGeometry(content.leaves, content.ratio) : BOOK;
    return {
      BOOK: geometry,
      content,
      stackTop: (count: number) => stackTop(count, geometry),
      sampleSheet: (progress: number, leaf: number) => sampleSheet(progress, leaf, geometry),
      coverHeight: (side: "above" | "below") => coverHeight(side, geometry),
      coverPose: (progress: number, side: "front" | "back") => coverPose(progress, side, geometry),
      nextBookTurn: (position: BookPosition, direction: -1 | 1) =>
        nextBookTurn(position, direction, geometry.leaves),
    };
  }, [content]);
}
