#!/usr/bin/env node
/**
 * select-keywords.mjs — 키워드 선정 CLI (설계 문서 §5)
 *
 * 1) 실측 데이터(네이버 키워드 도구 / 구글 키워드 플래너 / 서치콘솔)를
 *    CSV로 가져와 keywords.json 메트릭을 갱신한다 (I2: estimate는 배점 0).
 * 2) enabled 키워드 중 selectionScore(=45% 상업의도 + 25% QA + 20% SERP 갭
 *    + 10% 신선도) 순으로 오늘 쓸 키워드를 선정한다.
 * 3) 콘텐츠 믹스(비용 50 / 절차 30 / 문제해결 20) 현황을 리포트한다.
 *
 * 사용법:
 *   node scripts/content/select-keywords.mjs [--date YYYY-MM-DD] [--count N] [--json]
 *   node scripts/content/select-keywords.mjs --refresh
 *   node scripts/content/select-keywords.mjs --import-csv data.csv [--dry-run]
 *   node scripts/content/select-keywords.mjs --import-search-console sc.csv [--dry-run]
 *   node scripts/content/select-keywords.mjs --mix-report [--count N]
 */
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  scoreKeyword,
  computeSelectionScore,
  freshnessFactor,
  normalizeGapScore,
  topicClusterOf,
  topicDiversityFactor,
  applyTopicDiversity
} from './keyword-score.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'content', 'generated');

// ─── CSV 파서 (RFC4180: 따옴표 필드·줄바꿈 지원) ──────────────────────

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function toNum(v) {
  // 한국어 천단위 점(1.200)과 콤마(1,200) 모두 처리
  let s = String(v ?? '').trim().replace(/,/g, '');
  s = s.replace(/(\d)\.(\d{3})(?!\d)/g, '$1$2');
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ─── 메트릭 CSV 가져오기 ──────────────────────────────────────────────

const COL_RE = {
  keyword: /^(keyword|키워드|연관키워드|연관검색어|검색어|쿼리|query)$/i,
  volume: /(월평균검색수|월간검색수|월검색량|검색량|monthly.*search|avg.*monthly.*search|search.*volume|volume)/i,
  cpc: /(예상cpc|평균cpc|월평균cpc|top of page bid|입찰가|^cpc)/i,
  competition: /(경쟁정도|등록광고수|competition)/i,
  pcVolume: /pc.*(월평균검색수|검색수)|(월평균검색수|검색수).*pc/i,
  mobileVolume: /모바일.*(월평균검색수|검색수)|(월평균검색수|검색수).*모바일/i,
  cpcHigh: /top of page bid.*(high|상한)|(high|상한).*top of page bid/i,
  cpcLow: /top of page bid.*(low|하한)|(low|하한).*top of page bid/i,
  source: /^(source|출처)$/i
};

function detectSource(header) {
  if (header.some(h => /top of page bid/i.test(h))) return 'google-keyword-planner';
  if (header.some(h => /모바일월평균검색수|PC월평균검색수|네이버/i.test(h))) return 'naver-keyword-tool';
  return 'external-csv';
}

function parseMetricsRows(csvPath) {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  if (rows.length < 2) throw new Error(`CSV에 데이터가 없다: ${csvPath}`);
  const header = rows[0].map(h => String(h).trim());
  const idx = {};
  for (let c = 0; c < header.length; c++) {
    const h = header[c];
    if (!h) continue;
    if (COL_RE.keyword.test(h)) idx.keyword = c;
    else if (!idx.pcVolume && COL_RE.pcVolume.test(h)) idx.pcVolume = c;
    else if (!idx.mobileVolume && COL_RE.mobileVolume.test(h)) idx.mobileVolume = c;
    else if (!idx.volume && COL_RE.volume.test(h)) idx.volume = c;
    else if (COL_RE.cpcHigh.test(h)) idx.cpcHigh = c;
    else if (COL_RE.cpcLow.test(h)) idx.cpcLow = c;
    else if (!idx.cpc && COL_RE.cpc.test(h)) idx.cpc = c;
    else if (!idx.competition && COL_RE.competition.test(h)) idx.competition = c;
    else if (!idx.source && COL_RE.source.test(h)) idx.source = c;
  }
  if (idx.keyword === undefined) {
    throw new Error(`키워드 열을 찾을 수 없다. 헤더: ${header.join(', ')}`);
  }

  const source = detectSource(header);
  const checkedAt = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const row of rows.slice(1)) {
    const keyword = String(row[idx.keyword] ?? '').trim();
    if (!keyword) continue;
    let monthlySearch = idx.volume !== undefined ? toNum(row[idx.volume]) : 0;
    if (idx.pcVolume !== undefined && idx.mobileVolume !== undefined) {
      monthlySearch = toNum(row[idx.pcVolume]) + toNum(row[idx.mobileVolume]);
    }
    let cpcKrw = idx.cpc !== undefined ? toNum(row[idx.cpc]) : 0;
    if (cpcKrw === 0 && idx.cpcHigh !== undefined && idx.cpcLow !== undefined) {
      cpcKrw = Math.round((toNum(row[idx.cpcHigh]) + toNum(row[idx.cpcLow])) / 2);
    }
    const competition = idx.competition !== undefined ? toNum(row[idx.competition]) : null;
    const src = idx.source !== undefined && row[idx.source] ? String(row[idx.source]).trim() : source;
    out.push({ keyword, monthlySearch, cpcKrw, competition, source: src, checkedAt });
  }
  return out;
}

const SC_COL_RE = {
  keyword: /^(쿼리|검색어|query)$/i,
  clicks: /(클릭수|clicks)/i,
  impressions: /(노출수|노출|impressions)/i,
  ctr: /(ctr|클릭률)/i,
  position: /(평균순위|순위|position)/i
};

function parseSearchConsoleRows(csvPath) {
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  if (rows.length < 2) throw new Error(`서치콘솔 CSV에 데이터가 없다: ${csvPath}`);
  const header = rows[0].map(h => String(h).trim());
  const idx = {};
  for (let c = 0; c < header.length; c++) {
    const h = header[c];
    for (const [k, re] of Object.entries(SC_COL_RE)) {
      if (re.test(h) && idx[k] === undefined) idx[k] = c;
    }
  }
  if (idx.keyword === undefined) {
    throw new Error(`서치콘솔 CSV에서 쿼리 열을 찾을 수 없다. 헤더: ${header.join(', ')}`);
  }
  const checkedAt = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const row of rows.slice(1)) {
    const keyword = String(row[idx.keyword] ?? '').trim();
    if (!keyword) continue;
    out.push({
      keyword,
      clicks: idx.clicks !== undefined ? toNum(row[idx.clicks]) : 0,
      impressions: idx.impressions !== undefined ? toNum(row[idx.impressions]) : 0,
      ctr: idx.ctr !== undefined ? toNum(row[idx.ctr]) : null,
      avgPosition: idx.position !== undefined ? toNum(row[idx.position]) : null,
      checkedAt
    });
  }
  return out;
}

// ─── 키워드 로드 / QA 히스토리 ────────────────────────────────────────

async function loadKeywordsFile() {
  const raw = await fs.readFile(KEYWORDS_PATH, 'utf8');
  return JSON.parse(raw);
}

async function latestQaScores() {
  const posts = await scanGeneratedPosts();
  const scores = {};
  for (const p of posts) {
    const prev = scores[p.id];
    if (!prev || p.generatedAt > prev.at) {
      scores[p.id] = { score: p.qaScore ?? 0, at: p.generatedAt };
    }
  }
  return scores;
}

// 생성된 글 전체 스캔 (자동 큐 G005와 공유)
export async function scanGeneratedPosts() {
  const out = [];
  let dirs = [];
  try { dirs = await fs.readdir(GENERATED_DIR); } catch { return out; }
  for (const d of dirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const dayDir = path.join(GENERATED_DIR, d);
    let files = [];
    try { files = await fs.readdir(dayDir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.meta.json')) continue;
      try {
        const meta = JSON.parse(await fs.readFile(path.join(dayDir, f), 'utf8'));
        out.push({
          id: meta.id || meta.keyword || '',
          keyword: meta.keyword || '',
          category: meta.category || '',
          contentType: meta.contentType || '',
          generatedAt: meta.generatedAt || '',
          qaScore: meta.qa && typeof meta.qa.score === 'number' ? meta.qa.score : null
        });
      } catch { /* ignore malformed */ }
    }
  }
  return out;
}

export async function recentGeneratedPosts(limit = 10) {
  const posts = await scanGeneratedPosts();
  return posts
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, limit);
}

function mixBucket(contentType = '') {
  const t = String(contentType);
  // 설계 §3.3: cost/comparison/calculator → 비용
  if (t === 'cost' || t === 'comparison' || t === 'calculator') return '비용';
  if (t === 'checklist' || t === 'guide' || t === 'procedure') return '절차';
  if (t === 'problem') return '문제해결';
  return '정보·기타';
}

export { mixBucket };
export { latestQaScores };

function selectKeywords(data, qaScores, { count = 5, now = new Date(), recentClusters = [] } = {}) {
  const focus = data.focusCategories;
  const allowLegacy = data.allowLegacySeries;

  const rows = [];
  for (const kw of data.keywords) {
    const r = scoreKeyword(kw, { focusCategories: focus, allowLegacySeries: allowLegacy });
    if (!kw.enabled) {
      rows.push({ kw, r, enabled: false, selectionScore: null });
      continue;
    }
    if (!r.gates.ymyl.allowed || !r.gates.focus.allowed) {
      rows.push({ kw, r, enabled: false, selectionScore: null, gateBlocked: true });
      continue;
    }
    const qa = qaScores[kw.id] || { score: 50 }; // QA 이력 없음 = 중립 (콜드스타트 페널티 방지)
    const gapScore = normalizeGapScore(kw.gap);
    // 키워드 선정 CLI는 글 생성일이 없으므로 metrics.checkedAt 폴백
    const freshness = freshnessFactor(kw.metrics?.checkedAt || kw.researchedAt, now, 14);
    const baseScore = computeSelectionScore({
      commercialIntentScore: r.score.intent,
      qaScore: qa.score,
      serpGapScore: gapScore,
      freshness
    });
    const cluster = topicClusterOf(kw);
    rows.push({
      kw,
      r,
      enabled: true,
      qaScore: qa.score,
      gapTotal: gapScore,
      freshness,
      topicCluster: cluster,
      baseScore,
      selectionScore: baseScore // 배치 다양성 재가중 전 초기값
    });
  }

  const eligible = rows.filter(x => x.enabled);
  // greedy: 고를 때마다 최근+배치 클러스터로 다양성 재가중
  const remaining = [...eligible];
  const selected = [];
  const batchClusters = [...recentClusters];
  while (remaining.length && selected.length < count) {
    for (const row of remaining) {
      const div = topicDiversityFactor(row.topicCluster, batchClusters);
      row.diversity = div;
      row.selectionScore = applyTopicDiversity(row.baseScore, div);
    }
    remaining.sort((a, b) => b.selectionScore - a.selectionScore || b.r.score.total - a.r.score.total);
    const next = remaining.shift();
    selected.push(next);
    batchClusters.push(next.topicCluster);
  }
  // 랭킹 전체(리포트용): 미선정분도 최종 다양성 점수로 정렬
  for (const row of remaining) {
    const div = topicDiversityFactor(row.topicCluster, batchClusters);
    row.diversity = div;
    row.selectionScore = applyTopicDiversity(row.baseScore, div);
  }
  const ranked = [...selected, ...remaining].sort(
    (a, b) => b.selectionScore - a.selectionScore || b.r.score.total - a.r.score.total
  );

  return { ranked, selected };
}

function mixReport(selected) {
  const buckets = {};
  for (const s of selected) {
    const b = mixBucket(s.kw.contentType);
    buckets[b] = (buckets[b] || 0) + 1;
  }
  const total = selected.length || 1;
  const targets = { '비용': 50, '절차': 30, '문제해결': 20 };
  const lines = [];
  for (const [b, target] of Object.entries(targets)) {
    const n = buckets[b] || 0;
    const pct = Math.round((n / total) * 100);
    lines.push(`  ${b}: ${n}건 (${pct}%, 목표 ${target}%) ${pct < target - 10 ? '⚠ 부족' : pct > target + 10 ? '⚠ 과다' : '✓'}`);
  }
  const etc = (buckets['정보·기타'] || 0) + (buckets[undefined] || 0);
  if (etc) lines.push(`  정보·기타(레거시 시리즈): ${etc}건`);
  return lines.join('\n');
}

function printSelection({ date, selected, ranked }) {
  console.log(`날짜: ${date} | 후보 ${ranked.length}건 → 선정 ${selected.length}건\n`);
  if (selected.length === 0) {
    console.log('선정된 키워드가 없다. --import-csv로 실측 데이터를 먼저 넣어라 (estimate 메트릭은 배점 0).');
    return;
  }
  selected.forEach((s, i) => {
    const g = s.r.gates;
    const w = `${s.kw.keyword}`;
    console.log(`${i + 1}. ${w} [${s.kw.category}/${s.topicCluster || topicClusterOf(s.kw)}]`);
    console.log(`   선택점수 ${s.selectionScore} = base ${s.baseScore ?? s.selectionScore} · 의도 ${s.r.score.intent}/25(45%) · QA ${s.qaScore}/100(25%) · 갭 ${s.gapTotal}/26(20%) · 신선도 ${Math.round(s.freshness * 100)}%(10%) · 다양성 ${Math.round((s.diversity ?? 1) * 100)}%`);
    console.log(`   루브릭 총점 ${s.r.score.total}/100 (입찰가 ${s.r.score.bid}/20 · 검색량 ${s.r.score.volume}/15) · 유형 ${mixBucket(s.kw.contentType)}`);
    if (!g.ymyl.allowed) console.log(`   ⛔ YMYL 거부: ${g.ymyl.reason}`);
    if (!g.focus.allowed) console.log(`   ⛔ 주제 거부: ${g.focus.reason}`);
  });
  console.log('\n콘텐츠 믹스 (선정분 기준, 최근 10건 지표는 auto-queue가 검증):');
  console.log(mixReport(selected));
}

// ─── CLI ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    date: '', count: 5, json: false, refresh: false, dryRun: false,
    importCsv: '', importSc: '', mixOnly: false, help: false
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i + 1]) args.date = argv[++i];
    else if (argv[i] === '--count' && argv[i + 1]) args.count = Number(argv[++i]) || 5;
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--refresh') args.refresh = true;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--import-csv' && argv[i + 1]) args.importCsv = argv[++i];
    else if (argv[i] === '--import-search-console' && argv[i + 1]) args.importSc = argv[++i];
    else if (argv[i] === '--mix-report') args.mixOnly = true;
    else if (argv[i] === '--help') args.help = true;
  }
  if (!args.date) {
    const now = new Date();
    args.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`사용법:
  node select-keywords.mjs [--date YYYY-MM-DD] [--count N] [--json]
  node select-keywords.mjs --refresh                          # 점수 전체 재산출
  node select-keywords.mjs --import-csv data.csv [--dry-run]  # 실측 메트릭 반영
  node select-keywords.mjs --import-search-console sc.csv [--dry-run]
  node select-keywords.mjs --mix-report [--count N]`);
    return;
  }

  const data = await loadKeywordsFile();
  const kwIndex = new Map(data.keywords.map(k => [k.keyword, k]));

  if (args.importCsv) {
    const rows = parseMetricsRows(args.importCsv);
    let matched = 0;
    for (const row of rows) {
      const kw = kwIndex.get(row.keyword);
      if (!kw) continue;
      kw.metrics = {
        monthlySearch: row.monthlySearch,
        cpcKrw: row.cpcKrw,
        source: row.source,
        checkedAt: row.checkedAt
      };
      matched++;
    }
    console.log(`[import-csv] ${rows.length}행 중 ${matched}건 매칭 (출처: ${rows[0]?.source || '-'})`);
    if (!matched) {
      console.log('매칭 없음 — CSV의 키워드 열이 keywords.json의 keyword 필드와 일치해야 한다.');
      return;
    }
    if (!args.dryRun) {
      for (const kw of data.keywords) {
        const r = scoreKeyword(kw, {
          focusCategories: data.focusCategories,
          allowLegacySeries: data.allowLegacySeries
        });
        kw.score = r.score;
        kw.commercialIntent = r.intent.score;
        // 수동 enabled=false 보존 — 울타리 통과만으로 재활성화하지 않는다.
        // 60점 임계는 실측 데이터 축적 후 등재 기준으로 사용 (현재 갭 0이면 전부 미달).
        if (kw.enabled !== false) {
          kw.enabled = r.gates.focus.allowed && r.gates.ymyl.allowed;
        }
      }
      data.updatedAt = new Date().toISOString().slice(0, 10);
      await fs.writeFile(KEYWORDS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
      console.log('keywords.json 갱신 완료');
    } else {
      console.log('[dry-run] 저장 없음');
    }
  }

  if (args.importSc) {
    const rows = parseSearchConsoleRows(args.importSc);
    let matched = 0;
    for (const row of rows) {
      const kw = kwIndex.get(row.keyword);
      if (!kw) continue;
      kw.searchConsole = {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        avgPosition: row.avgPosition,
        checkedAt: row.checkedAt
      };
      matched++;
    }
    console.log(`[import-search-console] ${rows.length}행 중 ${matched}건 매칭`);
    if (!args.dryRun) {
      data.updatedAt = new Date().toISOString().slice(0, 10);
      await fs.writeFile(KEYWORDS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
      console.log('keywords.json 갱신 완료');
    } else {
      console.log('[dry-run] 저장 없음');
    }
  }

  if (args.refresh) {
    // market-memory의 serpGap을 keywords.json gap.total로 동기화
    let memory = { keywords: {} };
    try {
      const memRaw = await fs.readFile(path.join(PROJECT_ROOT, 'content', 'learning', 'market-memory.json'), 'utf8');
      memory = JSON.parse(memRaw);
    } catch { /* 메모리 없으면 스킵 */ }
    for (const kw of data.keywords) {
      const mem = memory.keywords?.[kw.keyword];
      if (mem && Number.isFinite(Number(mem.serpGap))) {
        kw.gap = {
          ...(kw.gap || {}),
          total: Number(mem.serpGap),
          rawTotal: Number(mem.serpGap)
        };
      }
      const r = scoreKeyword(kw, {
        focusCategories: data.focusCategories,
        allowLegacySeries: data.allowLegacySeries
      });
      kw.score = r.score;
      kw.commercialIntent = r.intent.score;
      // 수동 enabled=false 보존
      if (kw.enabled !== false) {
        kw.enabled = r.gates.focus.allowed && r.gates.ymyl.allowed;
      }
    }
    data.updatedAt = new Date().toISOString().slice(0, 10);
    await fs.writeFile(KEYWORDS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log('[refresh] 전 키워드 점수 재산출 완료 (갭 동기화 포함)');
  }

  const qaScores = await latestQaScores();
  const recent = await recentGeneratedPosts(10);
  const kwById = new Map((data.keywords || []).map(k => [k.id, k]));
  const recentClusters = recent.map(p => topicClusterOf(kwById.get(p.id) || p));
  const { ranked, selected } = selectKeywords(data, qaScores, { count: args.count, recentClusters });

  if (args.json) {
    console.log(JSON.stringify({
      date: args.date,
      selected: selected.map(s => ({
        id: s.kw.id,
        keyword: s.kw.keyword,
        category: s.kw.category,
        contentType: s.kw.contentType,
        topicCluster: s.topicCluster || topicClusterOf(s.kw),
        selectionScore: s.selectionScore,
        baseScore: s.baseScore ?? s.selectionScore,
        diversity: s.diversity ?? 1,
        scoreTotal: s.r.score.total,
        commercialIntent: s.r.score.intent,
        qaScore: s.qaScore,
        serpGap: s.gapTotal,
        freshness: Math.round(s.freshness * 100)
      }))
    }, null, 2));
    return;
  }

  if (args.mixOnly) {
    console.log(`콘텐츠 믹스 (선정 ${selected.length}건, 목표 50/30/20):`);
    console.log(mixReport(selected));
    return;
  }

  printSelection({ date: args.date, selected, ranked });
}

const isCli = process.argv[1] && process.argv[1].endsWith('select-keywords.mjs');
if (isCli) {
  main().catch(error => {
    console.error(`[select-keywords] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
