import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDraftFromMarkdown } from '../../src/core/templates/draft-generator.mjs';

test('draft generator auto-selects template and builds a publishable draft body', () => {
  const draft = generateDraftFromMarkdown({
    markdown: '# My Topic\n\n첫 문단이다.\n\n## 세부 사항\n\n두 번째 문단이다.'
  });

  assert.equal(draft.title, 'My Topic');
  assert.equal(typeof draft.description, 'string');
  assert.equal(draft.body.includes('##'), true);
  assert.equal(typeof draft.analysis.recommendedTemplateId, 'string');
});

test('draft generator honors an explicit template choice', () => {
  const draft = generateDraftFromMarkdown({
    markdown: '# Guide\n\n내용',
    templateId: 'tutorial-guide'
  });

  assert.equal(draft.templateId, 'tutorial-guide');
  assert.equal(draft.body.includes('## 준비'), true);
});

test('draft generator falls back to the recommended template when given an unknown template id', () => {
  const draft = generateDraftFromMarkdown({
    markdown: '# Update\n\n짧은 본문',
    templateId: 'not-a-real-template'
  });

  assert.equal(draft.templateId, 'news-briefing');
  assert.equal(draft.templateLabel, '뉴스 브리핑형');
});
