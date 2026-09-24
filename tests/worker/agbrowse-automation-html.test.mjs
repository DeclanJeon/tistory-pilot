import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTistoryBodyHtml } from '../../src/worker/agbrowse-automation.mjs';

const sampleHtml = `<!doctype html>
<html lang="ko">
<head><title>샘플 제목</title><meta name="description" content="설명"></head>
<body>
  <main class="wrap">
    <article class="post">
      <header>
        <p class="eyebrow">SNS Trend</p>
        <h1>샘플 제목</h1>
        <p class="meta">2026-06-23</p>
        <p class="lead">첫 문단 리드다.</p>
        <figure class="hero"><img src="assets/hero.png" alt="히어로"><figcaption>대표 이미지</figcaption></figure>
      </header>
      <section>
        <h2>본문 섹션</h2>
        <p>정리된 본문이다.</p>
        <p><a href="https://example.com/source">출처 링크</a></p>
      </section>
      <section>
        <h2>함께 읽을 글</h2>
        <div class="related"><a href="topic-02.html">내부 링크</a></div>
      </section>
      <footer class="footer"><p>파일명: sample.html · post_id: 001</p></footer>
    </article>
  </main>
</body>
</html>`;

test('buildTistoryBodyHtml strips wrapper html and keeps article content only', () => {
  const html = buildTistoryBodyHtml({
    title: '샘플 제목',
    body: sampleHtml,
    description: '설명',
    bodyImageDataUrls: {
      'assets/hero.png': 'data:image/png;base64,AAAA'
    }
  });

  assert.doesNotMatch(html, /<!doctype html/i);
  assert.doesNotMatch(html, /<html\b/i);
  assert.doesNotMatch(html, /<body\b/i);
  assert.doesNotMatch(html, /샘플 제목<\/h1>/);
  assert.doesNotMatch(html, /함께 읽을 글/);
  assert.doesNotMatch(html, /파일명:/);
  assert.doesNotMatch(html, /class=/);
  assert.match(html, /첫 문단 리드다/);
  assert.match(html, /<h2>본문 섹션<\/h2>/);
  assert.match(html, /data:image\/png;base64,AAAA/);
  assert.match(html, /href="https:\/\/example.com\/source"/);
});

test('buildTistoryBodyHtml inlines body assets and places the hero image in HTML', () => {
  const paragraph = '본문 이미지가 발행 전에 업로드되도록 실제 경로를 data URL로 치환한다. '.repeat(18);
  const html = buildTistoryBodyHtml({
    title: '이미지 업로드 테스트',
    body: `<div style="font-size:16px;line-height:1.82;color:#1f2937;max-width:800px;margin:0 auto;"><h1>이미지 업로드 테스트</h1><p>${paragraph}</p><p>${paragraph}</p><h2>검증 섹션</h2><p>${paragraph}</p><img src="assets/body.png" alt="본문"></div>`,
    heroImageDataUrl: 'data:image/png;base64,HERO',
    bodyImageDataUrls: { 'assets/body.png': 'data:image/png;base64,BODY' }
  });

  assert.match(html, /data:image\/png;base64,HERO/);
  assert.match(html, /data:image\/png;base64,BODY/);
  assert.match(html, /data-tistory-hero="true"/);
  assert.doesNotMatch(html, /src="assets\/body\.png"/);
});