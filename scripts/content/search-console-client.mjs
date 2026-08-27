#!/usr/bin/env node
/**
 * search-console-client.mjs — Search Console Search Analytics 키 게이트 (Phase 3)
 *
 * 실제 CTR/노출/클릭은 Search Console API에서만 온다.
 * SERP 검색 결과 파싱으로 CTR을 추정하지 않는다.
 *
 * 키 게이트: GOOGLE_SEARCH_CONSOLE_CREDENTIALS(JSON) 또는
 * GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN 이 없으면 unavailable 로 반환 (0 치환 금지).
 *
 * 성공 시: { impressions, clicks, ctr, position } (position = 평균 게재 순위)
 * 실패: unavailable/rate_limited/error
 */
function readConfig(env = process.env) {
  return {
    credentialsJson: env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS || '',
    accessToken: env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN || '',
    siteUrl: env.SEARCH_CONSOLE_SITE_URL || 'https://acstory.tistory.com/',
    mock: env.SEARCH_CONSOLE_MOCK === '1'
  };
}

export async function fetchSearchConsole({ siteUrl, query, page, startDate, endDate, env = process.env } = {}) {
  const cfg = readConfig(env);
  // Mock 모드: 테스트에서 키 없이도 동작 검증 가능
  if (cfg.mock) {
    return {
      status: 'ok',
      dataSource: 'mock',
      siteUrl: siteUrl || cfg.siteUrl,
      query: query || '',
      page: page || '',
      startDate,
      endDate,
      impressions: 120,
      clicks: 6,
      ctr: 0.05,
      position: 8.2,
      sampleSize: 1
    };
  }
  if (!cfg.credentialsJson && !cfg.accessToken) {
    return {
      status: 'unavailable',
      dataSource: 'search-console',
      error: 'GOOGLE_SEARCH_CONSOLE_CREDENTIALS/ACCESS_TOKEN 미등록'
    };
  }
  // 실제 API 호출은 OAuth2 + googleapis 필요 — Phase 3 shadow 에서는 키 없으면 unavailable 로 두고
  // 키가 있으면 아래 분기로 진입하지만, 네트워크가 없거나 권한이 없으면 error 로 반환한다.
  // 여기서는 키가 있다는 사실만으로 ok 로 가정하지 않고, 실제 fetch 를 시도한다.
  const site = siteUrl || cfg.siteUrl;
  const body = {
    startDate: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    endDate: endDate || new Date().toISOString().slice(0, 10),
    dimensions: ['query', 'page'],
    rowLimit: 10
  };
  if (query) body.dimensionFilterGroups = [{ filters: [{ dimension: 'query', expression: query }] }];
  if (page) {
    body.dimensionFilterGroups = body.dimensionFilterGroups || [];
    body.dimensionFilterGroups.push({ filters: [{ dimension: 'page', expression: page }] });
  }
  try {
    // googleapis 가 없으면 unavailable 로 처리 — Phase 3 shadow 에서는 라이브 호출을 강제하지 않는다.
    const token = cfg.accessToken || '';
    if (!token) {
      return {
        status: 'unavailable',
        dataSource: 'search-console',
        error: 'GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN 으로의 JWT 교환이 아직 구현되지 않았다 (Phase 3 shadow: unavailable 보존)'
      };
    }
    const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    if (res.status === 401 || res.status === 403) {
      return { status: 'unavailable', dataSource: 'search-console', error: `Search Console 인증 실패 HTTP ${res.status}` };
    }
    if (res.status === 429) {
      return { status: 'rate_limited', dataSource: 'search-console', error: 'Search Console rate limit' };
    }
    if (!res.ok) {
      return { status: 'error', dataSource: 'search-console', error: `Search Console HTTP ${res.status}` };
    }
    const data = await res.json();
    const row = (data.rows || [])[0];
    if (!row) {
      return { status: 'ok', dataSource: 'search-console', siteUrl: site, query, page, impressions: 0, clicks: 0, ctr: 0, position: null, sampleSize: 0 };
    }
    return {
      status: 'ok',
      dataSource: 'search-console',
      siteUrl: site,
      query,
      page,
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      ctr: row.ctr || 0,
      position: row.position || null,
      sampleSize: 1
    };
  } catch (error) {
    return { status: 'error', dataSource: 'search-console', error: error instanceof Error ? error.message : String(error) };
  }
}