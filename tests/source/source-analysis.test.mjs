import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSourceBundle } from '../../src/core/source/source-analysis.mjs';

test('analysis recommends roundup template and series for multi-source bundles', () => {
  const source = {
    sourceCount: 3,
    textLength: 7600,
    images: [{ url: 'https://a/img1.png' }, { url: 'https://a/img2.png' }],
    sources: [
      { blocks: [{ type: 'paragraph', text: 'a'.repeat(1200) }, { type: 'heading', text: 'H1' }] },
      { blocks: [{ type: 'paragraph', text: 'b'.repeat(1200) }, { type: 'heading', text: 'H2' }] },
      { blocks: [{ type: 'paragraph', text: 'c'.repeat(1200) }, { type: 'heading', text: 'H3' }, { type: 'list', items: ['x', 'y'] }] }
    ]
  };

  const result = analyzeSourceBundle(source);
  assert.equal(result.recommendedTemplateId, 'curation-roundup');
  assert.equal(result.estimatedPosts.strategy, 'series');
  assert.equal(result.estimatedPosts.recommendedPosts >= 2, true);
});

test('analysis keeps compact single-source content as a single news briefing', () => {
  const source = {
    sourceCount: 1,
    title: '간단한 업데이트',
    textLength: 900,
    images: [],
    blocks: [
      { type: 'paragraph', text: '짧은 문단 하나' },
      { type: 'paragraph', text: '짧은 문단 둘' }
    ]
  };

  const result = analyzeSourceBundle(source);
  assert.equal(result.recommendedTemplateId, 'news-briefing');
  assert.equal(result.estimatedPosts.recommendedPosts, 1);
});
