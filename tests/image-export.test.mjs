import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import {
  createImageExportZip, imageExportArchiveFilename, imageExportCrop,
  imageExportFilename, orderedImageExportPages,
} from '../lib/image-export.ts';

const page = (id, pageIndex, flyleaf = false) => ({ spread: { id, elements: [], days: [] }, pageIndex, flyleaf });

test('export order follows the book and removes repeated selected IDs without mutating the selection', () => {
  const pages = [page('third', 2), page('leaf', -1, true), page('first', 0), page('third', 2)];
  const snapshot = structuredClone(pages);
  assert.deepEqual(orderedImageExportPages(pages).map(item => item.spread.id), ['leaf', 'first', 'third']);
  assert.deepEqual(pages, snapshot);
});

test('file names retain Chinese titles and distinguish flyleaf, page numbers and crop side', () => {
  assert.equal(imageExportFilename('旅行/照片:九月', page('first', 0), 'spread'), '旅行-照片-九月-第1跨页-左右页.png');
  assert.equal(imageExportFilename('拾光集', page('leaf', -1, true), 'right'), '拾光集-扉页-右页.png');
  assert.equal(imageExportFilename('  ', page('last', 12), 'left'), '拾光集-第13跨页-左页.png');
  assert.equal(imageExportArchiveFilename('九月\u0000手帐', 'spread'), '九月-手帐-所选页面-左右页.zip');
  assert.equal(Array.from(imageExportFilename('🌸'.repeat(100), page('a', 0), 'left').split('-')[0]).length, 80);
});

test('crop dimensions preserve the spread and cover both halves without dropping odd-width pixels', () => {
  assert.deepEqual(imageExportCrop(2000, 1398, 'spread'), { x: 0, y: 0, width: 2000, height: 1398 });
  assert.deepEqual(imageExportCrop(2000, 1904, 'left'), { x: 0, y: 0, width: 1000, height: 1904 });
  assert.deepEqual(imageExportCrop(2000, 1904, 'right'), { x: 1000, y: 0, width: 1000, height: 1904 });
  const left = imageExportCrop(2001, 1000, 'left');
  const right = imageExportCrop(2001, 1000, 'right');
  assert.equal(left.width + right.width, 2001);
  assert.equal(left.width, right.x);
  assert.equal(right.x + right.width, 2001);
  for (const [width, height] of [[0, 100], [100, 0], [100.5, 100], [Infinity, 100]]) {
    assert.throws(() => imageExportCrop(width, height, 'spread'), /尺寸无效/);
  }
});

test('stored ZIP directory, UTF-8 names, CRC and contents are independently readable in page order', async () => {
  const entries = [
    { name: '拾光集-扉页-左右页.png', blob: new Blob([Uint8Array.from([137, 80, 78, 71, 0, 255])]) },
    { name: '拾光集-第3跨页-左右页.png', blob: new Blob(['second image bytes']) },
  ];
  const zip = await createImageExportZip(entries);
  assert.equal(zip.type, 'application/zip');
  const bytes = Buffer.from(await zip.arrayBuffer());
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 8), 2);
  assert.equal(bytes.readUInt16LE(end + 10), 2);
  let central = bytes.readUInt32LE(end + 16);
  assert.equal(central + bytes.readUInt32LE(end + 12), end);
  for (const expected of entries) {
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    assert.equal(bytes.readUInt16LE(central + 8), 0x800);
    assert.equal(bytes.readUInt16LE(central + 10), 0);
    const nameLength = bytes.readUInt16LE(central + 28);
    const name = bytes.subarray(central + 46, central + 46 + nameLength).toString('utf8');
    assert.equal(name, expected.name);
    const local = bytes.readUInt32LE(central + 42);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.readUInt16LE(local + 6), 0x800);
    assert.equal(bytes.readUInt16LE(local + 8), 0);
    assert.equal(bytes.readUInt16LE(local + 26), nameLength);
    assert.equal(bytes.subarray(local + 30, local + 30 + nameLength).toString('utf8'), name);
    const size = bytes.readUInt32LE(central + 24);
    const data = bytes.subarray(local + 30 + nameLength, local + 30 + nameLength + size);
    assert.deepEqual(data, Buffer.from(await expected.blob.arrayBuffer()));
    assert.equal(bytes.readUInt32LE(central + 20), size);
    assert.equal(bytes.readUInt32LE(local + 18), size);
    assert.equal(bytes.readUInt32LE(local + 22), size);
    assert.equal(bytes.readUInt32LE(central + 16), crc32(data));
    assert.equal(bytes.readUInt32LE(local + 14), crc32(data));
    central += 46 + nameLength;
  }
  assert.equal(central, end);
});

test('ZIP refuses empty exports, duplicate names and path names instead of producing an ambiguous download', async () => {
  const blob = new Blob(['image']);
  await assert.rejects(createImageExportZip([]), /请选择/);
  await assert.rejects(createImageExportZip([{ name: 'same.png', blob }, { name: 'same.png', blob }]), /重复/);
  for (const name of ['../photo.png', 'folder\\photo.png', 'bad\u0000.png', '']) {
    await assert.rejects(createImageExportZip([{ name, blob }]), /文件名无效/);
  }
});
