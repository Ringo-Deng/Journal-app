import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePinterestInput, extractPinterestMetadata } from '../local/pinterest-import.mjs';

test('parses Pinterest iframe embed code', () => {
  const parsed = parsePinterestInput('<iframe src="https://assets.pinterest.com/ext/embed.html?id=1001136192184185383" height="1167" width="600"></iframe>');
  assert.equal(parsed.pinId, '1001136192184185383');
});

test('parses numeric id and regular pin URL', () => {
  assert.equal(parsePinterestInput('1001136192184185383').pinId, '1001136192184185383');
  assert.equal(parsePinterestInput('https://www.pinterest.com/pin/1001136192184185383/').pinId, '1001136192184185383');
  assert.equal(parsePinterestInput('https://ca.pinterest.com/pin/something--641903753143916509/').pinId, '641903753143916509');
});

test('rejects non Pinterest URLs', () => assert.throws(() => parsePinterestInput('https://example.com/pin/123456789/')));

test('extracts and upgrades pinimg candidates', () => {
  const html = '<meta property="og:image" content="https://i.pinimg.com/736x/aa/bb/cc/picture.jpg">';
  const meta = extractPinterestMetadata(html, '123456789');
  assert.equal(meta.video, false);
  assert.equal(meta.candidates[0], 'https://i.pinimg.com/originals/aa/bb/cc/picture.jpg');
  assert.ok(meta.candidates.includes('https://i.pinimg.com/736x/aa/bb/cc/picture.jpg'));
});

test('detects video pins', () => {
  const meta = extractPinterestMetadata('<meta property="og:video" content="https://x.example/video.mp4">', '123456789');
  assert.equal(meta.video, true);
});
