import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  cutoutPortable,
  palettePortable,
  segmentPortable,
} from "../local/portable-image-tools.mjs";

async function fixture(width, height, background, rectangles) {
  const channels = background.length;
  let image = sharp({
    create: {
      width,
      height,
      channels,
      background:
        channels === 4
          ? {
              r: background[0],
              g: background[1],
              b: background[2],
              alpha: background[3] / 255,
            }
          : { r: background[0], g: background[1], b: background[2] },
    },
  });
  if (rectangles.length)
    image = image.composite(
      rectangles.map((item) => ({
        input: {
          create: {
            width: item.width,
            height: item.height,
            channels: 4,
            background: { r: item.color[0], g: item.color[1], b: item.color[2], alpha: 1 },
          },
        },
        left: item.left,
        top: item.top,
      })),
    );
  return image.png().toBuffer();
}

test("Windows portable segmentation separates subjects on an edge-connected paper background", async () => {
  const dir = await mkdtemp(join(tmpdir(), "journal-portable-segment-"));
  try {
    const source = join(dir, "source.png");
    await sharp(
      await fixture(
        240,
        160,
        [255, 255, 255, 255],
        [
          { left: 20, top: 30, width: 60, height: 80, color: [190, 35, 45] },
          { left: 150, top: 45, width: 55, height: 65, color: [30, 80, 190] },
        ],
      ),
    ).toFile(source);
    const result = await segmentPortable(source, dir, "auto", 28);
    assert.equal(result.items.length, 2);
    assert.match(result.engine, /Windows 本地/);
    assert.deepEqual(
      result.items.map((item) => [item.width, item.height]),
      [
        [60, 80],
        [55, 65],
      ],
    );
    for (const item of result.items) {
      const output = await sharp(join(dir, item.file))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.ok(output.data.some((value, index) => index % 4 === 3 && value === 255));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Windows portable crop preserves the selected original pixels", async () => {
  const dir = await mkdtemp(join(tmpdir(), "journal-portable-crop-"));
  try {
    const source = join(dir, "source.png");
    await sharp(await fixture(200, 100, [245, 235, 220, 255], [])).toFile(source);
    const result = await segmentPortable(source, dir, "crop", 28, [0.25, 0.2, 0.5, 0.6]);
    assert.equal(result.items.length, 1);
    assert.deepEqual([result.items[0].width, result.items[0].height], [100, 60]);
    const pixel = await sharp(join(dir, result.items[0].file)).raw().toBuffer();
    assert.deepEqual([...pixel.subarray(0, 3)], [245, 235, 220]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Windows portable cutout crops a subject and keeps its transparent edge", async () => {
  const dir = await mkdtemp(join(tmpdir(), "journal-portable-cutout-"));
  try {
    const source = join(dir, "source.png"),
      output = join(dir, "cutout.png");
    await sharp(
      await fixture(
        180,
        140,
        [250, 250, 248, 255],
        [{ left: 45, top: 30, width: 80, height: 85, color: [45, 115, 70] }],
      ),
    ).toFile(source);
    await cutoutPortable(source, output);
    const rendered = await sharp(await readFile(output))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.deepEqual([rendered.info.width, rendered.info.height], [80, 85]);
    assert.equal(rendered.data[3], 255);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Windows portable cutout rejects a varied border without changing the source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "journal-portable-safe-failure-"));
  try {
    const source = join(dir, "source.png"),
      output = join(dir, "cutout.png");
    await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 30, g: 30, b: 30 } },
    })
      .composite([
        {
          input: {
            create: {
              width: 50,
              height: 50,
              channels: 3,
              background: { r: 190, g: 45, b: 40 },
            },
          },
          left: 50,
          top: 0,
        },
        {
          input: {
            create: {
              width: 50,
              height: 50,
              channels: 3,
              background: { r: 30, g: 110, b: 185 },
            },
          },
          left: 0,
          top: 50,
        },
        {
          input: {
            create: {
              width: 50,
              height: 50,
              channels: 3,
              background: { r: 210, g: 175, b: 45 },
            },
          },
          left: 50,
          top: 50,
        },
      ])
      .png()
      .toFile(source);
    const before = await readFile(source);
    await assert.rejects(cutoutPortable(source, output), /背景不够单一/);
    assert.deepEqual(await readFile(source), before);
    await assert.rejects(readFile(output), { code: "ENOENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Windows portable palette extraction returns stable dominant colours", async () => {
  const dir = await mkdtemp(join(tmpdir(), "journal-portable-palette-"));
  try {
    const source = join(dir, "palette.png");
    await sharp(
      await fixture(
        80,
        40,
        [180, 40, 40, 255],
        [{ left: 40, top: 0, width: 40, height: 40, color: [20, 90, 180] }],
      ),
    ).toFile(source);
    const palette = await palettePortable([source]);
    assert.deepEqual(new Set(palette[source]), new Set(["#b03030", "#1050b0"]));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
