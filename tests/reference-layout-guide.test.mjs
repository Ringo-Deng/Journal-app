import test from 'node:test';
import assert from 'node:assert/strict';
import {artPrompt} from '../local/art-direction.mjs';
import {layoutPrompt} from '../local/layout-prompt.mjs';
import {referenceLayoutGuide} from '../local/reference-layout-guide.mjs';

test('both design stages receive the shared reference rules without a conflicting rich default', () => {
  for (const prompt of [artPrompt, layoutPrompt([])]) {
    assert.equal(prompt.split(referenceLayoutGuide).length, 2);
    assert.match(prompt, /默认density=balanced/);
    assert.doesNotMatch(prompt, /默认density=rich|density\s*默认为\s*rich|二三十件|以大量素材|不要把右页只留一段文字/);
    assert.match(prompt, /用户要求密集、繁复或满版时用rich/);
    assert.match(prompt, /用户明确要求优先/);
  }
});

test('layout guidance keeps required content references and actual asset metadata', () => {
  const assets = [{id: 'blue-paper', name: '蓝色格纹纸', category: 'paper', tags: ['格纹'], styles: ['清新'], colors: ['#457ab8'], src: '/private/path.png'}];
  const prompt = layoutPrompt(assets);
  assert.match(prompt, /sourceId恰好引用一次/);
  assert.match(prompt, /锁定元素原样保留/);
  assert.match(prompt, /禁止删内容或缩小正文硬塞/);
  assert.match(prompt, /dayIndex\/photoIndex引用/);
  const suppliedAssets = JSON.parse(prompt.split('可用素材：')[1]);
  assert.deepEqual(suppliedAssets, [{id: 'blue-paper', name: '蓝色格纹纸', category: 'paper', tags: ['格纹'], styles: ['清新'], colors: ['#457ab8']}]);
});
