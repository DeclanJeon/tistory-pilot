import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTrendCore,
  buildCandidates,
  inferContentType,
  mapCategory
} from '../../scripts/content/trends-monetize.mjs';

test('cleanTrendCore removes celebrities and news noise', () => {
  assert.equal(cleanTrendCore('강경준'), '');
  assert.equal(cleanTrendCore('태풍 찬홈 경로'), '');
  assert.equal(cleanTrendCore('김용건'), '');
  assert.equal(cleanTrendCore('에어컨 청소'), '에어컨 청소');
  assert.equal(cleanTrendCore('엘리베이터 (노후)'), '엘리베이터');
  assert.equal(cleanTrendCore('실시간 주담대 금리'), '주담대 금리');
  assert.equal(cleanTrendCore('(속보) 폭우 피해'), '');
});

test('buildCandidates creates commercial suffixes without verb doubling', () => {
  const homeCandidates = buildCandidates('에어컨 청소', '이사·청소·주거');
  assert.ok(homeCandidates.includes('에어컨 청소 비용'));
  assert.ok(!homeCandidates.some((k) => k.includes('청소 설치') || k.includes('설치 청소')), 'no verb doubling');
  assert.ok(homeCandidates.includes('에어컨 청소 가격'));

  const nounCandidates = buildCandidates('엘리베이터', '생활·정보');
  assert.ok(nounCandidates.includes('엘리베이터 비용'));

  // core가 이미 "신청"으로 끝나면 "신청 방법"이 아니라 "방법"만 붙는다
  const processCandidates = buildCandidates('전기차 보조금 신청', '생활·정보');
  assert.ok(processCandidates.includes('전기차 보조금 신청 방법'));
  assert.ok(!processCandidates.some((k) => k.includes('신청 신청')), 'no 신청 duplication');
});

test('inferContentType maps money-oriented suffixes', () => {
  assert.equal(inferContentType('엘리베이터 설치 비용'), 'cost');
  assert.equal(inferContentType('보조금 신청 방법'), 'process');
  assert.equal(inferContentType('에어컨 고장 원인'), 'problem');
  assert.equal(inferContentType('제습기 추천'), 'cost');
});

test('mapCategory routes home services vs life services', () => {
  assert.equal(mapCategory('에어컨 청소'), '이사·청소·주거');
  assert.equal(mapCategory('엘리베이터 설치'), '이사·청소·주거');
  assert.equal(mapCategory('전기차 보조금'), '생활·정보');
  assert.equal(mapCategory('보험료 환급'), '생활·정보');
});
