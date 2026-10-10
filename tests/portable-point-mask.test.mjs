import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { runSegmentTool } from '../local/image-tool-runner.mjs';

function illustration({ grid = false, offset = 0, frameOnly = false, subjectOnly = false } = {}) {
  const lines = grid ? Array.from({ length: 17 }, (_, i) =>
    `<path d="M${i * 20} 0V320 M0 ${i * 20}H240" stroke="#a3a7ac" stroke-width="1"/>`).join('') : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320">
    ${subjectOnly ? '' : '<rect width="240" height="320" fill="#fafafa"/>'}${lines}
    ${subjectOnly ? '' : '<rect x="8" y="8" width="224" height="304" fill="none" stroke="#303545" stroke-width="1"/><circle cx="205" cy="50" r="9" fill="#ba667d"/>'}
    ${frameOnly ? '' : `<g transform="translate(${offset} 0)">
      <ellipse cx="105" cy="74" rx="27" ry="36" fill="#713b54"/>
      <rect x="97" y="98" width="16" height="25" fill="#eebdb1"/>
      <path d="M83 118L70 205Q105 218 140 205L127 118Z" fill="#fafafa" stroke="#334756" stroke-width="7"/>
      <path d="M83 123L52 170L58 177L90 145 M126 123L155 171L149 178L121 146" fill="#eebdb1" stroke="#334756" stroke-width="4"/>
      <path d="M82 208L83 274L96 274L101 212 M111 212L117 274L130 274L128 208" fill="#eebdb1" stroke="#334756" stroke-width="4"/>
      <path d="M81 272H98V284H77Z M117 272H132L136 284H116Z" fill="#334756"/>
    </g>`}
  </svg>`);
}

async function runScene(options, point, inspect, rect) {
  const dir = await mkdtemp(join(tmpdir(), 'journal-point-mask-'));
  try {
    const source = join(dir, 'source.png');
    await sharp(illustration(options)).png().toFile(source);
    const original = await readFile(source);
    const result = await runSegmentTool({ backend: 'portable', input: source, outputDir: dir,
      mode: 'point', tolerance: 28, rect, point });
    const output = await sharp(join(dir, result.items[0].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    await inspect(output, result);
    assert.deepEqual(await readFile(source), original);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const pixel = (image, x, y) => [...image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 4)];

test('Windows point selection excludes a frame and decoration and preserves white clothing', async () => {
  await runScene({}, [105 / 240, 160 / 320], (out, result) => {
    assert.equal(result.items.length, 1);
    assert.deepEqual(pixel(out, 105, 160), [250, 250, 250, 255]);
    assert.equal(pixel(out, 105, 74)[3], 255);
    assert.equal(pixel(out, 85, 278)[3], 255);
    assert.equal(pixel(out, 126, 278)[3], 255);
    assert.equal(pixel(out, 8, 100)[3], 0);
    assert.equal(pixel(out, 205, 50)[3], 0);
    assert.equal(pixel(out, 170, 160)[3], 0);
  });
});

test('Windows point selection breaks fine grid bridges while keeping head, hands, legs and white clothing', async () => {
  await runScene({ grid: true }, [105 / 240, 160 / 320], async out => {
    const expected = await sharp(illustration({ subjectOnly: true })).ensureAlpha().raw().toBuffer();
    let foreground = 0, missed = 0, leaked = 0;
    for (let i = 3; i < expected.length; i += 4) {
      if (expected[i] > 200) { foreground++; if (out.data[i] < 45) missed++; }
      if (expected[i] === 0 && out.data[i] > 45) leaked++;
    }
    assert.ok(missed / foreground < 0.01, `missing subject pixels: ${missed}/${foreground}`);
    assert.ok(leaked / foreground < 0.015, `background leakage: ${leaked}/${foreground}`);
    for (const [x, y] of [[105, 74], [105, 160], [57, 172], [150, 172], [90, 250], [123, 250], [85, 278], [126, 278]])
      assert.equal(pixel(out, x, y)[3], 255, `subject ${x},${y}`);
    for (const [x, y] of [[20, 160], [180, 160], [200, 200], [8, 100], [205, 50]])
      assert.equal(pixel(out, x, y)[3], 0, `background ${x},${y}`);
  });
});

test('the original image click is mapped into a noncentral cropped AI rectangle', async () => {
  await runScene({ offset: 25 }, [130 / 240, 160 / 320], (out, result) => {
    assert.deepEqual([out.info.width, out.info.height], [192, 288]);
    assert.deepEqual(result.items[0].bounds, [0, 0, 1, 1]);
    assert.equal(pixel(out, 130 - 48, 160 - 16)[3], 255);
    assert.equal(pixel(out, 205 - 48, 50 - 16)[3], 0);
  }, [0.2, 0.05, 0.8, 0.9]);
});

test('unreliable point masks create no candidate and leave source and existing outputs intact', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-point-failure-'));
  try {
    const source = join(dir, 'source.png');
    await sharp(illustration({ frameOnly: true })).png().toFile(source);
    const before = await readFile(source);
    await assert.rejects(runSegmentTool({ backend: 'portable', input: source, outputDir: dir,
      mode: 'point', tolerance: 28, point: [0.45, 0.5] }), /主体|套索/);
    assert.deepEqual(await readdir(dir), ['source.png']);
    assert.deepEqual(await readFile(source), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('isolated fine outlines and detached parts in an already transparent crop stay unchanged', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-point-transparent-'));
  try {
    const source = join(dir, 'source.png');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180"><path d="M45 20Q5 80 40 140" fill="none" stroke="#3b3545" stroke-width="1"/><rect x="40" y="40" width="40" height="100" fill="#a87692"/><circle cx="95" cy="20" r="4" fill="#a87692"/></svg>');
    await sharp(svg).png().toFile(source);
    const before = await sharp(source).ensureAlpha().raw().toBuffer();
    const result = await runSegmentTool({ backend: 'portable', input: source, outputDir: dir,
      mode: 'point', tolerance: 28, point: [0.5, 0.5] });
    const after = await sharp(join(dir, result.items[0].file)).ensureAlpha().raw().toBuffer();
    assert.deepEqual(after, before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('isolated one-pixel hair on opaque paper is preserved without morphological erosion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-point-hair-'));
  try {
    const source = join(dir, 'source.png');
    await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180"><rect width="120" height="180" fill="white"/><rect x="40" y="40" width="40" height="100" fill="#a87692"/><path d="M40 50H15V100" fill="none" stroke="#3b3545" stroke-width="1"/></svg>')).png().toFile(source);
    const original = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = await runSegmentTool({ backend: 'portable', input: source, outputDir: dir,
      mode: 'point', tolerance: 28, point: [0.5, 0.5] });
    const after = await sharp(join(dir, result.items[0].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(pixel(after, 15, 75), pixel(original, 15, 75));
    assert.equal(pixel(after, 100, 100)[3], 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('grid separation scales to a 2400-pixel import instead of retaining the enlarged grid', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'journal-point-large-'));
  try {
    const source = join(dir, 'source.png');
    await sharp(illustration({ grid: true })).resize(1800, 2400).png().toFile(source);
    const result = await runSegmentTool({ backend: 'portable', input: source, outputDir: dir,
      mode: 'point', tolerance: 28, point: [105 / 240, 0.5] });
    const out = await sharp(join(dir, result.items[0].file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(pixel(out, 790, 1200)[3], 255);
    assert.equal(pixel(out, 150, 1200)[3], 0);
    assert.equal(pixel(out, 1537, 375)[3], 0);
    assert.equal(pixel(out, 675, 1875)[3], 255);
    assert.equal(pixel(out, 922, 1875)[3], 255);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
