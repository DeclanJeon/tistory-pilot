#!/usr/bin/env node
/**
 * evaluations.mjs — 발행 후 Search Console 평가 ledger (Phase 3)
 *
 * 파일: content/learning/evaluations.jsonl  (append-only JSONL)
 * 각 줄: { evaluatedAt, keywordId, keyword, publishUrl, dataSource, sampleSize, impressions, clicks, ctr, position, site }
 *
 * 원칙:
 *  - 최소 표본 10개·관찰 4주 전에는 자동 가중치 변경을 하지 않는다 (shadow 만).
 *  - 성공/실패 조정폭은 축별 ±10% bounded.
 *  - 실제 수익(AdSense)은 별도 데이터 없으면 추론하지 않는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const EVALUATIONS_PATH = process.env.EVALUATIONS_PATH
  || path.join(PROJECT_ROOT, 'content', 'learning', 'evaluations.jsonl');

export function validateEvaluation(input = {}) {
  const evaluatedAt = input.evaluatedAt ? String(input.evaluatedAt) : new Date().toISOString();
  if (Number.isNaN(Date.parse(evaluatedAt))) throw new Error('evaluatedAt must be an ISO date.');
  const keywordId = String(input.keywordId || '').trim();
  const keyword = String(input.keyword || '').trim();
  if (!keywordId && !keyword) throw new Error('keywordId or keyword is required.');
  const publishUrl = String(input.publishUrl || input.url || '').trim();
  if (publishUrl && !/^https?:\/\//i.test(publishUrl)) throw new Error('publishUrl must be http(s).');
  const dataSource = String(input.dataSource || 'manual').trim() || 'manual';
  const sampleSize = Number.isFinite(Number(input.sampleSize)) ? Number(input.sampleSize) : 1;
  return {
    evaluatedAt,
    keywordId,
    keyword,
    publishUrl,
    dataSource,
    sampleSize,
    impressions: Number.isFinite(Number(input.impressions)) ? Number(input.impressions) : null,
    clicks: Number.isFinite(Number(input.clicks)) ? Number(input.clicks) : null,
    ctr: Number.isFinite(Number(input.ctr)) ? Number(input.ctr) : null,
    position: Number.isFinite(Number(input.position)) ? Number(input.position) : null,
    site: input.site ? String(input.site) : null
  };
}

export async function appendEvaluation(entry, filePath = EVALUATIONS_PATH) {
  const validated = validateEvaluation(entry);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(validated) + '\n', 'utf8');
  return validated;
}

export async function readEvaluations(filePath = EVALUATIONS_PATH) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .map(validateEvaluation);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export function groupByKeyword(evaluations) {
  const byId = new Map();
  for (const ev of evaluations) {
    const key = ev.keywordId || ev.keyword;
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key).push(ev);
  }
  return byId;
}