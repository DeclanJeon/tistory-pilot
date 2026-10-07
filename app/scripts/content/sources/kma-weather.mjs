#!/usr/bin/env node
/**
 * sources/kma-weather.mjs — 기상청 단기예보 adapter (설계 §3.1)
 *
 * 관심 지역(예: 서울)의 오늘/내일 예보를 조회해 폭우/폭염/한파 등
 * 계절 수요 트리거 신호를 normalized item으로 반환한다.
 *
 * volume -> null, volumeKind -> unknown (예보는 검색량이 아니다).
 * 'trigger' 가 true면 seasonal-bridge 가 해당 키워드를 부스트할 근거가 된다.
 *
 * 키 게이트: KMA_SERVICE_KEY 등록 전에는 unavailable로 반환한다 (0건 치환 금지).
 */
import { validateSourceResult } from './contract.mjs';

const KMA_NOWCAST = 'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';

function readConfig(env = process.env) {
  return {
    serviceKey: env.KMA_SERVICE_KEY || '',
    nx: env.KMA_NX || '60',
    ny: env.KMA_NY || '127',
    baseDate: env.KMA_BASE_DATE || ''
  };
}

export function decodePty(code) {
  const map = { '0': null, '1': 'rain', '2': 'rain-snow', '3': 'snow', '4': 'shower' };
  return map[String(code)] || null;
}

export function decodeSky(code) {
  const map = { '1': 'sunny', '3': 'cloudy', '4': 'overcast' };
  return map[String(code)] || null;
}

function ptyToTrigger(pty) {
  if (!pty) return [];
  if (pty === 'rain' || pty === 'shower' || pty === 'rain-snow') {
    return ['제습기', '누수', '곰팡이', '우산'];
  }
  if (pty === 'snow') return ['한파', '동파', '제설'];
  return [];
}

// forecast: base일 YYYYMMDD. 시나리오(내일 예보)를 위해 base+1일 기준으로 조회한다.
export function todayKyungyoDate(offsetDays = 1) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const yyyy = String(d.getFullYear()).padStart(4, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export async function fetchKmaWeather({ env = process.env, ttlSeconds = 3 * 60 * 60 } = {}) {
  const cfg = readConfig(env);
  if (!cfg.serviceKey) {
    return validateSourceResult({
      source: 'kma-weather',
      status: 'unavailable',
      items: [],
      error: 'KMA_SERVICE_KEY 미등록 — 기상청 예보 조회 불가'
    });
  }
  const baseDate = cfg.baseDate || todayKyungyoDate(1);
  const url =
    `${KMA_NOWCAST}?serviceKey=${encodeURIComponent(cfg.serviceKey)}` +
    `&numOfRows=12&pageNo=1&dataType=JSON` +
    `&base_date=${baseDate}&base_time=0600&nx=${cfg.nx}&ny=${cfg.ny}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return validateSourceResult({
        source: 'kma-weather',
        status: 'error',
        items: [],
        error: `기상청 HTTP ${response.status}`
      });
    }
    const body = await response.json();
    const items = body?.response?.body?.items?.item || [];
    if (items.length === 0) {
      return validateSourceResult({
        source: 'kma-weather',
        status: 'unavailable',
        items: [],
        error: `예보 항목 없음 (baseDate=${baseDate})`
      });
    }
    // PTY(강수형태) 06시 레코드에서 내일 강수 신호를 도출
    const ptyRec = items.find((item) => item.category === 'PTY') || items[0];
    const pty = decodePty(ptyRec?.fcstValue);
    const triggers = ptyToTrigger(pty);
    const itemsOut = triggers.map((trigger, index) => ({
      raw: `기상: ${trigger}`,
      normalized: trigger,
      rank: index + 1,
      volume: null,
      volumeKind: 'unknown',
      url,
      trigger: true
    }));
    if (itemsOut.length === 0) {
      return validateSourceResult({
        source: 'kma-weather',
        status: 'unavailable',
        items: [],
        error: `예보에 강수 신호 없음 (PTY=${pty ?? '없음'})`
      });
    }
    return validateSourceResult({
      source: 'kma-weather',
      status: 'ok',
      fetchedAt: new Date().toISOString(),
      ttlSeconds,
      items: itemsOut,
    });
  } catch (error) {
    return validateSourceResult({
      source: 'kma-weather',
      status: 'error',
      items: [],
      error: error instanceof Error ? error.message : String(error)
    });
  }
}