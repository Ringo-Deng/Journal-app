import { CanvasTexture, SRGBColorSpace } from "three";

export type CoverMaterial = "leather" | "fabric";
export const COVER_MATERIALS = {
  leather: {
    label: "牛皮",
    color: "#926346",
    edge: "#785039",
    ink: "#e4cfaa",
    roughness: 0.68,
    bump: 0.012,
    sheen: 0.08,
    clearcoat: 0.12,
  },
  fabric: {
    label: "布艺",
    color: "#c7bca5",
    edge: "#aca18b",
    ink: "#535548",
    roughness: 0.98,
    bump: 0.018,
    sheen: 0.38,
    clearcoat: 0,
  },
} as const;

/** Small deterministic pores or alternating warp/weft, without external image requests. */
function grain(x: number, y: number, kind: CoverMaterial) {
  const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  const fine = noise - Math.floor(noise);
  if (kind === "fabric") {
    const warp = Math.cos((x * Math.PI) / 3);
    const weft = Math.cos((y * Math.PI) / 3);
    const crossing = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0;
    return (
      0.5 + (crossing ? warp * 0.18 + weft * 0.07 : warp * 0.07 + weft * 0.18) + (fine - 0.5) * 0.1
    );
  }
  return (
    0.5 +
    (fine - 0.5) * 0.35 +
    Math.sin(x / 9 + Math.sin(y / 13)) * 0.07 +
    Math.sin(y / 6 + x / 23) * 0.04
  );
}

export function createCoverTextures(kind: CoverMaterial) {
  const settings = COVER_MATERIALS[kind];
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = canvas.width;
  bumpCanvas.height = canvas.height;
  const bumpCtx = bumpCanvas.getContext("2d")!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  const bumps = bumpCtx.createImageData(canvas.width, canvas.height);
  const base = [1, 3, 5].map((offset) => parseInt(settings.color.slice(offset, offset + 2), 16));
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const value = grain(x, y, kind);
      const i = (y * canvas.width + x) * 4;
      const tone = (value - 0.5) * (kind === "leather" ? 25 : 18);
      for (let c = 0; c < 3; c++) {
        pixels.data[i + c] = base[c] + tone;
        bumps.data[i + c] = Math.round(value * 255);
      }
      pixels.data[i + 3] = bumps.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  bumpCtx.putImageData(bumps, 0, 0);
  // The unprinted back uses the same material, with a quiet maker's mark.
  const backCanvas = document.createElement("canvas");
  backCanvas.width = canvas.width;
  backCanvas.height = canvas.height;
  const backCtx = backCanvas.getContext("2d")!;
  backCtx.drawImage(canvas, 0, 0);
  backCtx.textAlign = "center";
  backCtx.fillStyle = settings.ink;
  backCtx.font = "14px Georgia";
  backCtx.globalAlpha = 0.62;
  backCtx.fillText("S H I G U A N G", 384, 910);

  // Restrained inset border and embossed/printed lettering; weave remains under the print.
  ctx.strokeStyle = settings.ink;
  ctx.globalAlpha = kind === "leather" ? 0.45 : 0.26;
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

  const front = new CanvasTexture(canvas);
  const back = new CanvasTexture(backCanvas);
  const bump = new CanvasTexture(bumpCanvas);
  front.colorSpace = back.colorSpace = SRGBColorSpace;
  // Height data stays linear, unlike the colour textures.
  for (const texture of [front, back, bump]) texture.anisotropy = 8;
  return { front, back, bump };
}
