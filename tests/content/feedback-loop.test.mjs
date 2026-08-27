import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { fetchSearchConsole } from '../../scripts/content/search-console-client.mjs';
import { validateEvaluation, appendEvaluation, readEvaluations, groupByKeyword } from '../../scripts/content/evaluations.mjs';
import { computeBoundedProposals } from '../../scripts/content/feedback-run.mjs';

test('search-console client preserves unavailable status when credentials missing', async () => {
  const r = await fetchSearchConsole({ query: '이사 비용', env: {} });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.dataSource, 'search-console');
});

test('search-console mock returns ok with sample metrics', async () => {
  const r = await fetchSearchConsole({ query: '이사 비용', env: { SEARCH_CONSOLE_MOCK: '1' } });
  assert.equal(r.status, 'ok');
  assert.equal(r.dataSource, 'mock');
  assert.ok(Number.isFinite(r.impressions));
  assert.ok(Number.isFinite(r.position));
});

test('evaluations ledger append preserves sample and groups by keyword', async () => {
  const tmp = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'evals-')), 'evaluations.jsonl');
  await appendEvaluation({ keywordId: 'move-01', keyword: '포장이사 비용', publishUrl: 'https://acstory.tistory.com/1', dataSource: 'manual', sampleSize: 1, impressions: 100, position: 5 }, tmp);
  await appendEvaluation({ keywordId: 'move-01', keyword: '포장이사 비용', publishUrl: 'https://acstory.tistory.com/1', dataSource: 'manual', sampleSize: 1, impressions: 100, position: 25 }, tmp);
  const rows = await readEvaluations(tmp);
  assert.equal(rows.length, 2);
  const grouped = groupByKeyword(rows);
  assert.equal(grouped.get('move-01').length, 2);
});

test('bounded proposals respect min sample and observation window before ready', () => {
  const grouped = new Map([
    ['move-01', Array.from({ length: 10 }, () => ({ keywordId: 'move-01', keyword: '포장이사 비용', publishUrl: 'https://acstory.tistory.com/1', sampleSize: 1, position: 5, ctr: 0.05 }))],
    ['life-01', [{ keywordId: 'life-01', keyword: '정수기 렌탈', publishUrl: 'https://acstory.tistory.com/2', sampleSize: 1, position: 25 }]],
  ]);
  const publishedMap = new Map([
    ['move-01', { publishedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }],
    ['life-01', { publishedAt: new Date().toISOString() }],
  ]);
  const proposals = computeBoundedProposals(grouped, publishedMap, { now: new Date() });
  const move = proposals.find((p) => p.keywordId === 'move-01');
  const life = proposals.find((p) => p.keywordId === 'life-01');
  assert.equal(move.ready, true);
  assert.ok(move.proposal && move.proposal.gapDelta === 0.10);
  assert.equal(life.ready, false);
  assert.equal(life.proposal, null);
});

test('evaluations validate publishUrl format and reject invalid evaluatedAt', () => {
  assert.throws(() => validateEvaluation({ keywordId: 'x', publishUrl: 'not-a-url' }));
  assert.throws(() => validateEvaluation({ keywordId: 'x', publishUrl: 'https://acstory.tistory.com/1', evaluatedAt: 'not-a-date' }));
});