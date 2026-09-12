import { CanvasTexture, SRGBColorSpace } from "three";
import { stationeryPaletteForColor } from "@/lib/stationery-cover";

export type CoverMaterial = "leather" | "fabric";
export const COVER_MATERIALS = {
  leather: {
    label: "牛皮",
    color: "#806049",
    edge: "#73523e",
    ink: "#e4cfaa",
    roughness: 0.82,
    bump: 0.0015,
    sheen: 0.025,
    clearcoat: 0.04,
  },
  fabric: {
    label: "布艺",
    color: "#c7bca5",
    edge: "#aca18b",
    ink: "#535548",
    roughness: 0.98,
    bump: 0.004,
    sheen: 0.38,
    clearcoat: 0,
  },
} as const;

/** Nonperiodic fine grain. No sine-wave bands or large-scale mottling on leather. */
function hash(x: number, y: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
function softNoise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
  const bottom = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}
function grain(x: number, y: number, kind: CoverMaterial) {
  const fine = hash(x, y);
  if (kind === "fabric") {
    const warp = Math.cos((x * Math.PI) / 3),
      weft = Math.cos((y * Math.PI) / 3);
    const crossing = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0;
    return (
      0.5 +
      (crossing ? warp * 0.09 + weft * 0.035 : warp * 0.035 + weft * 0.09) +
      (fine - 0.5) * 0.06
    );
  }
  return 0.5 + (softNoise(x / 2, y / 2) - 0.5) * 0.2 + (fine - 0.5) * 0.05;
}

export function createCoverTextures(kind: CoverMaterial, color?: string) {
  const settings = { ...COVER_MATERIALS[kind], ...(color ? { color } : {}) };
  // All built-in stationery colours share one clean physical-cover treatment.
  const stationeryPalette = stationeryPaletteForColor(settings.color);
  const blueStationery = stationeryPalette?.base === "#91a9b5";
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = stationeryPalette ? 1152 : 1024;
  const ctx = canvas.getContext("2d")!;
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = canvas.width;
  bumpCanvas.height = canvas.height;
  const bumpCtx = bumpCanvas.getContext("2d")!;

  if (blueStationery) {
    // Map only the flat face of regular-blue-notes.svg (124,64)-(540,741).
    // Its five cream columns, weave and label exclude the illustrated book furniture.
    ctx.save();
    ctx.scale(canvas.width / 416, canvas.height / 677);
    ctx.translate(-124, -64);
    ctx.fillStyle = "#849dad";
    ctx.fillRect(124, 64, 416, 677);
    const threads: [number, number, string, number, number][] = [
      [29, 13, "#fff1d7", 0.73, 80],
      [9, 1.5, "#617f92", 0.22, 80],
      [67, 1.5, "#617f92", 0.22, 80],
      [37, 2, "#fff1d7", 0.35, 80],
      [0.5, 0.7, "#fffdf0", 0.19, 6],
      [3.5, 0.55, "#617f92", 0.13, 6],
    ];
    for (const [offset, width, color, opacity, step] of threads) {
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      // Fill both axes together so intersections keep the reference's even tone.
      ctx.beginPath();
      for (let x = offset; x < 540; x += step) ctx.rect(x - width / 2, 64, width, 677);
      for (let y = offset; y < 741; y += step) ctx.rect(124, y - width / 2, 416, width);
      ctx.fill();
    }
    ctx.restore();
    bumpCtx.fillStyle = "#808080";
    bumpCtx.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);
  } else if (stationeryPalette) {
    // Match the plaid proportions used by the stationery face in every colourway.
    const scale = canvas.width / 600;
    const step = 56 * scale;
    const stripe = 16 * scale;
    ctx.fillStyle = stationeryPalette.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = stationeryPalette.band;
    for (let x = 0; x < canvas.width; x += step * 2) ctx.fillRect(x, 0, step, canvas.height);
    for (let y = 0; y < canvas.height; y += step * 2) ctx.fillRect(0, y, canvas.width, step);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = stationeryPalette.light;
    for (let x = 0; x < canvas.width; x += step) ctx.fillRect(x - stripe / 2, 0, stripe, canvas.height);
    for (let y = 0; y < canvas.height; y += step) ctx.fillRect(0, y - stripe / 2, canvas.width, stripe);
    ctx.globalAlpha = 1;
    bumpCtx.fillStyle = "#808080";
    bumpCtx.fillRect(0, 0, bumpCanvas.width, bumpCanvas.height);
  } else {
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    const bumps = bumpCtx.createImageData(canvas.width, canvas.height);
    const base = [1, 3, 5].map((offset) => parseInt(settings.color.slice(offset, offset + 2), 16));
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const value = grain(x, y, kind);
        const i = (y * canvas.width + x) * 4;
        const tone = (value - 0.5) * (kind === "leather" ? 10 : 12);
        for (let c = 0; c < 3; c++) {
          pixels.data[i + c] = base[c] + tone;
          bumps.data[i + c] = Math.round(value * 255);
        }
        pixels.data[i + 3] = bumps.data[i + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    bumpCtx.putImageData(bumps, 0, 0);
  }

  // Copy the unlabelled fabric before adding front-only artwork.
  const backCanvas = document.createElement("canvas");
  backCanvas.width = canvas.width;
  backCanvas.height = canvas.height;
  const backCtx = backCanvas.getContext("2d")!;
  backCtx.drawImage(canvas, 0, 0);
  if (blueStationery) {
    ctx.save();
    ctx.scale(canvas.width / 416, canvas.height / 677);
    ctx.translate(-124, -64);
    ctx.fillStyle = "#fbf3df";
    ctx.strokeStyle = "#d5cdb7";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(244, 192, 190, 107, 8);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#536f79";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(252, 200, 174, 91, 5);
    ctx.stroke();
    ctx.fillStyle = "#4c6672";
    ctx.font = "23px Georgia, serif";
    ctx.textAlign = "center";
    ctx.letterSpacing = "6px";
    ctx.fillText("NOTES", 342, 239);
    ctx.strokeStyle = "#82908c";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(266, 260);
    ctx.lineTo(413, 260);
    ctx.moveTo(281, 277);
    ctx.lineTo(398, 277);
    ctx.stroke();
    ctx.restore();
  } else if (!stationeryPalette) {
    backCtx.textAlign = "center";
    backCtx.fillStyle = settings.ink;
    backCtx.font = "14px Georgia";
    backCtx.globalAlpha = 0.62;
    backCtx.fillText("S H I G U A N G", 384, 910);

    // Restrained inset border and embossed/printed lettering; weave remains under the print.
    ctx.strokeStyle = settings.ink;
    ctx.globalAlpha = kind === "leather" ? 0.28 : 0.26;
    ctx.lineWidth = 1.5;
    if (kind === "leather") ctx.setLineDash([4, 5]);
    ctx.strokeRect(35, 35, 698, 954);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.fillStyle = settings.ink;
    if (kind === "leather") {
      ctx.shadowColor = "#422c20";
      ctx.shadowOffsetY = 1;
      ctx.shadowBlur = 1;
    }
    ctx.font = "18px Georgia";
    ctx.fillText("S H I G U A N G   J O U R N A L", 384, 290);
    ctx.font = '76px "Songti SC", serif';
    ctx.fillText("拾 光", 384, 420);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.font = '24px "Songti SC", serif';
    ctx.fillText("把平凡的日子，慢慢收藏", 384, 485);
    ctx.globalAlpha = 0.7;
    ctx.font = "16px Georgia";
    ctx.fillText("V O L .  0 1     /     2 0 2 6", 384, 874);
  }

  const front = new CanvasTexture(canvas);
  const back = new CanvasTexture(backCanvas);
  const bump = new CanvasTexture(bumpCanvas);
  front.colorSpace = back.colorSpace = SRGBColorSpace;
  // Height data stays linear, unlike the colour textures.
  for (const texture of [front, back, bump]) texture.anisotropy = 8;
  return { front, back, bump };
}

/** Complete Shelf-inspired separate normal and roughness maps; no imported artwork. */
export function createClothSurfaceMaps() {
  const size = 256;
  const normalCanvas = document.createElement("canvas"),
    roughCanvas = document.createElement("canvas");
  normalCanvas.width = roughCanvas.width = normalCanvas.height = roughCanvas.height = size;
  const normalContext = normalCanvas.getContext("2d")!,
    roughContext = roughCanvas.getContext("2d")!;
  const normals = normalContext.createImageData(size, size),
    roughness = roughContext.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (grain(x + 1, y, "fabric") - grain(x - 1, y, "fabric")) * 2;
      const dy = (grain(x, y + 1, "fabric") - grain(x, y - 1, "fabric")) * 2;
      const length = Math.hypot(dx, dy, 1),
        offset = (y * size + x) * 4;
      normals.data[offset] = 128 - (dx / length) * 127;
      normals.data[offset + 1] = 128 + (dy / length) * 127;
      normals.data[offset + 2] = 128 + 127 / length;
      normals.data[offset + 3] = 255;
      const value = 228 + grain(x, y, "fabric") * 24;
      roughness.data.set([value, value, value, 255], offset);
    }
  normalContext.putImageData(normals, 0, 0);
  roughContext.putImageData(roughness, 0, 0);
  const normal = new CanvasTexture(normalCanvas),
    roughnessMap = new CanvasTexture(roughCanvas);
  // Normal and roughness are linear data, not sRGB colour.
  normal.anisotropy = roughnessMap.anisotropy = 8;
  return { normal, roughness: roughnessMap };
}
