import type { Spread } from './journal';

export type ImageExportSide = 'spread' | 'left' | 'right';
export type ImageExportPage = { spread: Spread; pageIndex: number; flyleaf: boolean };

export function orderedImageExportPages(pages: ImageExportPage[]) {
  const seen = new Set<string>();
  return [...pages]
    .sort((a, b) => (a.flyleaf ? -1 : a.pageIndex) - (b.flyleaf ? -1 : b.pageIndex))
    .filter(({ spread }) => {
      if (seen.has(spread.id)) return false;
      seen.add(spread.id);
      return true;
    });
}

export function imageExportPageLabel(page: Pick<ImageExportPage, 'flyleaf' | 'pageIndex'>) {
  return page.flyleaf ? '扉页' : `第 ${page.pageIndex + 1} 个跨页`;
}

function safeTitle(title: string) {
  // oxlint-disable-next-line no-control-regex -- Remove control characters from downloaded file names.
  return Array.from(title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-').trim())
    .slice(0, 80).join('') || '拾光集';
}

const sideLabels: Record<ImageExportSide, string> = { spread: '左右页', left: '左页', right: '右页' };

export function imageExportFilename(title: string, page: ImageExportPage, side: ImageExportSide) {
  return `${safeTitle(title)}-${page.flyleaf ? '扉页' : `第${page.pageIndex + 1}跨页`}-${sideLabels[side]}.png`;
}

export function imageExportArchiveFilename(title: string, side: ImageExportSide) {
  return `${safeTitle(title)}-所选页面-${sideLabels[side]}.zip`;
}

export function imageExportCrop(width: number, height: number, side: ImageExportSide) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 1) {
    throw Error('纸面图片尺寸无效');
  }
  const split = Math.floor(width / 2);
  return {
    x: side === 'right' ? split : 0,
    y: 0,
    width: side === 'spread' ? width : side === 'left' ? split : width - split,
    height,
  };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** PNGs are already compressed. Store them in one UTF-8 ZIP without another dependency. */
export async function createImageExportZip(entries: { name: string; blob: Blob }[]) {
  if (!entries.length || entries.length > 0xffff) throw Error('请选择要导出的页面，单次不超过 65535 张');
  const chunks: BlobPart[] = [];
  const directory: Uint8Array<ArrayBuffer>[] = [];
  const names = new Set<string>();
  let offset = 0;
  let directorySize = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name);
    if (!name.length || name.length > 0xffff || /[\\/]/.test(entry.name) || entry.name.includes('\0') || names.has(entry.name)) {
      throw Error('导出图片文件名无效或重复');
    }
    names.add(entry.name);
    if (entry.blob.size > 0xffffffff || offset + 30 + name.length + entry.blob.size > 0xffffffff) {
      throw Error('所选图片超过单次导出大小，请减少选择后重试');
    }
    const checksum = crc32(new Uint8Array(await entry.blob.arrayBuffer()));
    const header = new Uint8Array(30 + name.length);
    const local = new DataView(header.buffer);
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 file names.
    local.setUint16(12, 0x0021, true); // Valid DOS date: 1980-01-01.
    local.setUint32(14, checksum, true);
    local.setUint32(18, entry.blob.size, true);
    local.setUint32(22, entry.blob.size, true);
    local.setUint16(26, name.length, true);
    header.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const record = new DataView(central.buffer);
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(14, 0x0021, true);
    record.setUint32(16, checksum, true);
    record.setUint32(20, entry.blob.size, true);
    record.setUint32(24, entry.blob.size, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    central.set(name, 46);
    chunks.push(header, entry.blob);
    directory.push(central);
    offset += header.length + entry.blob.size;
    directorySize += central.length;
  }
  if (offset + directorySize + 22 > 0xffffffff) throw Error('所选图片超过单次导出大小，请减少选择后重试');
  const end = new Uint8Array(22);
  const record = new DataView(end.buffer);
  record.setUint32(0, 0x06054b50, true);
  record.setUint16(8, entries.length, true);
  record.setUint16(10, entries.length, true);
  record.setUint32(12, directorySize, true);
  record.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' });
}
