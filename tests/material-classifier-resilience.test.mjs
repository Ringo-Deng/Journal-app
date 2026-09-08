import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classificationProposals,
  defaultTaxonomy,
  normalizeClassificationOutput,
} from '../local/material-catalog.mjs';

const assets = [
  { id: 'rose-01', name: '玫瑰图谱 01' },
  { id: 'rose-02', name: '玫瑰图谱 02' },
];

test('one out-of-taxonomy label no longer kills the whole material batch', () => {
  const normalized = normalizeClassificationOutput(
    {
      items: [
        {
          id: 'rose-01',
          group: '装饰贴纸',
          labels: { content: ['植物'], style: ['浪漫'], color: ['粉', '红'] },
          confident: true,
          reason: '玫瑰贴纸',
        },
        {
          id: 'rose-02',
          group: '装饰贴纸',
          labels: { content: ['植物'], style: ['复古'], color: ['粉'] },
          confident: true,
          reason: '玫瑰贴纸',
        },
      ],
    },
    assets,
    defaultTaxonomy,
  );

  const proposals = classificationProposals(normalized, assets, defaultTaxonomy);
  assert.equal(proposals.length, 2);
  assert.deepEqual(proposals[0].labels.style, []);
  assert.deepEqual(proposals[0].labels.color, ['粉']);
  assert.equal(proposals[0].review.pending, true);
  assert.equal(proposals[1].confident, true);
  assert.equal(proposals[1].review, undefined);
});

test('missing or extra AI rows are isolated instead of invalidating valid rows', () => {
  const normalized = normalizeClassificationOutput(
    {
      items: [
        {
          id: 'rose-01',
          group: '装饰贴纸',
          labels: { content: ['植物'], style: [], color: ['粉'] },
          confident: true,
          reason: 'valid',
        },
        {
          id: 'unknown',
          group: '纸张',
          labels: { content: ['几何符号'], style: [], color: ['黑白灰'] },
          confident: true,
        },
      ],
    },
    assets,
    defaultTaxonomy,
  );

  const proposals = classificationProposals(normalized, assets, defaultTaxonomy);
  assert.equal(proposals[0].confident, true);
  assert.equal(proposals[1].confident, false);
  assert.match(proposals[1].review.reason, /未返回/);
});
