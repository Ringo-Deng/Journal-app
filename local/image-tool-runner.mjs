import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { cutoutPortable, palettePortable, segmentPortable } from "./portable-image-tools.mjs";

// server-bootstrap installs the macOS candidate router before server.mjs is
// imported. Taking the promisified function here preserves that exact Mac path.
const runNative = promisify(execFile);

export async function runSegmentTool({
  backend,
  root,
  input,
  outputDir,
  mode,
  tolerance,
  rect,
  point,
  options,
}) {
  if (backend === "native") {
    const output = await runNative(
      resolve(root, "local/segment"),
      [input, outputDir, mode, String(tolerance), ...(rect ? rect.map(String) : [])],
      options,
    );
    return JSON.parse(output.stdout);
  }
  if (backend === "portable") return segmentPortable(input, outputDir, mode, tolerance, rect, point);
  throw Error("当前系统没有可用的本地图像处理引擎。");
}

export async function runCutoutTool({ backend, root, input, output, options }) {
  if (backend === "native") {
    await runNative(resolve(root, "local/cutout"), [input, output], options);
    return;
  }
  if (backend === "portable") return cutoutPortable(input, output);
  throw Error("当前系统没有可用的本地图像处理引擎。");
}

export async function runPaletteTool({ backend, root, paths, options }) {
  if (backend === "native") {
    const output = await runNative(resolve(root, "local/material-palette"), paths, options);
    return JSON.parse(output.stdout);
  }
  if (backend === "portable") return palettePortable(paths);
  return {};
}
