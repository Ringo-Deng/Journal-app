import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePinterestInput, resolvePinterestInput, extractPinterestMetadata, downloadPinterestImage } from '../local/pinterest-import.mjs';

const pinId = '123456789';
const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
const imageUrl = (size, name = 'picture') => `https://i.pinimg.com/${size}/aa/bb/cc/${name}.jpg`;

function mockPinterestPage(t, html, imageResponder) {
  const imageRequests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === pinUrl) return new Response(html);
    imageRequests.push(url);
    return imageResponder(url);
  });
  return imageRequests;
}

function jpegResponse() {
  return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpeg' } });
}

test('parses Pinterest iframe embed code', () => {
  const parsed = parsePinterestInput('<iframe src="https://assets.pinterest.com/ext/embed.html?id=1001136192184185383" height="1167" width="600"></iframe>');
  assert.equal(parsed.pinId, '1001136192184185383');
});

test('parses numeric id and regular pin URL', () => {
  assert.equal(parsePinterestInput('1001136192184185383').pinId, '1001136192184185383');
  assert.equal(parsePinterestInput('https://www.pinterest.com/pin/1001136192184185383/').pinId, '1001136192184185383');
  assert.equal(parsePinterestInput('https://ca.pinterest.com/pin/something--641903753143916509/').pinId, '641903753143916509');
  assert.equal(parsePinterestInput('https://www.pinterest.jp/pin/1099370959077959045/sent/?sfo=1').pinId, '1099370959077959045');
});

test('resolves a pin.it share link through Pinterest-owned redirects', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = String(input);
    requests.push({ url, redirect: options?.redirect });
    if (url === 'https://pin.it/28E4CHdGh') return new Response('', {
      status: 308,
      headers: { location: 'https://api.pinterest.com/url_shortener/28E4CHdGh/redirect/' },
    });
    if (url === 'https://api.pinterest.com/url_shortener/28E4CHdGh/redirect/') return new Response('', {
      status: 302,
      headers: { location: 'https://www.pinterest.jp/pin/1099370959077959045/sent/?invite_code=private&sfo=1' },
    });
    throw new Error(`Unexpected request: ${url}`);
  });
  const parsed = await resolvePinterestInput('https://pin.it/28E4CHdGh');
  assert.deepEqual(parsed, {
    pinId: '1099370959077959045',
    originalUrl: 'https://www.pinterest.com/pin/1099370959077959045/',
  });
  assert.deepEqual(requests, [
    { url: 'https://pin.it/28E4CHdGh', redirect: 'manual' },
    { url: 'https://api.pinterest.com/url_shortener/28E4CHdGh/redirect/', redirect: 'manual' },
  ]);
});

test('stops a pin.it redirect that leaves Pinterest', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', {
    status: 302,
    headers: { location: 'https://example.com/pin/1099370959077959045/' },
  }));
  await assert.rejects(() => resolvePinterestInput('https://pin.it/unsafe'), {
    status: 422,
    message: '这个分享链接跳转到了非 Pinterest 网页，已停止读取。',
  });
});

test('rejects non Pinterest URLs', () => assert.throws(() => parsePinterestInput('https://example.com/pin/123456789/')));

test('extracts and upgrades pinimg candidates', () => {
  const html = '<meta property="og:image" content="https://i.pinimg.com/736x/aa/bb/cc/picture.jpg">';
  const meta = extractPinterestMetadata(html, '123456789');
  assert.equal(meta.video, false);
  assert.equal(meta.candidates[0], 'https://i.pinimg.com/originals/aa/bb/cc/picture.jpg');
  assert.ok(meta.candidates.includes('https://i.pinimg.com/736x/aa/bb/cc/picture.jpg'));
});

test('keeps the Pin main image ahead of larger Twitter and recommendation images', () => {
  const meta = extractPinterestMetadata(`
    <script>{"recommended": "${imageUrl('originals', 'recommendation')}"}</script>
    <meta name="twitter:image" content="${imageUrl('1200x', 'twitter')}">
    <meta content="${imageUrl('236x', 'main')}" property="og:image">
  `, pinId);
  assert.deepEqual(meta.images.map((image) => image.previewUrl), [
    imageUrl('236x', 'main'), imageUrl('1200x', 'twitter'), imageUrl('originals', 'recommendation'),
  ]);
  assert.equal(meta.previewUrl, imageUrl('236x', 'main'));
  assert.equal(meta.candidates[0], imageUrl('originals', 'main'));
});

test('uses Twitter main image when Open Graph image is absent', () => {
  const meta = extractPinterestMetadata(`
    <script>{"recommended": "${imageUrl('originals', 'recommendation')}"}</script>
    <meta content="${imageUrl('736x', 'main')}" name="twitter:image:src">
  `, pinId);
  assert.equal(meta.images[0].previewUrl, imageUrl('736x', 'main'));
  assert.equal(meta.images.length, 2);
});

test('merges image sizes and previews the largest observed size without inventing it', () => {
  const meta = extractPinterestMetadata(`
    <meta property="og:image" content="${imageUrl('236x')}">
    <script>{"images": ["${imageUrl('75x75')}", "${imageUrl('736x')}", "${imageUrl('1200x')}", "${imageUrl('736x')}"]}</script>
  `, pinId);
  assert.equal(meta.images.length, 1);
  assert.equal(meta.images[0].previewUrl, imageUrl('1200x'));
  assert.equal(meta.images[0].downloadUrl, imageUrl('originals'));
  assert.deepEqual(meta.images[0].candidates, [
    imageUrl('originals'), imageUrl('1200x'), imageUrl('736x'), imageUrl('236x'), imageUrl('75x75'),
  ]);
});

test('previews an original only when the original URL was observed in the page', () => {
  const meta = extractPinterestMetadata(`
    <meta property="og:image" content="${imageUrl('736x')}">
    <script>{"image": "${imageUrl('originals')}"}</script>
  `, pinId);
  assert.equal(meta.images.length, 1);
  assert.equal(meta.images[0].previewUrl, imageUrl('originals'));
  assert.deepEqual(meta.images[0].candidates, [imageUrl('originals'), imageUrl('736x')]);
});

test('orders equally ranked main images by observed size before synthesizing originals', () => {
  const meta = extractPinterestMetadata(`
    <meta property="og:image" content="${imageUrl('236x', 'small')}">
    <meta property="og:image" content="${imageUrl('1200x', 'large')}">
  `, pinId);
  assert.deepEqual(meta.images.map((image) => image.previewUrl), [imageUrl('1200x', 'large'), imageUrl('236x', 'small')]);
});

test('without main-image metadata, ranks remaining candidates by their observed sizes', () => {
  const meta = extractPinterestMetadata(`
    <script>{"images": ["${imageUrl('236x', 'small')}", "${imageUrl('1200x', 'large')}"]}</script>
  `, pinId);
  assert.equal(meta.images[0].previewUrl, imageUrl('1200x', 'large'));
});

test('ignores page CSS backgrounds and merges the small thumbnails found in live Pin markup', () => {
  const meta = extractPinterestMetadata(`
    <style>:root{--instagram-background-url:url(${imageUrl('originals', 'decoration')})}._YsBbF{border:0;display:block}</style>
    <script>{"images_60x60":{"url":"${imageUrl('60x60')}"},"images_orig":{"url":"${imageUrl('originals')}"},"imageLargeUrl":"${imageUrl('1200x')}"}</script>
    <meta content="${imageUrl('736x')}" data-app="true" name="og:image" property="og:image">
  `, pinId);
  assert.equal(meta.images.length, 1);
  assert.equal(meta.images[0].previewUrl, imageUrl('originals'));
  assert.deepEqual(meta.images[0].candidates, [imageUrl('originals'), imageUrl('1200x'), imageUrl('736x'), imageUrl('60x60')]);
});

test('stops a bare image URL at CSS parentheses instead of collecting following syntax', () => {
  const meta = extractPinterestMetadata(`<div style="background:url(${imageUrl('736x')})"></div>`, pinId);
  assert.deepEqual(meta.images[0].candidates, [imageUrl('originals'), imageUrl('736x')]);
});

test('downloads the selected image original before falling back to its largest observed size', async (t) => {
  const html = `
    <meta property="og:image" content="${imageUrl('736x', 'main')}">
    <script>{"images": ["${imageUrl('236x', 'selected')}", "${imageUrl('1200x', 'selected')}"]}</script>
  `;
  const requests = mockPinterestPage(t, html, (url) => {
    if (url === imageUrl('originals', 'selected')) return new Response('', { status: 404 });
    if (url === imageUrl('1200x', 'selected')) return jpegResponse();
    throw new Error(`Unexpected image request: ${url}`);
  });
  const result = await downloadPinterestImage(pinId, imageUrl('236x', 'selected'));
  assert.equal(result.imageUrl, imageUrl('1200x', 'selected'));
  assert.deepEqual(requests, [imageUrl('originals', 'selected'), imageUrl('originals', 'selected'), imageUrl('1200x', 'selected')]);
});

test('default download failure does not silently switch to a different picture', async (t) => {
  const html = `
    <meta property="og:image" content="${imageUrl('736x', 'main')}">
    <script>{"recommended": "${imageUrl('originals', 'recommendation')}"}</script>
  `;
  const requests = mockPinterestPage(t, html, (url) => url.includes('/recommendation.jpg')
    ? jpegResponse()
    : new Response('', { status: 404 }));
  await assert.rejects(() => downloadPinterestImage(pinId), { status: 502 });
  assert.deepEqual(requests, [imageUrl('originals', 'main'), imageUrl('originals', 'main'), imageUrl('736x', 'main'), imageUrl('736x', 'main')]);
});

test('rejects an unavailable manual selection without downloading another picture', async (t) => {
  const requests = mockPinterestPage(t, `<meta property="og:image" content="${imageUrl('736x', 'main')}">`, () => jpegResponse());
  await assert.rejects(() => downloadPinterestImage(pinId, imageUrl('originals', 'missing')), {
    status: 422,
    message: '没有找到所选图片，请重新预览后选择。',
  });
  assert.deepEqual(requests, []);
});

test('detects video pins', () => {
  const meta = extractPinterestMetadata('<meta property="og:video" content="https://x.example/video.mp4">', '123456789');
  assert.equal(meta.video, true);
});
