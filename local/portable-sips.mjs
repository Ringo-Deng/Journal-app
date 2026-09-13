import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const marker = Symbol.for("shiguang.portableSips");
const customPromisify = promisify.custom;

export function portableSipsOptions(args) {
  if (!Array.isArray(args)) return null;
  const outputAt = args.indexOf("--out");
  const formatAt = args.findIndex((value, index) => value === "-s" && args[index + 1] === "format");
  if (outputAt < 1 || outputAt + 1 >= args.length || formatAt < 0 || formatAt + 2 >= args.length)
    return null;
  const format = String(args[formatAt + 2]).toLowerCase();
  if (!["png", "jpeg"].includes(format)) return null;
  const resizeAt = args.indexOf("-Z");
  const maxEdge = resizeAt >= 0 ? Number(args[resizeAt + 1]) : 0;
  const qualityAt = args.findIndex(
    (value, index) => value === "-s" && args[index + 1] === "formatOptions",
  );
  return {
    input: String(args[outputAt - 1]),
    output: String(args[outputAt + 1]),
    format,
    maxEdge: Number.isFinite(maxEdge) && maxEdge > 0 ? maxEdge : 0,
    quality: qualityAt >= 0 ? Number(args[qualityAt + 2]) : 92,
  };
}

export async function runPortableSips(args) {
  const options = portableSipsOptions(args);
  if (!options) throw Error("不支持的 Windows 图片转换参数。");
  let image = sharp(options.input, { limitInputPixels: 120_000_000, animated: false }).rotate();
  if (options.maxEdge)
    image = image.resize({
      width: options.maxEdge,
      height: options.maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
  if (options.format === "png") image = image.png();
  else image = image.jpeg({ quality: Math.max(1, Math.min(100, options.quality || 92)) });
  await image.toFile(options.output);
  return { stdout: "", stderr: "" };
}

export function installPortableSips(hostPlatform = process.platform) {
  if (hostPlatform !== "win32" || childProcess[marker]) return false;
  const originalExecFile = childProcess.execFile;
  const originalRun = promisify(originalExecFile);
  const routedRun = (file, args, options) => {
    if (basename(String(file || "")).toLowerCase() !== "sips")
      return options === undefined ? originalRun(file, args) : originalRun(file, args, options);
    return runPortableSips(args);
  };
  function routedExecFile(...args) {
    return originalExecFile(...args);
  }
  routedExecFile[customPromisify] = routedRun;
  childProcess.execFile = routedExecFile;
  childProcess[marker] = true;
  syncBuiltinESMExports();
  return true;
}
