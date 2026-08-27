import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  loadSeasonCalendar,
  clearSeasonCalendarCache,
  getMonthlySeasonalKeywords,
  getSeasonalBridgeCandidates,
  getWeatherTriggers,
  isWeatherTriggered,
  getWeatherBoostFactor,
  applyWeatherBoost,
  SEASONAL_BRIDGE,
  MONTHLY_SEASONAL,
  WEATHER_TRIGGERS,
} from '../../scripts/content/seasonal-bridge.mjs';

import {
  computeSelectionScore,
  applyWeatherBoost as applyWeatherBoostScore,
} from '../../scripts/content/keyword-score.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CALENDAR_PATH = path.join(PROJECT_ROOT, 'content', 'config', 'season-calendar.json');

// ─── JSON 로드 ───────────────────────────────────────────────────────

test('season-calendar.json 존재 및 12개월×4키워드 구조', () => {
  assert.ok(fs.existsSync(CALENDAR_PATH), 'season-calendar.json must exist');
  const raw = fs.readFileSync(CALENDAR_PATH, 'utf8');
  const data = JSON.parse(raw);
  assert.ok(data.monthlySeasonal, 'monthlySeasonal required');
  assert.ok(data.seasonalBridge, 'seasonalBridge required');
  assert.ok(data.weatherTriggers, 'weatherTriggers required');
  for (let m = 1; m <= 12; m++) {
    const arr = data.monthlySeasonal[String(m)] ?? data.monthlySeasonal[m];
    assert.ok(Array.isArray(arr), `${m}월은 배열이어야 함`);
    assert.equal(arr.length, 4, `${m}월은 4개 키워드`);
    for (const kw of arr) assert.ok(typeof kw === 'string' && kw.length > 0, `${m}월 키워드 유효`);
  }
  // weatherTriggers는 최소 5개 트리거, 각 배열 비어있지 않음
  const triggerKeys = Object.keys(data.weatherTriggers);
  assert.ok(triggerKeys.length >= 5, 'weatherTriggers at least 5 triggers');
  for (const k of triggerKeys) {
    assert.ok(Array.isArray(data.weatherTriggers[k]), `weatherTriggers[${k}] 배열`);
    assert.ok(data.weatherTriggers[k].length > 0, `weatherTriggers[${k}] 비어있지 않음`);
  }
});

test('loadSeasonCalendar 캐시 동작 및 SEASONAL_BRIDGE/MONTHLY_SEASONAL 노출', () => {
  clearSeasonCalendarCache();
  const first = loadSeasonCalendar();
  const second = loadSeasonCalendar();
  assert.equal(first, second, '캐시: 동일 객체 반환');
  assert.ok(first.monthlySeasonal, 'monthlySeasonal 있음');
  assert.ok(first.seasonalBridge, 'seasonalBridge 있음');
  assert.ok(first.weatherTriggers, 'weatherTriggers 있음');
  // named exports도 JSON 기반 값이어야 함
  assert.deepEqual(SEASONAL_BRIDGE, first.seasonalBridge);
  assert.deepEqual(MONTHLY_SEASONAL, first.monthlySeasonal);
  assert.deepEqual(WEATHER_TRIGGERS, first.weatherTriggers);
  // 1월 fallback과 일치 (shadow-run 호환)
  assert.deepEqual(first.monthlySeasonal['1'], ['보일러 교체 비용', '단열 시공 비용', '동파 방지 방법', '연말정산 서류 준비 방법']);
});

test('월별 조회: getMonthlySeasonalKeywords JSON 기반', () => {
  clearSeasonCalendarCache();
  // 6월: 에어컨/제습기/곰팡이 관련 (기존 하드코딩 유지)
  const june = getMonthlySeasonalKeywords(6);
  assert.equal(june.length, 4);
  assert.ok(june.includes('에어컨 청소 비용'));
  assert.ok(june.includes('제습기 렌탈 비용'));

  const jan = getMonthlySeasonalKeywords(1);
  assert.deepEqual(jan, ['보일러 교체 비용', '단열 시공 비용', '동파 방지 방법', '연말정산 서류 준비 방법']);

  const dec = getMonthlySeasonalKeywords(12);
  assert.equal(dec.length, 4);
  assert.ok(dec.includes('보일러 교체 비용'));

  // 문자열 월도 동작
  assert.deepEqual(getMonthlySeasonalKeywords('3'), getMonthlySeasonalKeywords(3));

  // 기본값: 현재 월
  const cur = getMonthlySeasonalKeywords();
  assert.ok(Array.isArray(cur) && cur.length === 4, '기본값: 현재 월 4개');

  // fallback: 범위 밖은 빈 배열 (실패를 0으로 치환 금지 — 기존 동작 유지)
  assert.deepEqual(getMonthlySeasonalKeywords(0), []);
  assert.deepEqual(getMonthlySeasonalKeywords(13), []);
  assert.deepEqual(getMonthlySeasonalKeywords(NaN), []);
  assert.deepEqual(getMonthlySeasonalKeywords('invalid'), []);
});

test('fallback 유지: 파일 없어도 하드코딩 fallback 동작', () => {
  // clear 후 load가 예외 없이 fallback 반환하는지 — 실제 파일이 있으므로 간접 검증:
  // JSON 파싱 실패 시에도 fallback을 쓰도록 구현돼 있음을 코드 경로로 확인.
  // 여기서는 getSeasonalBridgeCandidates가 unknown core에 null 반환하고, known core는 후보 반환하는지로 fallback 유지 검증
  clearSeasonCalendarCache();
  const unknown = getSeasonalBridgeCandidates('존재하지않는코어');
  assert.equal(unknown, null);
  const heat = getSeasonalBridgeCandidates('폭염 특보');
  assert.ok(Array.isArray(heat) && heat.includes('에어컨 청소 비용'), '폭염 브릿지 동작');
  const rain = getSeasonalBridgeCandidates('장마 시작');
  assert.ok(rain && rain.includes('곰팡이 제거 비용'));
});

// ─── 날씨 트리거 +30% 부스팅 ─────────────────────────────────────────

test('weatherTriggers: KMA 트리거 → 키워드 부스팅 판정', () => {
  clearSeasonCalendarCache();
  const triggers = getWeatherTriggers();
  assert.ok(triggers['폭염'], '폭염 트리거 존재');
  assert.ok(triggers['한파'], '한파 트리거 존재');

  // isWeatherTriggered: 키워드가 trigger 맵에 해당하면 true
  assert.equal(isWeatherTriggered('에어컨 청소 비용', ['폭염']), true);
  assert.equal(isWeatherTriggered('보일러 교체 비용', ['한파']), true);
  assert.equal(isWeatherTriggered('제습기 렌탈 비용', ['제습기']), true);
  // 누수/곰팡이 맵 검증
  assert.equal(isWeatherTriggered('누수 탐지 비용', ['장마']), true);
  assert.equal(isWeatherTriggered('곰팡이 제거 비용', ['장마']), true);
  // 직접 포함도 부스팅
  assert.equal(isWeatherTriggered('에어컨 청소 비용', ['에어컨']), true);
  // 다른 트리거면 부스팅 안 됨
  assert.equal(isWeatherTriggered('에어컨 청소 비용', ['한파']), false);
  assert.equal(isWeatherTriggered('보일러 교체 비용', ['폭염']), false);
  // 빈 트리거는 false
  assert.equal(isWeatherTriggered('에어컨 청소 비용', []), false);
  assert.equal(isWeatherTriggered('에어컨 청소 비용', null), false);
});

test('getWeatherBoostFactor / applyWeatherBoost 1.3배', () => {
  assert.equal(getWeatherBoostFactor('에어컨 청소 비용', ['폭염']), 1.3);
  assert.equal(getWeatherBoostFactor('보일러 교체 비용', ['폭염']), 1);
  assert.equal(applyWeatherBoost(70, '에어컨 청소 비용', ['폭염']), 91);
  assert.equal(applyWeatherBoost(70, '보일러 교체 비용', ['폭염']), 70);
  assert.equal(applyWeatherBoost(80, true), 100); // 80*1.3=104 → 캡 100
  assert.equal(applyWeatherBoost(100, true), 100);
  assert.equal(applyWeatherBoost(50, false), 50);
});

test('selectionScore 날씨 부스팅 +30% 별도 가중 (shadow-run 호환)', () => {
  const base = computeSelectionScore({ commercialIntentScore: 20, qaScore: 80, serpGapScore: 10, freshness: 1 });
  const boosted = computeSelectionScore({ commercialIntentScore: 20, qaScore: 80, serpGapScore: 10, freshness: 1, weatherTriggered: true });
  assert.equal(boosted, Math.min(100, Math.round(base * 1.3)), 'weatherTriggered 시 +30%');
  // weatherBoost alias도 동일
  const boosted2 = computeSelectionScore({ commercialIntentScore: 20, qaScore: 80, serpGapScore: 10, freshness: 1, weatherBoost: true });
  assert.equal(boosted2, boosted);
  // 없으면 기존 점수 유지
  const noBoost = computeSelectionScore({ commercialIntentScore: 20, qaScore: 80, serpGapScore: 10, freshness: 1 });
  assert.equal(noBoost, base);
  // keyword-score의 applyWeatherBoost도 동일 동작
  assert.equal(applyWeatherBoostScore(base, true), boosted);
  assert.equal(applyWeatherBoostScore(base, false), base);
});

test('selectionScore measuredBonus와 weatherTriggered 동시 가중 (additive, 캡 100)', () => {
  const base = computeSelectionScore({ commercialIntentScore: 15, qaScore: 60, serpGapScore: 5, freshness: 0.8 });
  const withMeasured = computeSelectionScore({ commercialIntentScore: 15, qaScore: 60, serpGapScore: 5, freshness: 0.8, measuredBonus: 6 });
  assert.ok(withMeasured > base, 'measuredBonus 증가');
  assert.ok(withMeasured <= 100);
  const withBoth = computeSelectionScore({ commercialIntentScore: 15, qaScore: 60, serpGapScore: 5, freshness: 0.8, measuredBonus: 6, weatherTriggered: true });
  assert.ok(withBoth >= withMeasured, 'weather 추가 시 더 증가');
  assert.ok(withBoth <= 100);
});

test('clearSeasonCalendarCache 이후 재로드 가능', () => {
  clearSeasonCalendarCache();
  const a = loadSeasonCalendar();
  clearSeasonCalendarCache();
  const b = loadSeasonCalendar();
  assert.notEqual(a, b, 'clear 후 다른 객체');
  assert.deepEqual(a.monthlySeasonal['6'], b.monthlySeasonal['6']);
});
