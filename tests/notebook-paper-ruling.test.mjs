import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readingJpgInput } from '../lib/reading-jpg.ts';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = selector => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selectors]) => selectors.trim() === selector)
  .map(([, , body]) => body).join(';');

test('paper ruling scales its spacing and stroke together with the spread width', () => {
  assert.match(rules('.notebook-page-layer'), /--paper-rule-width:\.1cqw/);
  assert.match(rules('.notebook-page-layer'), /--paper-dot-gap:1\.8cqw/);
  for (const [size, line, offset, grid] of [
    ['small', '2.4', '.8', '1.8'], ['medium', '3.2', '1.2', '2.4'], ['large', '4', '1.6', '3'],
  ]) {
    const rule = rules(`.notebook-page-layer.ruling-${size}`);
    for (const [key, value] of [['line-gap', line], ['line-offset', offset], ['grid-gap', grid]]) {
      assert.ok(rule.includes(`--paper-${key}:${value}cqw`));
    }
  }
  for (const style of ['grid', 'dots', 'lines']) {
    const rule = rules(`.notebook-page-layer.paper-${style}>.paper-ruling`);
    assert.match(rule, /var\(--paper-rule-width\)/);
    assert.doesNotMatch(rule, /\dpx/);
  }
});

test('a spread-level line pattern cannot offset a different pattern on an individual page', () => {
  assert.match(rules('.notebook-page-layer>.paper-ruling'), /background-position:0 0/);
  assert.match(rules('.notebook-page-layer.paper-lines>.paper-ruling'), /background-position:0 var\(--paper-line-offset\)/);
  assert.match(rules('.notebook-page-layer.paper-blank>.paper-ruling'), /background-image:none/);
});

test('saved images from the fixed-pixel ruling renderer expire without changing notebook data', () => {
  const book = { id: 'ruling-cache', paperStyle: 'grid', spreads: [{ id: 'a', elements: [], days: [] }] };
  const before = structuredClone(book);
  const input = JSON.parse(readingJpgInput(book, [], 0));
  assert.ok(input.version > 10);
  assert.notEqual(JSON.stringify(input), JSON.stringify({ ...input, version: 10 }));
  assert.deepEqual(book, before);
});
