import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const run = promisify(execFile);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const fail = (message, status = 400) => Object.assign(Error(message), { status });

function isHeif(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const boxSize = buffer.readUInt32BE(0);
  if (boxSize < 16) return false;
  const end = Math.min(buffer.length, boxSize);
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    if (HEIF_BRANDS.has(buffer.toString('ascii', offset, offset + 4))) return true;
  }
  return false;
}

export function decodeMaterialUpload(dataUri, filename = '') {
  const match = /^data:([^;,]*);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUri || '');
  if (!match) throw fail('请选择 JPG、PNG、WebP 或 HEIC 图片。');
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > MAX_BYTES) throw fail('单张图片不能超过 10 MB。', 413);
  const standard = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (standard) {
    const valid = standard === 'jpeg'
      ? buffer[0] === 255 && buffer[1] === 216
      : standard === 'png'
        ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw fail('图片内容与格式不匹配。');
    return { buffer, extension: standard === 'jpeg' ? 'jpg' : standard, format: standard };
  }
  const fileExtension = extname(filename).toLowerCase();
  const genericMime = !mime || mime === 'application/octet-stream' || mime === '*/*';
  const declaredHeic = mime === 'image/heic' || mime === 'image/heif' || (genericMime && ['.heic', '.heif'].includes(fileExtension));
  if (!declaredHeic) throw fail('请选择 JPG、PNG、WebP 或 HEIC 图片。');
  if (!isHeif(buffer)) throw fail('HEIC 图片内容与格式不匹配。');
  return { buffer, extension: fileExtension === '.heif' || mime === 'image/heif' ? 'heif' : 'heic', format: 'heif' };
}

export async function normalizeMaterialUpload(decoded, { directory, execute = run } = {}) {
  if (decoded.format !== 'heif') return decoded;
  const id = randomUUID();
  const source = join(directory, `material-convert-${id}.${decoded.extension}`);
  const jpeg = join(directory, `material-convert-${id}.jpg`);
  const render = input => sharp(input, { limitInputPixels: MAX_PIXELS, animated: false })
    .rotate()
    .webp({ quality: 92, effort: 4 })
    .toBuffer();
  try {
    let buffer;
    try {
      buffer = await render(decoded.buffer);
    } catch {
      await writeFile(source, decoded.buffer, { mode: 0o600, flag: 'wx' });
      const command = process.platform === 'darwin' ? '/usr/bin/sips' : 'sips';
      await execute(command, ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', source, '--out', jpeg], { timeout: 120000, maxBuffer: 1024 * 1024 });
      buffer = await render(await readFile(jpeg));
    }
    const metadata = await sharp(buffer, { limitInputPixels: MAX_PIXELS, animated: false }).metadata();
    if (metadata.format !== 'webp' || !metadata.width || !metadata.height || metadata.width > 20000 || metadata.height > 20000)
      throw Error('invalid converted image');
    return { buffer, extension: 'webp', format: 'webp' };
  } catch {
    throw fail('这张 HEIC 照片暂时无法转换，原文件没有导入。', 422);
  } finally {
    await unlink(source).catch(() => {});
    await unlink(jpeg).catch(() => {});
  }
}
