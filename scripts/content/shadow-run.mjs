#!/usr/bin/env node
/**
 * shadow-run.mjs — Phase 1 Shadow 통합 실행 (다중 소스 + 실측 메트릭 비교)
 *
 * 1) aggregator.runShadow() → content/learning/shadow-sources-<date>.json
 * 2) metrics-injector.buildShadowReport() → 현재 vs real 측정 반영 선정 비교
 * 3) content/learning/shadow-report-<date>.json 에 종합 저장
 *
 * Shadow 모드: 발행 경로에 반영하지 않는다. 소스 실패는 0으로 치환되지 않고
 * status / unavailable 로 보존된다.
 *
 * 사용법: node scripts/content/shadow-run.mjs [--date YYYY-MM-DD] [--skip-google]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { runShadow, todayDate } from './sources/aggregator.mjs';
import { readCache, buildShadowReport } from './metrics-injector.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const REPORT_DIR = path.join(PROJECT_ROOT, 'content', 'learning');

function parseArgs(argv) {
  const args = { date: '', skipGoogle: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i + 1]) args.date = argv[i + 1], i++;
    else if (argv[i] === '--skip-google') args.skipGoogle = true;
    else if (argv[i] === '--help') {
      console.log(`사용법: node shadow-run.mjs [--date YYYY-MM-DD] [--skip-google]`);
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const date = args.date || todayDate();
  await fs.mkdir(REPORT_DIR, { recursive: true });

  // 1) 다중 소스 Shadow 수집 (Google 실패해도 전체가 죽지 않음)
  const { snapshot, outPath } = await runShadow({ date });
  console.log(`[shadow-sources] ${outPath}`);
  for (const key of Object.keys(snapshot.sourceStatus)) {
    console.log(`  - ${key}: ${snapshot.sourceStatus[key]}`);
  }

  // 2) 실측 메트릭 Shadow 비교
  const cache = await readCache();
  const keywordsRaw = await fs.readFile(path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json'), 'utf8');
  const data = JSON.parse(keywordsRaw);
  const metricsReport = buildShadowReport(data.keywords || [], cache);
  console.log(`[metrics] candidate ${metricsReport.candidateCount} | measured ${metricsReport.measuredCount} | stale ${metricsReport.staleCount} | unavailable ${metricsReport.unavailableCount}`);

  // 3) 종합 리포트
  const composite = {
    date,
    generatedAt: new Date().toISOString(),
    sources: snapshot,
    metrics: {
      candidateCount: metricsReport.candidateCount,
      measuredCount: metricsReport.measuredCount,
      staleCount: metricsReport.staleCount,
      unavailableCount: metricsReport.unavailableCount,
      topBySelectionScore: metricsReport.rows.slice(0, 10).map((r) => ({
        id: r.id,
        keyword: r.keyword,
        selectionScore: r.selectionScore,
        measuredProjection: r.measuredProjection,
        delta: r.delta,
        measurementImpact: r.measurementImpact,
        view: r.metricView.kind
      })),
      rankedIds: metricsReport.rows.map((r) => r.id)
    }
  };
  const reportPath = path.join(REPORT_DIR, `shadow-report-${date}.json`);
  await fs.writeFile(reportPath, JSON.stringify(composite, null, 2), 'utf8');
  console.log(`[shadow-report] ${reportPath}`);
  console.log(`  실측 반영 영향 상위 3 (measurementImpact 최대):`);
  const byImpact = [...metricsReport.rows].sort((a, b) => b.measurementImpact - a.measurementImpact).slice(0, 3);
  for (const r of byImpact) {
    console.log(`   - ${r.keyword} impact=+${r.measurementImpact} view=${r.metricView.kind}`);
  }
  return reportPath;
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('shadow-run.mjs')) {
  main().catch((error) => {
    console.error(`[shadow-run] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}