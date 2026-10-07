#!/usr/bin/env node
/**
 * side 키워드 20개에 live SERP 리서치 기반 CPC 티어를 측정해 keywords.json 메트릭으로 주입.
 * source='serp-research' → scoreKeyword가 실측 취급 (bid 점수 부여).
 * 실행: node /tmp/inject-side-metrics.mjs (서버, app 루트)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { researchKeywordMarket } from './scripts/content/market-research.mjs';
import { loadProjectEnv } from './scripts/lib/load-env.mjs';

loadProjectEnv({ localEnvPath: '.env.local', fallbackEnvPaths: ['.env'] });

const TIER_CPC = { S: 4000, A: 2250, B: 1150, C: 550, D: 200 };
const KEYWORDS_PATH = path.resolve('content/keywords/keywords.json');
const checkedAt = new Date().toISOString().slice(0, 10);

const data = JSON.parse(await fs.readFile(KEYWORDS_PATH, 'utf8'));
const results = [];
for (const k of data.keywords) {
  if (!k.id.startsWith('side')) continue;
  try {
    const m = await researchKeywordMarket(k.keyword, { category: k.category || '' });
    const tier = String(m.cpcTier || 'D').toUpperCase();
    const cpcKrw = TIER_CPC[tier] || 200;
    k.metrics = { monthlySearch: 0, cpcKrw, source: 'serp-research', checkedAt };
    k.cpcTier = tier;
    results.push(`${k.id} ${k.keyword} → 티어 ${tier} / ${cpcKrw}원`);
  } catch (e) {
    results.push(`${k.id} ${k.keyword} → FAIL ${String(e.message || e).slice(0, 70)}`);
  }
  await new Promise(r => setTimeout(r, 700));
}
data.updatedAt = new Date().toISOString();
await fs.writeFile(KEYWORDS_PATH, JSON.stringify(data, null, 2), 'utf8');
console.log(results.join('\n'));
console.log('\n주입 완료 →', KEYWORDS_PATH);
