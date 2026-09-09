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
