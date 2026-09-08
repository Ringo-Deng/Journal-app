"use client";
import { useMemo, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  DoubleSide,
  BufferGeometry,
  Float32BufferAttribute,
  CanvasTexture,
  SRGBColorSpace,
  type Texture,
} from "three";
import { exteriorSpineProfile, type BookGeometry } from "@/lib/book3d-motion";
import { COVER_MATERIALS, type CoverMaterial } from "./cover-materials";

/** Closed ribbon shell, including inner face and head/tail edges. */
export default function BookSpine({
  book,
  pose,
  material,
  bump,
}: {
  book: BookGeometry;
  pose: { current: { front: number; back: number } };
  material: CoverMaterial;
  bump: Texture;
}) {
  const surface = COVER_MATERIALS[material];
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 1536;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = surface.color;
    ctx.fillRect(0, 0, 256, 1536);
    for (let y = 0; y < 1536; y += 3)
      for (let x = 0; x < 256; x += 3) {
        const tone = ((x * 17 + y * 31) % 23) / 23;
        ctx.fillStyle = `rgba(255,255,255,${tone * 0.045})`;
        ctx.fillRect(x, y, 1, material === "fabric" ? 3 : 1);
      }
    ctx.fillStyle = surface.ink;
    ctx.globalAlpha = 0.65;
    ctx.fillRect(24, 90, 208, 3);
    ctx.fillRect(24, 1443, 208, 3);
    ctx.textAlign = "center";
    ctx.font = '72px "Songti SC", serif';
    for (const [i, character] of [..."拾光手帐"].entries())
      ctx.fillText(character, 128, 420 + i * 140);
    ctx.font = "28px Georgia";
    ctx.fillText("VOL. 01", 128, 1320);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 8;
    return result;
  }, [material]);
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    const positions = new Float32Array(4 * 33 * 3),
      uv = new Float32Array(4 * 33 * 2),
      indices: number[] = [];
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 33; i++) {
        uv[(row * 33 + i) * 2] = i / 32;
        uv[(row * 33 + i) * 2 + 1] = row % 2 === 0 ? 1 : 0;
      }
    const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
    for (let i = 0; i < 32; i++) {
      quad(i, i + 1, 33 + i + 1, 33 + i);
      quad(66 + i, 99 + i, 99 + i + 1, 66 + i + 1);
      quad(i, 66 + i, 66 + i + 1, i + 1);
      quad(33 + i, 33 + i + 1, 99 + i + 1, 99 + i);
    }
    quad(0, 33, 99, 66);
    quad(32, 98, 131, 65);
    result.setAttribute("position", new Float32BufferAttribute(positions, 3));
    result.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    result.setIndex(indices);
    return result;
  }, []);
  useEffect(
    () => () => {
      texture.dispose();
    },
    [texture],
  );
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  const lastPose = useRef("");
  useFrame(() => {
    const key = `${pose.current.front}/${pose.current.back}`;
    if (lastPose.current === key) return;
    lastPose.current = key;
    const profile = exteriorSpineProfile(pose.current.front, pose.current.back, book);
    const positions = geometry.attributes.position;
    for (let row = 0; row < 4; row++)
      profile.forEach((point, i) => {
        const inset = row < 2 ? 0 : 0.009;
        positions.setXYZ(
          row * 33 + i,
          point.x - point.nx * inset,
          ((row % 2 === 0 ? 1 : -1) * (book.height + 0.14)) / 2,
          point.z - point.nz * inset,
        );
      });
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });
  return (
    <mesh geometry={geometry} castShadow raycast={() => {}}>
      <meshPhysicalMaterial
        side={DoubleSide}
        map={texture}
        bumpMap={bump}
        bumpScale={surface.bump}
        roughness={surface.roughness}
        sheen={surface.sheen}
        sheenColor={surface.color}
      />
    </mesh>
  );
}
