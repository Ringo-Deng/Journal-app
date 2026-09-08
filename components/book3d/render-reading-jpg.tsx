import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { SpreadPreview } from "../page-turn";
import { bookFormat, coverInfo, type Book, type Asset } from "@/lib/journal";
import { exportFontCSS } from "@/lib/export-fonts";
import { toCanvas } from "../../vendor/html-to-image/es/index";

/** Loaded only for missing/outdated JPGs; disposed before the image is shown. */
export async function renderReadingJpg(book: Book, assets: Asset[], index: number | null) {
  const width = 2000;
  const height = Math.round(width / bookFormat(book).ratio);
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // Keep off-screen placement OUTSIDE the captured node. Cloned logical inset
  // properties can otherwise override left/top and move the entire JPG off canvas.
  const offscreen = document.createElement("div");
  offscreen.inert = true;
  Object.assign(offscreen.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    pointerEvents: "none",
  });
  host.className = "reading-jpg-source";
  Object.assign(host.style, {
    position: "relative",
    left: "0",
    top: "0",
    width: `${index === null ? width / 2 : width}px`,
    height: `${height}px`,
    pointerEvents: "none",
    containerType: "inline-size",
  });
  offscreen.appendChild(host);
  document.body.appendChild(offscreen);
  const root = createRoot(host);
  try {
    const cover = coverInfo(book.cover);
    const art = book.coverAsset
      ? assets.find((a) => a.originalSrc === book.coverAsset)?.src || book.coverAsset
      : "";
    const sheet =
      index === null
        ? undefined
        : [...(book.flyleaf ? [book.flyleaf] : []), ...book.spreads][index];
    const flyleaf = !!book.flyleaf && index === 0;
    flushSync(() =>
      root.render(
        index === null ? (
          <div
            className={`reading-texture-cover texture-${cover.material.id}`}
            style={
              {
                "--cover-base": cover.colorway.color,
                backgroundColor: cover.colorway.color,
                width: "100%",
                height: "100%",
                position: "relative",
                overflow: "hidden",
              } as CSSProperties
            }
          >
            {art ? (
              <img src={art} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span className="cover-title-stamp">
                {book.title || "拾光集"}
                <i>SHIGUANG JOURNAL</i>
              </span>
            )}
          </div>
        ) : sheet ? (
          <SpreadPreview
            book={book}
            spread={sheet}
            assets={assets}
            flyleaf={flyleaf}
            pageIndex={flyleaf ? undefined : index! - (book.flyleaf ? 1 : 0)}
          />
        ) : null,
      ),
    );
    await document.fonts.ready;
    await Promise.all(Array.from(host.querySelectorAll("img")).map((img) => img.decode()));
    const fontEmbedCSS = sheet ? await exportFontCSS(sheet.elements) : "";
    const canvas = await toCanvas(host, {
      pixelRatio: 1,
      fontEmbedCSS,
      backgroundColor: "#fff",
      style: {
        position: "relative",
        left: "0",
        top: "0",
        insetInlineStart: "0",
        insetBlockStart: "0",
        margin: "0",
        transform: "none",
        containerType: "normal",
      },
    });
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error("JPG 保存失败"))),
        "image/jpeg",
        0.94,
      ),
    );
  } finally {
    root.unmount();
    offscreen.remove();
  }
}
