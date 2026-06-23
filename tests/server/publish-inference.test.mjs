import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlDescription, htmlTitle, inferCategory, stripHtml } from '../../src/server/static/publish-inference.js';

test('publish inference classifies social trend html away from tech', () => {
  const text = 'K팝 챌린지와 해시태그 사례 모음, 팬덤과 SNS 트렌드를 정리한다.';
  assert.equal(inferCategory(text), '사회·이슈');
});

test('publish inference keeps tech content in IT category', () => {
  const text = 'Node.js API 서버와 React 프론트엔드, Docker 배포 흐름을 설명한다.';
  assert.equal(inferCategory(text), 'IT·테크');
});

test('publish inference extracts html title and description', () => {
  const html = '<html><head><title>샘플 제목</title><meta name="description" content="짧은 설명"></head><body><p>본문</p></body></html>';
  assert.equal(htmlTitle(html), '샘플 제목');
  assert.equal(htmlDescription(html), '짧은 설명');
  assert.equal(stripHtml(html), '샘플 제목 본문');
});