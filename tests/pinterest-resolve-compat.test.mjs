import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePinterestResolvePayload } from '../lib/pinterest-resolve-compat.ts';

test('adds an image array for legacy Pinterest resolver payloads', () => {
  const normalized = normalizePinterestResolvePayload({
    pinId: '884746289450443581',
    previewUrl: 'https://i.pinimg.com/736x/example.jpg',
    originalUrl: 'https://www.pinterest.com/pin/884746289450443581/',
  });
  assert.deepEqual(normalized?.images, [
    {
      id: '1',
      previewUrl: 'https://i.pinimg.com/736x/example.jpg',
      downloadUrl: 'https://i.pinimg.com/736x/example.jpg',
    },
  ]);
});

test('keeps valid modern Pinterest image choices', () => {
  const normalized = normalizePinterestResolvePayload({
    previewUrl: 'https://i.pinimg.com/736x/fallback.jpg',
    images: [
      {
        id: '2',
        previewUrl: 'https://i.pinimg.com/736x/current.jpg',
        downloadUrl: 'https://i.pinimg.com/originals/current.jpg',
      },
    ],
  });
  assert.equal(normalized?.images.length, 1);
  assert.equal(normalized?.images[0]?.id, '2');
  assert.equal(normalized?.images[0]?.downloadUrl, 'https://i.pinimg.com/originals/current.jpg');
});

test('returns an empty image list when no usable preview exists', () => {
  const normalized = normalizePinterestResolvePayload({ pinId: '123456789' });
  assert.deepEqual(normalized?.images, []);
});
