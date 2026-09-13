import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { decodeMaterialUpload, normalizeMaterialUpload } from '../local/material-upload.mjs';

const heicFixture = () => Buffer.concat([
  Buffer.from([0, 0, 0, 24]), Buffer.from('ftyp'), Buffer.from('heic'),
  Buffer.alloc(4), Buffer.from('mif1'), Buffer.from('heix'),
]);

test('material upload accepts HEIC MIME and extension fallbacks but rejects forged files', () => {
  const bytes = heicFixture(), encoded = bytes.toString('base64');
  assert.equal(decodeMaterialUpload(`data:image/heic;base64,${encoded}`, 'photo.heic').format, 'heif');
  assert.equal(decodeMaterialUpload(`data:application/octet-stream;base64,${encoded}`, 'PHOTO.HEIC').extension, 'heic');
  assert.equal(decodeMaterialUpload(`data:*/*;base64,${encoded}`, 'photo.heif').extension, 'heif');
  assert.throws(() => decodeMaterialUpload('data:image/heic;base64,SGVsbG8=', 'fake.heic'), /内容与格式不匹配/);
  assert.throws(() => decodeMaterialUpload(`data:application/octet-stream;base64,${encoded}`, 'photo.bin'), /请选择/);
});

test('HEIC material uploads become browser-safe WebP and remove conversion files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'journal-material-heic-'));
  const jpeg = await sharp({create:{width:31,height:23,channels:3,background:'#5577aa'}}).jpeg().toBuffer();
  const execute = async (_command, args) => writeFile(args[args.indexOf('--out') + 1], jpeg);
  try {
    const decoded = decodeMaterialUpload(`data:image/heic;base64,${heicFixture().toString('base64')}`, 'photo.heic');
    const normalized = await normalizeMaterialUpload(decoded, { directory, execute });
    assert.equal(normalized.extension, 'webp');
    assert.equal(normalized.format, 'webp');
    assert.deepEqual(await sharp(normalized.buffer).metadata().then(({width,height,format})=>({width,height,format})), {width:31,height:23,format:'webp'});
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed HEIC conversion reports a bounded error and removes temporary input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'journal-material-heic-failure-'));
  try {
    const decoded = decodeMaterialUpload(`data:image/heic;base64,${heicFixture().toString('base64')}`, 'photo.heic');
    await assert.rejects(normalizeMaterialUpload(decoded, { directory, execute: async()=>{throw Error('conversion failed')} }), error => error.status === 422 && /原文件没有导入/.test(error.message));
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
