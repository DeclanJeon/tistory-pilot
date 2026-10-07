/**
 * 부업 키워드 게이트/스코어 테스트 (설계 §10)
 * - focusCategories에 부업·재테크 추가 시 게이트 통과
 * - 부업 어휘 보정 후 intent > 0
 * - 기존 키워드 점수 회귀 없음
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreKeyword,
  scoreCommercialIntent,
  DEFAULT_FOCUS_CATEGORIES
} from '../../scripts/content/keyword-score.mjs';

const FOCUS = [...DEFAULT_FOCUS_CATEGORIES, '부업·재테크'];

const SIDE_KEYWORDS = [
  ['side-01', '쿠팡 위탁판매 하는법', 'guide'],
  ['side-02', '쿠팡 위탁판매 수수료', 'cost'],
  ['side-03', '당근마켓 리셀 수익 구조', 'cost'],
  ['side-04', '당근마켓 부업 종류', 'comparison'],
  ['side-05', '네이버 블로그 애드포스트 수익', 'cost'],
  ['side-06', '네이버 블로그 부업 현실', 'guide'],
  ['side-07', 'AI 글쓰기 부업', 'guide'],
  ['side-08', 'ChatGPT 수익화 방법', 'guide'],
  ['side-09', '유튜브 쇼츠 부업 수익 구조', 'cost'],
  ['side-10', '쇼핑쇼츠 부업 하는법', 'guide'],
  ['side-11', '외국인 대상 한국어 가르치기 부업', 'guide'],
  ['side-12', '한국어 과외 플랫폼 비교', 'comparison'],
  ['side-13', '전자책 판매 부업', 'guide'],
  ['side-14', '크몽 전자책 판매 수수료', 'cost'],
  ['side-15', '부업 사기 구분법', 'problem'],
  ['side-16', '재택부업 사기 유형', 'problem'],
  ['side-17', '직장인 투잡 추천', 'comparison'],
  ['side-18', '주부 재택 부업 추천', 'comparison'],
  ['side-19', '하루 1시간 부업', 'guide'],
  ['side-20', '중고거래 리셀 수익', 'cost']
];

test('부업·재테크 카테고리는 focus 게이트를 통과한다 (울타리 추가 시)', () => {
  for (const [id, keyword, contentType] of SIDE_KEYWORDS) {
    const r = scoreKeyword(
      { id, keyword, category: '부업·재테크', contentType, enabled: true },
      { focusCategories: FOCUS, allowLegacySeries: true }
    );
    assert.equal(r.gates.focus.allowed, true, `${id} focus 게이트`);
    assert.equal(r.gates.ymyl.allowed, true, `${id} YMYL 게이트 (비-YMYL)`);
  }
});

test('부업 어휘 보정으로 intent 점수가 0보다 크다', () => {
  for (const [id, keyword] of SIDE_KEYWORDS) {
    const r = scoreCommercialIntent(keyword);
    assert.ok(r.score > 0, `${id} "${keyword}" intent=${r.score} — 어휘 보정 필요`);
  }
});

test('기존 키워드 점수에 부업 어휘가 영향 주지 않는다 (어휘 무충돌)', () => {
  // 부업 어휘가 기존 키워드 문자열에 등장하면 점수가 변한다 — 전수 확인
  const legacy = [
    '포장이사 비용', '입주청소 30평 비용', '에어컨 전기료 계산', '알뜰폰 요금제 비교',
    '정수기 렌탈 비교', '보험금 청구 절차', '중고차 이전등록 비용', 'ISA 추천 2026'
  ];
  const 부업어휘 = ['수익', '정산', '판매', '부업', '투잡', '위탁판매', '리셀', '쇼핑쇼츠',
    '애드포스트', '전자책', '크몽', '당근마켓', '하는법', '사기', '현실', '경험', '수익화'];
  for (const kw of legacy) {
    const hit = 부업어휘.filter(w => kw.includes(w));
    assert.deepEqual(hit, [], `기존 키워드 "${kw}"가 부업 어휘와 충돌: ${hit.join(', ')}`);
  }
});
