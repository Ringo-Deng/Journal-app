import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPinterestPreviews, preferredPinterestImage } from '../lib/pinterest-preview.ts';

const image = id => ({ id, previewUrl: `https://i.pinimg.com/736x/${id}.jpg`, downloadUrl: `https://i.pinimg.com/originals/${id}.jpg` });
const turn = () => new Promise(resolve => setImmediate(resolve));

test('skips a broken first candidate and prefers the clear second image over a blurry third', async () => {
  const input = [image('1'), image('2'), image('3')];
  const result = await verifyPinterestPreviews(input, { load: async url => {
    if (url.includes('/1.jpg')) throw Error('broken');
    return url.includes('/2.jpg') ? { width: 1080, height: 1920 } : { width: 120, height: 120 };
  } });
  assert.deepEqual(result.map(item => item.id), ['1', '2', '3']);
  assert.equal(result[0].available, false);
  assert.deepEqual([result[0].width, result[0].height], [0, 0]);
  assert.equal(preferredPinterestImage(result)?.id, '2');
  assert.equal(result[1].previewUrl, input[1].previewUrl);
  assert.equal(result[1].downloadUrl, input[1].downloadUrl);
  assert.equal(input[0].available, undefined);
});

test('tries the same candidate original only when its preview fails and preserves its selection URL', async () => {
  const candidate = image('fallback');
  const requests = [];
  const result = await verifyPinterestPreviews([candidate], { load: async url => {
    requests.push(url);
    if (url === candidate.previewUrl) throw Error('preview unavailable');
    return { width: 900, height: 1200 };
  } });
  assert.deepEqual(requests, [candidate.previewUrl, candidate.downloadUrl]);
  assert.deepEqual(result[0], { ...candidate, previewUrl: candidate.downloadUrl, available: true, width: 900, height: 1200 });
});

test('keeps every failed candidate and does not probe an identical URL twice', async () => {
  const candidate = { ...image('same'), downloadUrl: image('same').previewUrl };
  const requests = [];
  const result = await verifyPinterestPreviews([candidate], { load: async url => { requests.push(url); throw Error('failed'); } });
  assert.deepEqual(result, [{ ...candidate, available: false, width: 0, height: 0 }]);
  assert.deepEqual(requests, [candidate.previewUrl]);
  assert.equal(preferredPinterestImage(result), null);
  assert.equal(preferredPinterestImage([]), null);
});

test('invalid dimensions cannot become a selected preview', async () => {
  const dimensions = [0, -1, NaN, Infinity];
  const result = await verifyPinterestPreviews(dimensions.map((_, index) => image(String(index))), {
    load: async url => ({ width: dimensions[Number(/\/(\d)\.jpg$/.exec(url)[1])], height: 100 }),
  });
  assert.ok(result.every(item => !item.available));
  assert.equal(preferredPinterestImage(result), null);
});

test('completion order does not change candidate order and equal pixel areas keep the first candidate', async () => {
  const resolvers = new Map();
  const pending = verifyPinterestPreviews([image('a'), image('b')], {
    load: url => new Promise(resolve => resolvers.set(url, resolve)),
  });
  await turn();
  resolvers.get(image('b').previewUrl)({ width: 800, height: 600 });
  resolvers.get(image('a').previewUrl)({ width: 600, height: 800 });
  const result = await pending;
  assert.deepEqual(result.map(item => item.id), ['a', 'b']);
  assert.equal(preferredPinterestImage(result)?.id, 'a');
});

test('limits simultaneous loads to four and continues queued candidates', async () => {
  let active = 0;
  let maximum = 0;
  let calls = 0;
  const releases = [];
  const pending = verifyPinterestPreviews(Array.from({ length: 9 }, (_, index) => image(String(index))), {
    load: () => new Promise(resolve => {
      calls++;
      active++;
      maximum = Math.max(maximum, active);
      releases.push(() => { active--; resolve({ width: 500, height: 700 }); });
    }),
  });
  await turn();
  assert.equal(calls, 4);
  while (releases.length) {
    releases.splice(0).forEach(release => release());
    await turn();
  }
  const result = await pending;
  assert.equal(calls, 9);
  assert.equal(maximum, 4);
  assert.equal(result.filter(item => item.available).length, 9);
});

test('aborting stops the queue and fallback even when an injected loader ignores cancellation', async () => {
  const controller = new AbortController();
  const calls = [];
  const signals = [];
  const pending = verifyPinterestPreviews(Array.from({ length: 8 }, (_, index) => image(String(index))), {
    signal: controller.signal,
    load: (url, signal) => { calls.push(url); signals.push(signal); return new Promise(() => {}); },
  });
  await turn();
  assert.equal(calls.length, 4);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await turn();
  assert.equal(calls.length, 4);
  assert.ok(signals.every(signal => signal.aborted));
});

test('an already aborted verification starts no image loads', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(verifyPinterestPreviews([image('a')], {
    signal: controller.signal,
    load: async () => { calls++; return { width: 1, height: 1 }; },
  }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

function fakeBrowserImages(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const instances = [];
  class FakeImage {
    src = '';
    onload = null;
    onerror = null;
    naturalWidth = 1080;
    naturalHeight = 1920;
    constructor() { instances.push(this); }
  }
  Object.defineProperty(globalThis, 'Image', { value: FakeImage, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Image', original);
    else delete globalThis.Image;
  });
  return instances;
}

test('default browser loading reads natural dimensions and clears completed handlers and timers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const instances = fakeBrowserImages(t);
  const pending = verifyPinterestPreviews([image('a')]);
  await turn();
  instances[0].onload();
  const result = await pending;
  assert.deepEqual([result[0].width, result[0].height], [1080, 1920]);
  assert.equal(instances[0].onload, null);
  assert.equal(instances[0].onerror, null);
  t.mock.timers.tick(6000);
  assert.equal(instances[0].src, image('a').previewUrl);
});

test('default browser loading times out after six seconds and clears handlers and the image source', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const instances = fakeBrowserImages(t);
  const candidate = { ...image('timeout'), downloadUrl: image('timeout').previewUrl };
  const pending = verifyPinterestPreviews([candidate]);
  await turn();
  t.mock.timers.tick(5999);
  assert.equal(instances[0].src, candidate.previewUrl);
  t.mock.timers.tick(1);
  const result = await pending;
  assert.equal(result[0].available, false);
  assert.equal(instances[0].src, '');
  assert.equal(instances[0].onload, null);
  assert.equal(instances[0].onerror, null);
});

test('aborting default browser loads clears every active image without starting later candidates', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const instances = fakeBrowserImages(t);
  const controller = new AbortController();
  const pending = verifyPinterestPreviews(Array.from({ length: 7 }, (_, index) => image(String(index))), { signal: controller.signal });
  await turn();
  assert.equal(instances.length, 4);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  t.mock.timers.tick(6000);
  assert.equal(instances.length, 4);
  assert.ok(instances.every(instance => instance.src === '' && instance.onload === null && instance.onerror === null));
});
