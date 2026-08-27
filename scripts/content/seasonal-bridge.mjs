#!/usr/bin/env node
/**
 * seasonal-bridge.mjs — 계절/날씨/일상 트렌드 → 수익형 키워드 브릿지
 *
 * cleanTrendCore가 버리던 "폭염/장마/과태료/면허/사다리차/비행기" 같은
 * 일상·계절 트렌드를 돈 되는 키워드로 변환한다.
 *
 * - SEASONAL_BRIDGE: 트렌드 코어 단어가 포함되면 즉시 상업 키워드로 확장
 * - MONTHLY_SEASONAL: 현재 월에 수요가 폭증하는 계절 키워드 (fallback 주입용)
 * - WEATHER_TRIGGERS: 기상 예보 trigger 시 +30% 부스팅 대상 키워드 매핑
 *
 * 데이터는 content/config/season-calendar.json 에서 로드한다.
 * fs.readFileSync + 메모리 캐시로 하드코딩을 제거하고, 파일이 없거나
 * 파싱 실패 시 하드코딩 fallback을 유지해 shadow-run 기존 동작을 보존한다.
 */
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CALENDAR_PATH = path.join(PROJECT_ROOT, 'content', 'config', 'season-calendar.json');

// ─── Fallback (JSON 미존재 시에도 기존 동작 유지) ─────────────────────
const FALLBACK_SEASONAL_BRIDGE = {
  '폭염': ['에어컨 청소 비용', '에어컨 설치 비용', '제습기 렌탈 비용'],
  '장마': ['곰팡이 제거 비용', '제습기 렌탈 비용', '누수 탐지 비용', '베란다 방수 비용'],
  '태풍': ['창문 단열 시공 비용', '지붕 방수 공사 비용', '누수 탐지 비용'],
  '폭우': ['누수 탐지 비용', '옥상 방수 공사 비용'],
  '홍수': ['누수 탐지 비용', '침수 복구 청소 비용'],
  '침수': ['침수 복구 청소 비용', '누수 탐지 비용'],
  '한파': ['보일러 교체 비용', '단열 시공 비용', '보일러 수리 비용'],
  '미세먼지': ['공기청정기 렌탈 비용', '공기청정기 필터 교체 비용'],
  '황사': ['공기청정기 렌탈 비용', '에어컨 청소 비용'],
  '과태료': ['과태료 납부 방법', '과태료 분할 납부 신청 방법', '과태료 감면 신청 방법'],
  '면허': ['운전면허 갱신 방법', '운전면허 적성검사 비용', '운전면허 재발급 신청 방법'],
  '사다리차': ['사다리차 비용', '사다리차 가격 비교', '이사 사다리차 비용'],
  '비행기': ['비행기 티켓 가격 비교', '항공권 예약 방법', '비행기 수하물 규정'],
  '엘리베이터': ['엘리베이터 설치 비용', '엘리베이터 유지보수 비용'],
  '합계출산율': ['출산 지원금 신청 방법', '육아 지원금 신청 방법'],
  '콜레스테롤': ['건강검진 비용', '콜레스테롤 검사 비용'],
  '엔비디아': ['그래픽카드 가격 비교', '게이밍 PC 견적 비교'],
  '폴더블': ['폴더블 스마트폰 가격 비교', '스마트폰 렌탈 비용'],
  '스타벅스': ['스타벅스 텀블러 가격', '카페 창업 비용'],
};

const FALLBACK_MONTHLY_SEASONAL = {
  1: ['보일러 교체 비용', '단열 시공 비용', '동파 방지 방법', '연말정산 서류 준비 방법'],
  2: ['보일러 교체 비용', '입주청소 비용', '이사 비용', '연말정산 환급 신청 방법'],
  3: ['입주청소 비용', '이사 비용', '새학기 학원 비용', '봄맞이 대청소 비용'],
  4: ['이사 비용', '에어컨 청소 비용', '창문 청소 비용', '베란다 확장 비용'],
  5: ['에어컨 청소 비용', '에어컨 설치 비용', '이사 비용', '가정의달 선물 추천'],
  6: ['에어컨 청소 비용', '제습기 렌탈 비용', '곰팡이 제거 비용', '장마 대비 방수 공사 비용'],
  7: ['에어컨 청소 비용', '제습기 렌탈 비용', '곰팡이 제거 비용', '휴가철 렌터카 가격 비교'],
  8: ['에어컨 청소 비용', '제습기 렌탈 비용', '곰팡이 제거 비용', '폭염 대비 단열 시공 비용'],
  9: ['이사 비용', '입주청소 비용', '추석 선물 추천', '벌초 대행 비용'],
  10: ['이사 비용', '단열 시공 비용', '보일러 점검 비용', '김장 준비 비용'],
  11: ['보일러 교체 비용', '단열 시공 비용', '김장 비용', '연말정산 준비 방법'],
  12: ['보일러 교체 비용', '연말정산 서류 준비 방법', '송년회 장소 추천', '크리스마스 선물 추천'],
};

const FALLBACK_WEATHER_TRIGGERS = {
  '폭염': ['에어컨 청소 비용', '에어컨 설치 비용', '제습기 렌탈 비용', '폭염 대비 단열 시공 비용'],
  '장마': ['곰팡이 제거 비용', '제습기 렌탈 비용', '누수 탐지 비용', '베란다 방수 비용', '장마 대비 방수 공사 비용'],
  '태풍': ['창문 단열 시공 비용', '지붕 방수 공사 비용', '누수 탐지 비용'],
  '폭우': ['누수 탐지 비용', '옥상 방수 공사 비용', '침수 복구 청소 비용'],
  '홍수': ['누수 탐지 비용', '침수 복구 청소 비용'],
  '침수': ['침수 복구 청소 비용', '누수 탐지 비용'],
  '한파': ['보일러 교체 비용', '단열 시공 비용', '보일러 수리 비용', '동파 방지 방법', '보일러 점검 비용'],
  '미세먼지': ['공기청정기 렌탈 비용', '공기청정기 필터 교체 비용'],
  '황사': ['공기청정기 렌탈 비용', '에어컨 청소 비용'],
  '제습기': ['제습기 렌탈 비용', '곰팡이 제거 비용'],
  '누수': ['누수 탐지 비용', '베란다 방수 비용', '옥상 방수 공사 비용', '지붕 방수 공사 비용'],
  '곰팡이': ['곰팡이 제거 비용', '제습기 렌탈 비용'],
  '동파': ['동파 방지 방법', '보일러 수리 비용', '보일러 교체 비용'],
  '우산': ['우산', '장마 대비 방수 공사 비용'],
  '제설': ['제설 비용', '동파 방지 방법', '보일러 수리 비용'],
};

// ─── JSON 로드 + 캐시 ──────────────────────────────────────────────────
let _cachedCalendar = null;

export function loadSeasonCalendar() {
  if (_cachedCalendar) return _cachedCalendar;
  try {
    const raw = fs.readFileSync(CALENDAR_PATH, 'utf8');
    const data = JSON.parse(raw);
    const monthlySeasonal = data.monthlySeasonal && typeof data.monthlySeasonal === 'object'
      ? data.monthlySeasonal
      : FALLBACK_MONTHLY_SEASONAL;
    const seasonalBridge = data.seasonalBridge && typeof data.seasonalBridge === 'object'
      ? data.seasonalBridge
      : FALLBACK_SEASONAL_BRIDGE;
    const weatherTriggers = data.weatherTriggers && typeof data.weatherTriggers === 'object'
      ? data.weatherTriggers
      : FALLBACK_WEATHER_TRIGGERS;
    // monthlySeasonal 키 정규화: 숫자 키도 허용되므로 문자열 키로 통일 검증
    const normalizedMonthly = {};
    for (let m = 1; m <= 12; m++) {
      const v = monthlySeasonal[String(m)] ?? monthlySeasonal[m] ?? FALLBACK_MONTHLY_SEASONAL[m];
      normalizedMonthly[m] = Array.isArray(v) ? v : FALLBACK_MONTHLY_SEASONAL[m];
      normalizedMonthly[String(m)] = normalizedMonthly[m];
    }
    _cachedCalendar = {
      monthlySeasonal: normalizedMonthly,
      seasonalBridge,
      weatherTriggers,
      version: data.version ?? 1,
      raw: data,
    };
    return _cachedCalendar;
  } catch {
    const normalizedMonthly = {};
    for (let m = 1; m <= 12; m++) {
      normalizedMonthly[m] = FALLBACK_MONTHLY_SEASONAL[m];
      normalizedMonthly[String(m)] = FALLBACK_MONTHLY_SEASONAL[m];
    }
    _cachedCalendar = {
      monthlySeasonal: normalizedMonthly,
      seasonalBridge: FALLBACK_SEASONAL_BRIDGE,
      weatherTriggers: FALLBACK_WEATHER_TRIGGERS,
      version: 1,
      raw: null,
    };
    return _cachedCalendar;
  }
}

export function clearSeasonCalendarCache() {
  _cachedCalendar = null;
}

// 하위 호환: 기존 named import가 동작하도록 JSON 기반 값으로 노출
// (하드코딩 제거 — 실제 값은 JSON에서 옴)
const _cal = loadSeasonCalendar();
export const SEASONAL_BRIDGE = _cal.seasonalBridge;
export const MONTHLY_SEASONAL = _cal.monthlySeasonal;
export const WEATHER_TRIGGERS = _cal.weatherTriggers;

export function getSeasonalBridgeCandidates(core) {
  const cal = loadSeasonCalendar();
  for (const [key, candidates] of Object.entries(cal.seasonalBridge)) {
    if (String(core || '').includes(key)) return candidates;
  }
  return null;
}

export function getMonthlySeasonalKeywords(month = new Date().getMonth() + 1) {
  const cal = loadSeasonCalendar();
  const m = Number(month);
  if (!Number.isFinite(m) || m < 1 || m > 12) return [];
  return cal.monthlySeasonal[String(m)] ?? cal.monthlySeasonal[m] ?? [];
}

// ─── 날씨 트리거 → 부스팅 판정 ─────────────────────────────────────────

/**
 * 날씨 예보의 activeTriggers(예: KMA가 반환한 ['제습기','누수'] 또는 ['폭염'])가
 * 주어졌을 때, 해당 키워드가 부스팅 대상인지 판정한다.
 * - weatherTriggers 맵의 value 배열에 키워드가 포함되면 부스팅
 * - 또는 키워드 자체가 trigger 문자열을 포함하면 부스팅
 */
export function getWeatherTriggers() {
  return loadSeasonCalendar().weatherTriggers;
}

export function isWeatherTriggered(keyword, activeTriggers) {
  if (!keyword || !Array.isArray(activeTriggers) || activeTriggers.length === 0) return false;
  const kw = String(keyword);
  const triggers = getWeatherTriggers();
  for (const t of activeTriggers) {
    const trigger = String(t || '').trim();
    if (!trigger) continue;
    // 직접 포함: 키워드가 트리거 문자열을 포함하면 즉시 부스팅
    if (kw.includes(trigger)) return true;
    const boostedList = triggers[trigger];
    if (Array.isArray(boostedList) && boostedList.some((b) => kw === b || kw.includes(b) || b.includes(kw))) {
      return true;
    }
  }
  return false;
}

export function getWeatherBoostFactor(keyword, activeTriggers) {
  return isWeatherTriggered(keyword, activeTriggers) ? 1.3 : 1;
}

/**
 * selectionScore 등 점수에 날씨 부스팅 +30% 적용 (별도 가중, 상한 100)
 */
export function applyWeatherBoost(baseScore, keywordOrTriggered, activeTriggers) {
  // 오버로드: applyWeatherBoost(70, true) 또는 applyWeatherBoost(70, '에어컨 청소 비용', ['폭염'])
  let triggered = false;
  if (typeof keywordOrTriggered === 'boolean') {
    triggered = keywordOrTriggered;
  } else if (typeof keywordOrTriggered === 'string') {
    triggered = isWeatherTriggered(keywordOrTriggered, activeTriggers);
  } else if (Array.isArray(keywordOrTriggered)) {
    // applyWeatherBoost(score, ['폭염']) 형태는 keyword 없이 trigger만으로 판정 불가 → false
    triggered = false;
  }
  const base = Math.min(100, Math.max(0, Number(baseScore) || 0));
  if (!triggered) return base;
  return Math.min(100, Math.round(base * 1.3));
}
