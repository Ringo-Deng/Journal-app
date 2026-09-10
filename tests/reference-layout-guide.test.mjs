import test from 'node:test';
import assert from 'node:assert/strict';
import {artPrompt} from '../local/art-direction.mjs';
import {layoutPrompt} from '../local/layout-prompt.mjs';
import {referenceLayoutGuide, wantsEditorialLayout} from '../local/reference-layout-guide.mjs';
import {paperGroupContent} from '../local/paper-group-layout.mjs';
import {resolveComposition} from '../local/layout-composition.mjs';

test('both design stages receive the shared reference rules without a conflicting rich default', () => {
  for (const prompt of [artPrompt, layoutPrompt([])]) {
    assert.equal(prompt.split(referenceLayoutGuide).length, 2);
    assert.match(prompt, /默认density=balanced/);
    assert.doesNotMatch(prompt, /默认density=rich|density\s*默认为\s*rich|二三十件|以大量素材|不要把右页只留一段文字/);
    assert.match(prompt, /用户要求密集、繁复或满版时用rich/);
    assert.match(prompt, /用户明确要求优先/);
  }
});

test('explicit editorial styles bypass short paper groups and preserve free composition', () => {
  const input={days:[{raw:'今天去海边玩耍了。'}],elements:[]};
  assert.ok(paperGroupContent(input), 'ordinary short entries retain paper compositions');
  for (const instruction of ['高级感排版','编辑式版式','编辑感设计','用几何色块组织页面','杂志风、不要贴纸','海报排版','平面设计','magazine layout','editorial style','poster design']) {
    assert.equal(wantsEditorialLayout(instruction),true,instruction);
    assert.equal(paperGroupContent({...input,instruction}),null,instruction);
    assert.deepEqual(resolveComposition({preset:'quiet'}, {...input,instruction}), {preset:'free',primarySide:'left',density:'sparse',regions:[]});
  }
  for (const instruction of [undefined, {}, '手工拼贴','不要杂志风，保持手工拼贴','不用海报排版','不是高级感','avoid magazine layout','no poster design','不要杂志风或海报风，继续手工拼贴','不要高级感和几何排版','不喜欢杂志风，用手工拼贴','no magazine or poster design']) {
    assert.equal(wantsEditorialLayout(instruction),false,String(instruction));
    if(typeof instruction==='string')assert.ok(paperGroupContent({...input,instruction}));
  }
  assert.equal(wantsEditorialLayout('不要海报，用编辑式排版'),true);
  const diary={...input,days:[{raw:'看了杂志和海报。'}]};
  assert.ok(paperGroupContent(diary), 'diary words do not become style instructions');
  assert.equal(resolveComposition({preset:'quiet'},diary).preset,'quiet');
  assert.equal(resolveComposition({preset:'quiet',density:'rich'},{instruction:'密集几何排版'}).density,'rich');
});

test('editorial references reach both design stages with supported shapes and readable typography', () => {
  for (const prompt of [artPrompt,layoutPrompt([])]) {
    assert.match(prompt,/编辑式杂志参考/);
    assert.match(prompt,/对齐线/);
    assert.match(prompt,/serif与sans/);
    assert.match(prompt,/不强制套便签或旧collage-paper/);
    assert.match(prompt,/不能复制参考中的微小假文/);
    assert.match(prompt,/几何不可遮挡文字或照片/);
  }
  assert.match(layoutPrompt([]),/editorial-circle/);
  assert.match(layoutPrompt([]),/标题24\.\.42，正文16\.\.22/);
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
