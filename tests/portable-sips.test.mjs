import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import {
  installPortableSips,
  portableSipsOptions,
  runPortableSips,
} from "../local/portable-sips.mjs";

test("portable sips parser accepts only the thumbnail and conversion shapes used by the app", () => {
  assert.deepEqual(
    portableSipsOptions(["-Z", "384", "-s", "format", "png", "in.jpg", "--out", "out.png"]),
    { input: "in.jpg", output: "out.png", format: "png", maxEdge: 384, quality: 92 },
  );
  assert.deepEqual(
    portableSipsOptions([
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      "88",
      "in.heic",
      "--out",
      "out.jpg",
    ]),
    { input: "in.heic", output: "out.jpg", format: "jpeg", maxEdge: 0, quality: 88 },
  );
  assert.equal(portableSipsOptions(["--deleteColorManagementProperties", "in.jpg"]), null);
});

test("portable sips creates the Windows material-classification thumbnail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "journal-portable-sips-"));
  try {
    const input = join(dir, "input.jpg"),
      output = join(dir, "output.png");
    await sharp({ create: { width: 800, height: 400, channels: 3, background: "#6b8f72" } })
      .jpeg()
      .toFile(input);
    await runPortableSips(["-Z", "384", "-s", "format", "png", input, "--out", output]);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "png");
    assert.deepEqual([metadata.width, metadata.height], [384, 192]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("portable sips installer is a strict Windows-only adapter", async () => {
  assert.equal(installPortableSips("darwin"), false);
  assert.equal(installPortableSips("linux"), false);
  assert.equal(installPortableSips("win32"), true);
  assert.equal(installPortableSips("win32"), false);

  const dir = await mkdtemp(join(tmpdir(), "journal-portable-sips-router-"));
  try {
    const input = join(dir, "input.jpg"),
      output = join(dir, "output.png");
    await sharp({ create: { width: 40, height: 20, channels: 3, background: "#c1a582" } })
      .jpeg()
      .toFile(input);
    await promisify(childProcess.execFile)("sips", [
      "-Z",
      "384",
      "-s",
      "format",
      "png",
      input,
      "--out",
      output,
    ]);
    assert.equal((await sharp(output).metadata()).format, "png");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
