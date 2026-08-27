#!/usr/bin/env node
/**
 * feedback-run.mjs — Phase 3 Shadow bounded update 리포트
 *
 * 최소 표본 10개·관찰 4주 전에는 자동 가중치 변경을 하지 않는다.
 * 성공/실패 조정폭은 축별 ±10% 이내, 제안은 proposed-config 로만 저장한다.
 *
 * 입력: content/learning/evaluations.jsonl + published.json(발행일)
 * 출력: content/learning/feedback-report-<date>.json + proposed-config-<date>.json (shadow)
 *
 * 실제 수익(AdSense)은 추론하지 않는다 — CTR/순위와 수익을 혼동하지 않는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { readEvaluations, groupByKeyword } from './evaluations.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REPORT_DIR = path.join(PROJECT_ROOT, 'content', 'learning');
const MIN_SAMPLE = 10;
const MIN_OBSERVATION_DAYS = 28;
const MAX_DELTA = 0.10; // 축별 ±10%

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadPublishedMap() {
  try {
    const raw = await fs.readFile(path.join(PROJECT_ROOT, 'content', 'published.json'), 'utf8');
    const data = JSON.parse(raw);
    const byId = new Map();
    for (const p of data.posts || []) {
      if (p.id) byId.set(p.id, p);
      if (p.keyword) byId.set(p.keyword, p);
    }
    return byId;
  } catch {
    return new Map();
  }
}

export function computeBoundedProposals(grouped, publishedMap, { now = new Date() } = {}) {
  const proposals = [];
  for (const [key, rows] of grouped) {
    const totalSamples = rows.reduce((a, b) => a + (b.sampleSize || 0), 0);
    const avgPosition = rows.filter(r => Number.isFinite(r.position)).reduce((a, b) => a + b.position, 0) / Math.max(1, rows.filter(r => Number.isFinite(r.position)).length) || null;
    const avgCtr = rows.filter(r => Number.isFinite(r.ctr)).reduce((a, b) => a + b.ctr, 0) / Math.max(1, rows.filter(r => Number.isFinite(r.ctr)).length) || null;
    const totalImpressions = rows.reduce((a, b) => a + (b.impressions || 0), 0);
    const published = publishedMap.get(key);
    const publishedAt = published?.publishedAt ? Date.parse(published.publishedAt) : null;
    const observationDays = publishedAt ? (now.getTime() - publishedAt) / (24 * 60 * 60 * 1000) : null;

    const ready = totalSamples >= MIN_SAMPLE && (observationDays === null || observationDays >= MIN_OBSERVATION_DAYS);
    let proposal = null;
    let reason = '';
    if (!ready) {
      if (totalSamples < MIN_SAMPLE) reason = `표본 부족 (${totalSamples}/${MIN_SAMPLE})`;
      else reason = `관찰 기간 부족 (${observationDays !== null ? Math.floor(observationDays) : '?'}일 < ${MIN_OBSERVATION_DAYS}일)`;
    } else if (avgPosition !== null && avgPosition <= 10) {
      proposal = { gapDelta: 0.10, note: `Top10 평균 순위 ${avgPosition.toFixed(1)} — gap 가중 +10% 제안(상한)` };
      reason = 'Top10 진입 — shadow 제안만';
    } else if (avgPosition !== null && avgPosition > 20) {
      proposal = { gapDelta: -0.10, note: `평균 순위 ${avgPosition.toFixed(1)} — gap 가중 -10% 제안(하한)` };
      reason = '평균 순위 20위 밖 — shadow 제안만';
    } else {
      reason = '표본 충분하나 순위 중립 — 제안 없음';
    }

    // bounded clamp
    if (proposal) {
      proposal.gapDelta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, proposal.gapDelta));
    }

    proposals.push({
      key,
      keywordId: rows[0]?.keywordId || key,
      keyword: rows[0]?.keyword || key,
      sampleSize: totalSamples,
      avgPosition,
      avgCtr,
      totalImpressions,
      observationDays: observationDays !== null ? Math.round(observationDays) : null,
      ready,
      proposal,
      reason
    });
  }
  return proposals;
}

export async function runFeedback({ date = todayDate(), outDir = REPORT_DIR } = {}) {
  const evaluations = await readEvaluations();
  const grouped = groupByKeyword(evaluations);
  const publishedMap = await loadPublishedMap();
  const proposals = computeBoundedProposals(grouped, publishedMap);

  const readyCount = proposals.filter(p => p.ready && p.proposal).length;
  const notReadyCount = proposals.filter(p => !p.ready).length;

  const report = {
    date,
    generatedAt: new Date().toISOString(),
    evaluationsCount: evaluations.length,
    keywordCount: grouped.size,
    readyCount,
    notReadyCount,
    minSample: MIN_SAMPLE,
    minObservationDays: MIN_OBSERVATION_DAYS,
    maxDelta: MAX_DELTA,
    note: 'Shadow 리포트 — proposed-config 는 keywords.json 에 자동 반영되지 않는다. 승인 후 수동 적용.',
    proposals
  };

  await fs.mkdir(outDir, { recursive: true });
  const reportPath = path.join(outDir, `feedback-report-${date}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  // proposed-config shadow (bounded, 승인 전용)
  const proposedConfig = {
    date,
    generatedAt: report.generatedAt,
    source: 'feedback-run shadow',
    proposals: proposals.filter(p => p.proposal).map(p => ({ key: p.key, proposal: p.proposal })),
    note: '자동 반영 금지 — 승인 후 keywords.json/scoring config 에 수동 반영'
  };
  const proposedPath = path.join(outDir, `proposed-config-${date}.json`);
  await fs.writeFile(proposedPath, JSON.stringify(proposedConfig, null, 2), 'utf8');

  return { report, reportPath, proposedPath };
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('feedback-run.mjs')) {
  runFeedback().then(({ report, reportPath, proposedPath }) => {
    console.log(`[feedback] 리포트: ${reportPath}`);
    console.log(`  평가 ${report.evaluationsCount}건 / 키워드 ${report.keywordCount}개 / ready ${report.readyCount} / not-ready ${report.notReadyCount}`);
    console.log(`[feedback] proposed-config: ${proposedPath} (자동 반영 안 함)`);
    for (const p of report.proposals.slice(0, 5)) {
      console.log(`  - ${p.keywordId} samples=${p.sampleSize} pos=${p.avgPosition !== null ? p.avgPosition.toFixed(1) : '-'} ready=${p.ready} ${p.proposal ? JSON.stringify(p.proposal) : p.reason}`);
    }
  }).catch((error) => {
    console.error(`[feedback] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}