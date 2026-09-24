import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTemplateCatalog,
  getTemplateById,
  renderTemplateFallback,
  selectTemplate
} from '../../src/core/templates/catalog.mjs';

test('template catalog exposes five distinct article layouts', () => {
  const catalog = getTemplateCatalog();
  assert.equal(catalog.length, 5);
  assert.equal(new Set(catalog.map(template => template.id)).size, 5);
  for (const template of catalog) {
    assert.ok(template.layout.length >= 5);
    assert.ok(template.prompt.length >= 80);
    assert.equal(getTemplateById(template.id)?.id, template.id);
  }
});

test('template selection is stable per seed while covering the catalog', () => {
  const selected = Array.from({ length: 100 }, (_, index) => selectTemplate({ seed: `post-${index}` }));
  assert.equal(selectTemplate({ seed: 'post-42' }).id, selectTemplate({ seed: 'post-42' }).id);
  assert.equal(new Set(selected.map(template => template.id)).size, 5);
  assert.equal(selectTemplate({ templateId: 'tutorial-guide', seed: 'post-42' }).id, 'tutorial-guide');
});

test('every fallback renderer emits its selected structural shell', () => {
  const catalog = getTemplateCatalog();
  const rendered = catalog.map(template => renderTemplateFallback({
    id: `fallback-${template.id}`,
    keyword: '테스트 주제',
    description: '독자가 판단할 때 필요한 배경과 기준을 정리한다.',
    tags: ['테스트', '구조'],
    templateId: template.id
  }));

  assert.equal(new Set(rendered).size, catalog.length);
  for (const [index, html] of rendered.entries()) {
    assert.match(html, new RegExp(`data-template-id="${catalog[index].id}"`));
    assert.match(html, /<h1>/);
    assert.ok((html.match(/<h2>/g) || []).length >= 5);
    assert.match(html, /<(?:table|blockquote|ol|ul)\b/);
    assert.match(html, /<p[ >]/);
  }
});
