import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTitle,
  tokenizeTitle,
  parseRss,
  matchByTitle,
  normalizeKeywordId,
  isAlreadyPublished
} from '../../scripts/lib/published-posts.mjs';

// ─── normalizeTitle ──────────────────────────────────────────────────

test('정규화: 연도 제거, 숫자-한글 분리, 엔티티 해제, 소문자', () => {
  assert.equal(normalizeTitle('2026 정수기 렌탈 비교 총정리 | 업체별 가격표'), '정수기 렌탈 비교 총정리 업체별 가격표');
  assert.equal(normalizeTitle('2026년 전기차 보조금 신청 총정리'), '전기차 보조금 신청 총정리');
  assert.equal(normalizeTitle('30평 입주청소 비용'), '30 평 입주청소 비용');
  assert.equal(normalizeTitle('Docker 입문 가이드 2026 &ndash; 컨테이너 기초'), 'docker 입문 가이드 컨테이너 기초');
  assert.equal(normalizeTitle('9급공무원월급'), '9 급공무원월급');
  assert.equal(normalizeTitle('무료 AI 도구 모음 2026년, 돈 한 푼 안 쓰고'), '무료 ai 도구 모음 돈 한 푼 안 쓰고');
});

test('토큰화: 2자 미만 토큰 제외', () => {
  assert.deepEqual(tokenizeTitle('30평 입주청소 비용'), ['30', '입주청소', '비용']);
});

// ─── parseRss ────────────────────────────────────────────────────────

test('RSS XML에서 item 목록 파싱', () => {
  const xml = `<?xml version="1.0"?><rss><channel><item>
    <title>2026 정수기 렌탈 비교 총정리</title>
    <link>https://acstory.tistory.com/973</link>
    <pubDate>Tue, 4 Aug 2026 20:24:42 +0900</pubDate>
  </item></channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '2026 정수기 렌탈 비교 총정리');
  assert.equal(items[0].url, 'https://acstory.tistory.com/973');
});

// ─── matchByTitle: 실제 중복 사례 (RSS 실측) ─────────────────────────

// 2026-08-04 RSS에서 확인된 실중복: 같은 주제가 두 번 발행된 8쌍
const published = [
  { title: '2026 정수기 렌탈 비교 총정리 | 업체별 가격표와 비용 아끼는 꿀팁', url: '…/973' },
  { title: '무료 AI 도구 모음 2026년, 돈 한 푼 안 쓰고 업무 생산성 3배 높이는 실전 가이드', url: '…/972' },
  { title: 'ChatGPT 활용법 2026 총정리: 초보자도 쉽게 따라 하는 AI 실전 가이드', url: '…/971' },
  { title: 'Docker 입문 가이드 2026 &ndash; 컨테이너 기초부터 실전 배포까지', url: '…/970' },
  { title: '2026년 공무원 봉급표 총정리 | 9급공무원월급 얼마일까? 호봉별 급여 확인', url: '…/968' },
  { title: '2026년 전기차 보조금 신청 총정리, 자격&middot;한도&middot;지자체별 혜택까지', url: '…/967' },
  { title: '2026년 알뜰폰 요금제 비교, 저렴한 통신사 선택 가이드', url: '…/966' },
  { title: '챗GPT vs 클로드 - 2026년 AI 서비스 비교 가이드', url: '…/963' },
  { title: '정수기 렌탈 위약금 계산부터 해지 0원까지 완벽 가이드', url: '…/958' },
  { title: '입주청소가격 얼마나 할까? 30평 입주청소 비용 비교와 업체 선택 노하우', url: '…/953' },
  { title: '에어컨 전기료 계산 방법과 여름 전기세 절약 꿀팁 총정리', url: '…/949' },
  { title: 'Cursor AI 코딩 사용법 완벽 가이드 &ndash; 설치부터 꿀팁까지', url: '…/940' },
  { title: '2026년 이사업체 견적 질문 체크리스트: 비교표와 비용 항목별 상세 안내', url: '…/969' }
];

test('실중복 8쌍이 모두 중복으로 판정된다', () => {
  const cases = [
    // 08-04 재발행분 (이미 발행된 주제를 다시 큐잉)
    { keyword: '정수기 렌탈 비교', title: '2026 정수기 렌탈 비교 총정리 | 업체별 가격표와 비용 아끼는 꿀팁' },
    { keyword: '무료 AI 도구 모음 2026', title: '무료 AI 도구 모음 2026년, 돈 한 푼 안 쓰고 업무 생산성 3배 높이는 실전 가이드' },
    { keyword: 'ChatGPT 활용법 모음', title: 'ChatGPT 활용법 2026 총정리: 초보자도 쉽게 따라 하는 AI 실전 가이드' },
    { keyword: 'Docker 입문 가이드', title: 'Docker 입문 가이드 2026 – 컨테이너 기초부터 실전 배포까지' },
    // 08-01 재발행분
    { keyword: '공무원 봉급표 2026', title: '2026년 공무원 봉급표 총정리 | 9급공무원월급 얼마일까? 호봉별 급여 확인' },
    { keyword: '전기차 보조금 2026', title: '2026년 전기차 보조금 신청 총정리, 자격·한도·지자체별 혜택까지' },
    { keyword: '알뜰폰 요금제 비교', title: '2026년 알뜰폰 요금제 비교, 저렴한 통신사 선택 가이드' },
    { keyword: 'Claude AI 비교 ChatGPT', title: '챗GPT vs 클로드 - 2026년 AI 서비스 비교 가이드' }
  ];
  for (const c of cases) {
    const result = matchByTitle(c, published);
    assert.equal(result.matched, true, `${c.keyword} → 중복으로 잡혀야 한다 (got ${result.rule})`);
    assert.ok(result.rule, '판정 규칙이 있어야 한다');
  }
});

test('차단이 필요한 곧 발행될 후보도 중복으로 판정된다 (life-01, tech-03)', () => {
  assert.equal(matchByTitle({ keyword: '에어컨 전기료 계산' }, published).matched, true);
  assert.equal(matchByTitle({ keyword: 'Cursor AI 코딩 사용법' }, published).matched, true);
});

test('서로 다른 주제는 중복으로 판정하지 않는다', () => {
  const distinct = [
    { keyword: '원룸 용달이사 비용', title: '원룸 용달이사 비용: 2026년 이사 준비와 항목별 견적 가이드' },
    { keyword: '포장이사 비용', title: '2026년 포장이사비용 견적비교, 이사 전 꼭 필요한 체크리스트 정리' },
    { keyword: '이사 추가요금 방지', title: '2026년 이사 추가요금 방지, 계약서에 꼭 넣어야 할 7가지 조항' },
    { keyword: '누수 탐지 비용', title: '2026 누수 탐지 비용 가이드 | 항목별 가격표와 견적 받는 법' },
    { keyword: '도배 비용', title: '도배비용 24~34평 평수별 견적과 항목별 가격표 | 2026년 인테리어 기준' }
  ];
  for (const c of distinct) {
    const result = matchByTitle(c, published);
    assert.equal(result.matched, false, `${c.keyword} → 중복이 아니어야 한다 (got ${result.rule})`);
  }
});

test('정수기 렌탈 위약금 vs 정수기 렌탈 비교는 다른 주제지만 바이그램 규칙상 보수적 차단 허용', () => {
  // "정수기 렌탈" 바이그램이 겹쳐 차단될 수 있다(의도적 보수 설계) — 이미 발행된 주제라 손실 없음.
  // 여기서는 판정 자체가 일관됨만 확인한다.
  const a = matchByTitle({ keyword: '정수기 렌탈 비교' }, [{ title: '정수기 렌탈 위약금 계산부터 해지 0원까지 완벽 가이드' }]);
  const b = matchByTitle({ keyword: '정수기 렌탈 위약금' }, [{ title: '정수기 렌탈 비교 총정리 | 업체별 가격표와 비용 아끼는 꿀팁' }]);
  assert.equal(a.matched, b.matched, '같은 바이그램 겹침은 대칭적으로 판정');
});

// ─── normalizeKeywordId ──────────────────────────────────────────────

test('큐 ID에서 기본 키워드 ID 추출 (-v2, 날짜 접미사 제거)', () => {
  assert.equal(normalizeKeywordId('tech-01-v2'), 'tech-01');
  assert.equal(normalizeKeywordId('life-02-2026-07-30'), 'life-02');
  assert.equal(normalizeKeywordId('move-04'), 'move-04');
  assert.equal(normalizeKeywordId('tech-01-v2-2026-07-28'), 'tech-01');
});

// ─── isAlreadyPublished (원장 + RSS 통합) ────────────────────────────

test('원장 ID 매칭: 같은 기본 키워드 ID는 중복', () => {
  const ledger = [{ id: 'tech-01', keyword: 'ChatGPT 활용법 모음', title: 'ChatGPT 활용법 모음' }];
  assert.equal(isAlreadyPublished({ id: 'tech-01-v2', keyword: 'ChatGPT 활용법 모음' }, { ledger }).matched, true);
  assert.equal(isAlreadyPublished({ id: 'move-04', keyword: '에어컨 청소 비용' }, { ledger }).matched, false);
});

test('RSS 제목 매칭: 원장이 비어도 실제 블로그 기준으로 중복 판정', () => {
  const result = isAlreadyPublished(
    { id: 'life-04', keyword: '정수기 렌탈 비교' },
    { ledger: [], rssTitles: published }
  );
  assert.equal(result.matched, true);
  assert.equal(result.source, 'rss');
});

test('RSS/원장이 모두 비면 중복 아님', () => {
  assert.equal(isAlreadyPublished({ id: 'brand-new-01', keyword: '아무개 주제' }, { ledger: [], rssTitles: [] }).matched, false);
});
