#!/usr/bin/env node
/**
 * sources/naver-datalab.mjs — Naver DataLab 검색어 트렌드 adapter (설계 §3.1)
 *
 * Naver DataLab(데이터랩)은 검색 추세 신호(기준일=100 지수)다.
 * CPC/광고 단가를 제공하지 않으므로 volume을 'relative'로만 표기하고
 * 광고 가치 추정에 쓰지 않는다.
 *
 * 키 게이트: NAVER_DATALAB_CLIENT_ID / NAVER_DATALAB_CLIENT_SECRET 이
 * 등록되지 않으면 unavailable로 반환한다 (0건으로 치환하지 않음).
 *
 * 참고: 오픈API는 그룹 비율 조회(일/주/월 단위, 최대 30일)이며
 * '급상승 검색어' 실시간 탑인은 별도 상품(검색광고 API)이다.
 */
import { validateSourceResult } from './contract.mjs';
import { normalizeTitle } from '../../lib/published-posts.mjs';

const DATALAB_API = 'https://openapi.naver.com/v1/datalab/search';

function readConfig(env = process.env) {
  return {
    clientId: env.NAVER_DATALAB_CLIENT_ID || '',
    clientSecret: env.NAVER_DATALAB_CLIENT_SECRET || '',
    keywords: (env.NAVER_DATALAB_KEYWORDS || '이사 비용,청소 비용,렌탈 비용,에어컨 청소,보일러 교체')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5)
  };
}

/**
 * 등록된 seed 키워드 상위 5개에 대한 7일 상대 검색 추세를 조회한다.
 * 실패/미등록은 unavailable로 반환한다.
 */
export async function fetchNaverDataLab({ env = process.env, ttlSeconds = 12 * 60 * 60 } = {}) {
  const cfg = readConfig(env);
  if (!cfg.clientId || !cfg.clientSecret) {
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'unavailable',
      items: [],
      error: 'NAVER_DATALAB_CLIENT_ID/SECRET 미등록 — 데이터랩 검색 추세 조회 불가'
    });
  }
  if (cfg.keywords.length === 0) {
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'unavailable',
      items: [],
      error: 'NAVER_DATALAB_KEYWORDS 가 비어 있다'
    });
  }
  const startDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);
  try {
    const response = await fetch(DATALAB_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Naver-Client-Id': cfg.clientId,
        'X-Naver-Client-Secret': cfg.clientSecret
      },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: 'date',
        keywordGroups: cfg.keywords.map((keyword) => ({ keyword, groupName: keyword }))
      })
    });
    if (response.status === 401 || response.status === 403) {
      return validateSourceResult({
        source: 'naver-datalab',
        status: 'unavailable',
        items: [],
        error: `Naver 인증 실패 (HTTP ${response.status})`
      });
    }
    if (response.status === 429) {
      return validateSourceResult({
        source: 'naver-datalab',
        status: 'rate_limited',
        items: [],
        error: 'Naver API rate limit'
      });
    }
    if (!response.ok) {
      return validateSourceResult({
        source: 'naver-datalab',
        status: 'error',
        items: [],
        error: `Naver API HTTP ${response.status}`
      });
    }
    const body = await response.json();
    const items = (body.results || []).map((result, index) => {
      const series = Array.isArray(result.data) ? result.data.filter(Boolean) : [];
      const last = series[series.length - 1];
      const volume = last ? Number(last.ratio ?? null) : null;
      return {
        raw: result.title || cfg.keywords[index] || '',
        normalized: normalizeTitle(result.title || cfg.keywords[index] || ''),
        rank: index + 1,
        volume: Number.isFinite(volume) ? volume : null,
        volumeKind: 'relative',
        url: 'https://datalab.naver.com/keyword/section.naver'
      };
    });
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'ok',
      fetchedAt: new Date().toISOString(),
      ttlSeconds,
      items
    });
  } catch (error) {
    return validateSourceResult({
      source: 'naver-datalab',
      status: 'error',
      items: [],
      error: error instanceof Error ? error.message : String(error)
    });
  }
}