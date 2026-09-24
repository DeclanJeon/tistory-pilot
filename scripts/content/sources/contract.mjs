#!/usr/bin/env node
/**
 * sources/contract.mjs — 다중 소스 adapter의 표준 결과 계약 (설계 §3.1)
 *
 * 모든 source adapter는 이 모양의 결과를 반환해야 한다.
 * 실패를 '0건'으로 치환하지 말고 status로 표현한다 (unavailable/rate_limited).
 *
 * producer: google-trends | naver-datalab | naver-search-ads | kma-weather | shopping(예약)
 */

export const SOURCE_IDS = Object.freeze(['google-trends', 'naver-datalab', 'naver-search-ads', 'kma-weather', 'shopping']);

export const ADAPTER_STATUS = Object.freeze(['ok', 'partial', 'unavailable', 'rate_limited', 'error']);

export const VOLUME_KIND = Object.freeze(['relative', 'range', 'absolute', 'unknown']);

export function isSourceId(value) {
  return SOURCE_IDS.includes(value);
}

export function isAdapterStatus(value) {
  return ADAPTER_STATUS.includes(value);
}

export function validateSourceItem(item = {}) {
  const raw = String(item.raw || '').trim();
  if (!raw) throw new Error('source item requires a non-empty raw label.');
  const normalized = String(item.normalized || item.raw || '').trim();
  const volumeRaw = item.volume;
  const num = volumeRaw == null || volumeRaw === '' ? NaN : Number(volumeRaw);
  const volume = Number.isFinite(num) ? num : null;
  const volumeKind = item.volumeKind || (Number.isFinite(num) ? 'absolute' : 'unknown');
  if (!VOLUME_KIND.includes(volumeKind)) {
    throw new Error(`volumeKind must be one of: ${VOLUME_KIND.join(', ')}`);
  }
  const sourceMetrics = item.metrics && typeof item.metrics === 'object' && !Array.isArray(item.metrics)
    ? {
      monthlySearch: Number.isFinite(Number(item.metrics.monthlySearch)) ? Number(item.metrics.monthlySearch) : null,
      cpcKrw: Number.isFinite(Number(item.metrics.cpcKrw)) ? Number(item.metrics.cpcKrw) : null,
      competition: item.metrics.competition == null ? null : String(item.metrics.competition),
      provider: item.metrics.provider ? String(item.metrics.provider) : null,
      checkedAt: item.metrics.checkedAt ? String(item.metrics.checkedAt) : null,
      volumeKind: VOLUME_KIND.includes(item.metrics.volumeKind) ? item.metrics.volumeKind : volumeKind
    }
    : null;
  return {
    raw,
    normalized,
    rank: Number.isInteger(item.rank) ? item.rank : null,
    volume,
    volumeKind,
    url: item.url ? String(item.url) : null,
    trigger: item.trigger === true,
    ...(sourceMetrics ? { metrics: sourceMetrics } : {})
  };
}

export function validateSourceResult(input = {}) {
  if (!isSourceId(input.source)) {
    throw new Error(`source must be one of: ${SOURCE_IDS.join(', ')} (got ${JSON.stringify(input.source)})`);
  }
  if (!isAdapterStatus(input.status)) {
    throw new Error(`status must be one of: ${ADAPTER_STATUS.join(', ')} (got ${JSON.stringify(input.status)})`);
  }
  const fetchedAt = input.fetchedAt || new Date().toISOString();
  const fetchedAtMs = Date.parse(fetchedAt);
  if (Number.isNaN(fetchedAtMs)) throw new Error('fetchedAt must be an ISO date.');
  const ttlSeconds = input.ttlSeconds != null ? Number(input.ttlSeconds) : 24 * 60 * 60;
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) throw new Error('ttlSeconds must be a positive number.');
  const expiresAt = input.expiresAt != null ? input.expiresAt : new Date(fetchedAtMs + ttlSeconds * 1000).toISOString();
  const items = Array.isArray(input.items) ? input.items : [];

  return {
    source: input.source,
    fetchedAt,
    expiresAt,
    ttlSeconds,
    status: input.status,
    items: items.map(validateSourceItem),
    error: input.error != null ? String(input.error) : null
  };
}