/**
 * QA 누출 검사 테스트 (2026-08-20 테스트 발행 실측 결함 기반)
 * - 마크다운 이미지/링크 누출 → fail
 * - 중국어/일본어 혼입 → fail
 * - 소스 인용 마커 없음 → fail (sourceType=transcript)
 * - verbatim 복붙 → warning
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qaHtmlPost, qaHtmlPostWithMarket } from '../../scripts/content/qa-post.mjs';

const GOOD = `<div style="font-size:16px;line-height:1.82;color:#1f2937;">
<h1>쿠팡 위탁판매 하는법 2026</h1>
<p>쿠팡 위탁판매를 시작하려면 판매자 센터에 가입해야 합니다. 사기 광고를 조심해야 합니다 (출처: 부업사기X파일 유튜브 채널). 실제 위탁판매는 정식 절차로 진행됩니다.</p>
<p>도매업체에서 상품 정보를 받아 등록하고, 주문이 들어오면 공급자가 배송하는 구조입니다. 초기 자본이 적은 분들에게 적합합니다.</p>
<p>수수료는 카테고리마다 다르며, 정산은 보통 2주 단위로 이루어집니다. 처음에는 소량으로 테스트하는 것을 추천합니다.</p>
<h2>💡 준비물</h2>
<p>판매자 계정과 본인 인증이 필요합니다. 사업자등록증이 있으면 세금 처리에 유리합니다.</p>
<h2>⚙️ 단계별 방법</h2>
<p>첫 단계는 판매자 센터 가입입니다. 이후 상품 등록, 광고 설정 순서로 진행합니다.</p>
<h2>⚠️ 사기 예방</h2>
<p>일하기 전에 돈을 요구하면 사기입니다. 공식 경로로만 진행하세요 (출처: 쿠팡 공지사항).</p>
<h2>📌 마무리</h2>
<p>위탁판매는 꾸준함이 중요합니다. 안전하게 시작하세요.</p>
<div style="background:#fefce8;border:1px solid #fde68a;">💡 인사이트 박스</div>
<div style="background:#eff6ff;border-left:4px solid #3b82f6;">정보 박스</div>
</div>`;

test('정상 글은 마크다운/CJK 누출 검사를 통과한다', () => {
  const r = qaHtmlPost(GOOD, { title: '쿠팡 위탁판매 하는법 2026', keyword: '쿠팡 위탁판매' });
  const codes = r.failures.map(f => f.code);
  assert.ok(!codes.includes('markdown-leak'), `markdown-leak 발생: ${JSON.stringify(r.failures)}`);
  assert.ok(!codes.includes('cjk-mixed'));
});

test('마크다운 이미지 누출은 fail 이다', () => {
  const bad = GOOD + '<p>![쿠팡 흐름도](https://via.placeholder.com/800x400)</p>';
  const r = qaHtmlPost(bad, { title: '쿠팡 위탁판매 하는법 2026', keyword: '쿠팡 위탁판매' });
  assert.ok(r.failures.some(f => f.code === 'markdown-leak'));
});

test('마크다운 링크 누출은 fail 이다', () => {
  const bad = GOOD + '<p>[참고](https://example.com/guide)</p>';
  const r = qaHtmlPost(bad, { title: '쿠팡 위탁판매 하는법 2026', keyword: '쿠팡 위탁판매' });
  assert.ok(r.failures.some(f => f.code === 'markdown-leak'));
});

test('중국어/일본어 혼입은 fail 이다', () => {
  const bad = GOOD.replace('위탁판매를 시작하려면', '위탁판매를 开始하려면');
  const r = qaHtmlPost(bad, { title: '쿠팡 위탁판매 하는법 2026', keyword: '쿠팡 위탁판매' });
  assert.ok(r.failures.some(f => f.code === 'cjk-mixed'), JSON.stringify(r.failures));
});

test('placeholder 이미지 URL은 fail 이다', () => {
  const bad = GOOD + '<figure><img src="https://via.placeholder.com/800x400" /><figcaption>흐름도</figcaption></figure>';
  const r = qaHtmlPost(bad, { title: '쿠팡 위탁판매 하는법 2026', keyword: '쿠팡 위탁판매' });
  assert.ok(r.failures.some(f => f.code === 'placeholder-image'), JSON.stringify(r.failures));
});

test('트랜스크립트 소스 글에 인용 마커가 없으면 fail 이다', () => {
  const r = qaHtmlPost(GOOD.replace(/\(출처:[^)]*\)/g, ''), {
    title: '쿠팡 위탁판매 하는법 2026',
    keyword: '쿠팡 위탁판매',
    sourceType: 'transcript'
  });
  assert.ok(r.failures.some(f => f.code === 'missing-source-citation'));
});

test('소스 원문과 12-gram 겹침이 60%를 넘으면 warning 이다', () => {
  const srcText = '쿠팡 위탁판매를 시작하려면 판매자 센터에 가입해야 합니다. 사기 광고를 조심해야 합니다.';
  // srcText를 반복해 겹침 비율 높임 (25회 × 45자 ≈ 1125자 — 전체의 60%+ 목표)
  const repeated = GOOD + `<p>${srcText.repeat(25)}</p>`;
  const r = qaHtmlPost(repeated, {
    title: '쿠팡 위탁판매 하는법 2026',
    keyword: '쿠팡 위탁판매',
    sourceTexts: [{ title: 'src.md', text: srcText.repeat(40) }]
  });
  assert.ok(r.warnings.some(w => w.code === 'possible-verbatim'), JSON.stringify(r.warnings));
});

test('자동 생성 글의 provenance 하드 게이트는 구조화 출처가 없으면 fail 이다', async () => {
  const r = await qaHtmlPostWithMarket(GOOD, {
    title: '쿠팡 위탁판매 하는법 2026',
    keyword: '쿠팡 위탁판매',
    marketResearch: false,
    provenanceHard: true
  });
  assert.ok(r.failures.some(f => f.code === 'source-missing-hard'), JSON.stringify(r.failures));
});

test('provenance 하드 게이트는 본문 인용 표시가 없으면 fail 이다', async () => {
  const r = await qaHtmlPostWithMarket(GOOD.replace(/\(출처:[^)]*\)/g, ''), {
    title: '쿠팡 위탁판매 하는법 2026',
    keyword: '쿠팡 위탁판매',
    sourceBundle: [{ url: 'https://www.coupang.com/notice', title: '공식 안내' }],
    marketResearch: false,
    provenanceHard: true
  });
  assert.ok(r.failures.some(f => f.code === 'source-citation-missing'), JSON.stringify(r.failures));
});
