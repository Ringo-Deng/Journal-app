import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const leaf = await readFile(new URL('../components/reading-leaf.tsx', import.meta.url), 'utf8');
const transitionCss = await readFile(
  new URL('../app/editor-rounded-transition.css', import.meta.url),
  'utf8',
);
const paperFlip = await readFile(
  new URL('../public/sounds/mixkit-page-turn-single-1104.wav', import.meta.url),
);

test('editor page turns paint the complete segmented leaf frame without rerendering the workbench', () => {
  assert.match(page, /const frame=leafFrame\(progress,direction>0,10\)/);
  assert.match(page, /turnRef\.current\.progress=frame\.progress/);
  assert.match(page, /querySelectorAll<HTMLElement>\('\[data-leaf-index\]'\)/);
  assert.match(page, /--front-visible/);
  assert.match(page, /--back-visible/);
  assert.match(leaf, /data-leaf-index=\{i\}/);
});

test('the turn keeps an immutable source snapshot while the live page is unchanged', () => {
  assert.match(page, /source: spread/);
  assert.match(page, /sourceIndex: page/);
  assert.match(page, /from=\{activeTurn\.source\}/);
  assert.match(page, /fromIndex=\{activeTurn\.sourceIndex\}/);
  assert.doesNotMatch(page, /from=\{spread\}/);
});

test('the target snapshot decodes before motion and before the live page handoff', () => {
  assert.match(page, /function waitForTurnTargetImages\(\)/);
  assert.match(page, /function finishTurn\(/);
  assert.match(page, /\.page-turn-layer \.turn-reveal img, \.page-turn-layer \.turn-face\.back img/);
  assert.match(page, /addEventListener\('load',done[\s\S]*if\(img\.complete\)done\(\)/);
  assert.match(page, /waitForTurnTargetImages\(\)\.then\(\(\)=>\{[\s\S]*settleTurn\(true\)/);
  assert.match(page, /function finishTurn[\s\S]*waitForTurnTargetImages\(\)\.then\(\(\)=>requestAnimationFrame\(\(\)=>\{[\s\S]*setPage\(t\.target\);[\s\S]*clearTurn\(t\)/);
  assert.doesNotMatch(page, /function finishTurn[\s\S]*?setPage\(t\.target\);[\s\S]*?Promise\.race/);
  assert.doesNotMatch(page, /new Promise<void>\(resolve=>setTimeout\(resolve,1200\)\)/);
  assert.doesNotMatch(page, /if\(complete\)setPage\(t\.target\);setFlipping\(''\)/);
});

test('the editor suppresses transient work-area scrollbars only while a page is turning', () => {
  assert.match(page, /data-fit-page=\{zoom === 100 \? 'true' : undefined\}/);
  assert.match(
    transitionCss,
    /\.compact-shell\.is-editing \.work-area\[data-fit-page='true'\]:has\(\.page-turn-layer\)\s*\{\s*overflow:\s*hidden;/,
  );
  assert.doesNotMatch(transitionCss, /\.compact-shell\.is-editing \.work-area\s*\{[^}]*overflow:\s*hidden;/);
});

test('the destination snapshot cannot paint its pieces above the moving sheet', () => {
  assert.match(
    transitionCss,
    /\.is-editing \.book-scene \.page-turn-layer \.turn-reveal\s*\{[^}]*z-index:\s*0;[^}]*isolation:\s*isolate;/,
  );
  assert.match(
    transitionCss,
    /\.is-editing \.book-scene \.page-turn-layer \.turn-moving\s*\{[^}]*z-index:\s*1;/,
  );
});

test('successful editor page turns play the paper flip without affecting reading mode', () => {
  assert.match(page, /usePageTurnSound\(\{[\s\S]*?mixkit-page-turn-single-1104\.wav/);
  assert.match(
    page,
    /setTurnSettling\(false\);\s*if\(!reading\)playEditingPageTurnSound\(direction>0\?1:-1\)/,
  );
  assert.equal(paperFlip.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(paperFlip.subarray(8, 12).toString('ascii'), 'WAVE');
});
