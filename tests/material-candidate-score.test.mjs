import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseMaterialCandidate, materialCandidateScore, materialFallbackModes, summarizeMaterialCandidate} from '../lib/material-candidate-score.mjs';

const result = (items, width = 1000, height = 1000) => ({width, height, items});
const item = (width, height, bounds) => ({width, height, bounds, file: Math.random().toString(16).slice(2)+'.png'});

test('healthy multi-item result does not spend time on fallback modes', () => {
  const healthy = result([
    item(220, 240, [.08,.10,.22,.24]), item(240, 210, [.38,.12,.24,.21]), item(210, 230, [.68,.11,.21,.23]),
  ]);
  assert.deepEqual(materialFallbackModes(healthy), []);
  assert.equal(summarizeMaterialCandidate(healthy).fullFrame, false);
});

test('full-frame result asks for bounded panel and dense fallbacks', () => {
  const full = result([item(980, 970, [.01,.01,.98,.97])]);
  assert.deepEqual(materialFallbackModes(full), ['panels','dense']);
  assert.equal(summarizeMaterialCandidate(full).fullFrame, true);
});

test('clear strip partition can replace a weak full-frame primary', () => {
  const primary = {mode:'auto', primary:true, result:result([item(990,990,[.005,.005,.99,.99])])};
  const panels = {mode:'panels', result:result([
    item(1000,210,[0,.02,1,.21]), item(1000,200,[0,.27,1,.20]), item(1000,205,[0,.52,1,.205]), item(1000,210,[0,.77,1,.21]),
  ])};
  const chosen = chooseMaterialCandidate([primary, panels]);
  assert.equal(chosen.mode, 'panels');
  assert.ok(materialCandidateScore(panels.result) > materialCandidateScore(primary.result));
});

test('over-fragmented dense result cannot displace a usable primary', () => {
  const primary = {mode:'auto', primary:true, result:result([item(990,990,[.005,.005,.99,.99])])};
  const pieces = Array.from({length:45}, (_, index) => item(18,18,[(index%9)/10,Math.floor(index/9)/6,.018,.018]));
  const dense = {mode:'dense', result:result(pieces)};
  assert.equal(chooseMaterialCandidate([primary,dense]).mode, 'auto');
});

test('invalid primary allows a valid fallback without improvement threshold', () => {
  const primary = {mode:'auto', primary:true, result:result([])};
  const paper = {mode:'paper', result:result([item(320,280,[.2,.2,.32,.28])])};
  assert.equal(chooseMaterialCandidate([primary,paper]).mode, 'paper');
  assert.deepEqual(materialFallbackModes(primary.result), ['paper','ai']);
});

test('many intact stickers do not trigger fragmentation retries', () => {
  const sheet = result(Array.from({length:40}, (_, i) => item(100, 100, [(i%8)*.12, Math.floor(i/8)*.18, .1, .1])));
  assert.deepEqual(materialFallbackModes(sheet), []);
});

test('dozens of tiny print fragments try semantic recovery instead of another paper pass', () => {
  const dots = result(Array.from({length:56}, (_, i) => item(25, 25, [(i%14)*.055, .65+Math.floor(i/14)*.03, .025, .025])));
  assert.deepEqual(materialFallbackModes(dots), ['ai','dense']);
});

test('malformed candidate dimensions and out-of-sheet bounds cannot win', () => {
  const primary = {primary:true, result:result([item(200,200,[.1,.1,.2,.2])])};
  for (const broken of [item(Infinity,200,[0,0,.2,.2]),item(200,200,[.9,0,.2,.2]),item(200,200,[0,0,-.2,.2])]) {
    const candidate = {mode:'dense',result:result([broken])};
    assert.equal(summarizeMaterialCandidate(candidate.result).valid,false);
    assert.equal(chooseMaterialCandidate([primary,candidate], {minimumImprovement:0}).result,primary.result);
  }
});

test('higher score cannot replace a candidate if a complete subject disappears', () => {
  const before = [item(200,200,[.05,.05,.2,.2]),item(200,200,[.7,.7,.2,.2])];
  const after = [item(90,200,[.05,.05,.09,.2]),item(90,200,[.16,.05,.09,.2])];
  const primary={primary:true,result:result(before)};
  assert.equal(chooseMaterialCandidate([primary,{result:result(after)}],{minimumImprovement:-100}).result,primary.result);
});

test('native alpha loss is rejected even if bounding boxes stay large', () => {
  const primary={primary:true,result:result([{...item(500,500,[.1,.1,.5,.5]),foregroundPixels:200000}])};
  const broken={result:result([{...item(500,500,[.1,.1,.5,.5]),foregroundPixels:300}])};
  assert.equal(chooseMaterialCandidate([primary,broken],{minimumImprovement:-100}).result,primary.result);
});
