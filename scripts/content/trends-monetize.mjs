#!/usr/bin/env node
/**
 * trends-monetize.mjs — Google 트렌드 → 수익형 키워드 발굴 및 keywords.json 등록
 *
 * 흐름:
 *   1) trends-fetch.mjs 가 저장한 content/trends/<date>.json 읽기
 *   2) 트렌드 제목에서 상업 키워드 후보 도출 (비용/가격/비교/렌탈/신청 방법 등 접미사 규칙)
 *   3) 기존 루브릭(scoreCommercialIntent + YMYL + 주제 집중)으로 스코어링
 *   4) 기존 키워드/발행 원장/RSS 중복 차단
 *   5) 돈 점수(moneyScore) 상위 N개를 keywords.json에 trend-<date>-<n> 으로 등록
 *
 * 사용법:
 *   node scripts/content/trends-monetize.mjs [--date 2026-08-12] [--cap 5] [--dry-run]
 *
 * --cap : 오늘 등록할 트렌드 키워드 수 상한 (기본 5)
 * --dry-run : 등록 없이 후보만 출력
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  STRONG_COMMERCIAL_WORDS,
  SERVICE_NOUNS,
  scoreKeyword,
  detectYmylRisk,
  DEFAULT_FOCUS_CATEGORIES
} from './keyword-score.mjs';
import { buildDuplicateGate, isAlreadyPublished, normalizeTitle } from '../lib/published-posts.mjs';
import { getSeasonalBridgeCandidates } from './seasonal-bridge.mjs';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');
const TRENDS_DIR = path.join(PROJECT_ROOT, 'content', 'trends');

// ─── 카테고리/유형 매핑 ──────────────────────────────────────────────

// '이사·청소·주거' 서비스 명사 — 가정 내 시공/설치/청소 서비스
const HOME_SERVICE_NOUNS = [
  '이사', '청소', '정수기', '보일러', '누수', '방충망', '도배', '장판', '변기', '세탁기',
  '에어컨', '가전', '비데', 'CCTV', '커튼', '블라인드', '싱크대', '샷시', '단열', '방역',
  '도어락', '공기청정기', '식기세척기', '안마의자', '이불', '카페트', '배수구', '필터',
  '대형폐기물', '냉장고', '건조기', '제습기', '전기레인지', '인덕션', '오븐', '샤워기',
  '수전', '타일', '줄눈', '곰팡이', '환풍기', '가스레인지', '보일러', '엘리베이터',
  '태양광', '지붕', '누수탐지', '에어프라이어', '로봇청소기', '공유기'
];

// '생활·정보' — 금융/통신/자동차/교육/여가 소비 (YMYL은 안전 유형만 통과)
const LIFE_SERVICE_NOUNS = [
  '렌탈', '알뜰폰', '요금제', '인터넷', 'IPTV', '헬스장', '학원', '자격증', '보험',
  '타이어', '블랙박스', '중고차', '렌터카', '리스', '아이폰', '휴대폰', '자동차', '배터리',
  '웨딩', '스드메', '대출', '적금', '카드', '보조금', '지원금', '장학금', '국민연금',
  '실업급여', '주휴수당', '최저임금', '퇴직금', '부동산', '전세', '월세', '이자'
];

export function mapCategory(text = '') {
  const t = String(text || '');
  if (HOME_SERVICE_NOUNS.some((n) => t.includes(n))) return '이사·청소·주거';
  return '생활·정보';
}

export function inferContentType(keyword = '') {
  const k = String(keyword || '');
  if (/비용|가격|요금|견적|렌탈|위약금|환불|보상|할인|대출|보험료|수수료/.test(k)) return 'cost';
  if (/신청|절차|서류|방법|기간|자격|준비물/.test(k)) return 'process';
  if (/고장|안 됨|원인|문제|해결/.test(k)) return 'problem';
  return 'cost';
}

// ─── 트렌드 → 상업 키워드 후보 도출 ──────────────────────────────────

// 트렌드 제목에서 핵심 명사구 추출 (뉴스/인물 노이즈 제거)
export function cleanTrendCore(title = '') {
  let t = String(title || '').trim();
  t = t.replace(/["'「」『』“”]/g, '');
  t = t.replace(/\((?:속보|종합|영상|사진)\)/g, '');
  t = t.replace(/\s*\([^)]*\)\s*$/g, '');
  t = t.trim();
  // "토트넘 대 찰턴", "레알 마드리드 대 레알 소시에다드" 같은 스포츠 매치는 노이즈
  if (/ 대 | vs\.? |토트넘|레알|베트남|대전|울산/.test(t)) return '';
  // 순수 인명(2~4자 한글) 중 서비스 명사와 무관한 것만 버림 — "과태료/면허/사다리차" 등은 유지
  if (/^[가-힣]{2,4}$/.test(t)) {
    // 서비스 명사/생활 명사에 포함된 단어는 버리지 않는다
    const keep = [...HOME_SERVICE_NOUNS, ...LIFE_SERVICE_NOUNS, '과태료', '면허', '사다리차', '비행기', '엘리베이터', '네팔', '합계출산율', '콜레스테롤', '폭염', '장마', '태풍', '폭우', '한파', '미세먼지', '항공권', '렌터카'];
    if (!keep.some((k) => k === t || k.includes(t) || t.includes(k))) return '';
  }
  // 날씨/정치 등 큰 카테고리 단독 트렌드는 시즌 브릿지로 전환하므로 유지 (예: "폭염" → 에어컨 청소)
  t = t.replace(/^(실시간|오늘의|내일)\s*/g, '');
  if (t.length < 2 || t.length > 24) return '';
  return t;
}

export function buildCandidates(core, category) {
  // 시즌 브릿지 우선: "과태료/면허/폭염" 등은 미리 정의된 고수익 키워드로 확장
  const bridged = getSeasonalBridgeCandidates(core);
  if (bridged) return bridged;
  const isHome = category === '이사·청소·주거';
  const hasServiceNoun = SERVICE_NOUNS.some((n) => core.includes(n));
  const rawSuffixes = isHome
    ? ['설치 비용', '청소 비용', '비용', '가격', '비교', '추천', '업체', '고장 원인']
    : hasServiceNoun
      ? ['비용', '가격', '비교', '추천', '렌탈', '신청 방법', '절차']
      : ['비용', '신청 방법', '가격 비교', '절차'];
  const seen = new Set();
  const out = [];
  const SERVICE_VERBS = /(청소|설치|수리|교체|점검|세척|교환)$/;
  const coreEnd = core.split(/\s+/).pop() || '';
  for (const sfx of rawSuffixes) {
    let kw;
    if (sfx === '설치 비용' && coreEnd === '설치') kw = `${core} 비용`;
    else if (sfx === '청소 비용' && coreEnd === '청소') kw = `${core} 비용`;
    else if (sfx === '신청 방법' && coreEnd === '신청') kw = `${core} 방법`;
    else if (coreEnd === sfx) continue; // 이미 끝에 있음
    else if (SERVICE_VERBS.test(coreEnd) && /^(설치|청소|수리|교체|점검|세척)/.test(sfx)) continue; // 동사 중복 (예: "청소 설치")
    else kw = `${core} ${sfx}`;
    if (kw.length <= 22 && !seen.has(kw)) {
      seen.add(kw);
      out.push(kw);
    }
  }
  return out;
}

// ─── 돈 점수 ─────────────────────────────────────────────────────────

export function trafficValue(trend) {
  const n = Number(trend?.traffic || 0);
  if (n >= 100000) return 6;
  if (n >= 50000) return 5;
  if (n >= 20000) return 4;
  if (n >= 10000) return 3;
  if (n >= 5000) return 2;
  return 1;
}

// moneyScore = 상업 의도(0~25)*2 + 총점(0~100)*0.3 + 검색량 가치*3
function moneyScore({ intentScore, totalScore, trend }) {
  return Math.round(intentScore * 2 + totalScore * 0.3 + trafficValue(trend) * 3);
}

// ─── 중복 판정 ───────────────────────────────────────────────────────

async function loadKeywords() {
  const raw = await fs.readFile(KEYWORDS_PATH, 'utf8');
  return JSON.parse(raw);
}

function keywordExists(existingKeywords, candidate) {
  const candNorm = normalizeTitle(candidate);
  return existingKeywords.some(
    (k) => normalizeTitle(k.keyword) === candNorm || normalizeTitle(k.keyword).includes(candNorm) || candNorm.includes(normalizeTitle(k.keyword))
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { date: '', cap: 5, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i + 1]) args.date = argv[i + 1], i++;
    else if (argv[i] === '--cap' && argv[i + 1]) args.cap = Number.parseInt(argv[i + 1], 10) || 5, i++;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--help') {
      console.log(`사용법: node trends-monetize.mjs [--date YYYY-MM-DD] [--cap N] [--dry-run]`);
      process.exit(0);
    }
  }
  if (!args.date) {
    const d = new Date();
    args.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const trendsPath = path.join(TRENDS_DIR, `${args.date}.json`);
  let trendsData;
  try {
    trendsData = JSON.parse(await fs.readFile(trendsPath, 'utf8'));
  } catch {
    console.error(`[trends-monetize] 트렌드 데이터가 없다: ${trendsPath} (먼저 trends-fetch.mjs 실행)`);
    process.exit(1);
  }
  const trends = trendsData.trends || [];
  if (trends.length === 0) {
    console.log('[trends-monetize] 수집된 트렌드가 없다. 종료.');
    return;
  }

  const keywordsData = await loadKeywords();
  const existingKeywords = keywordsData.keywords || [];
  const focusCategories = keywordsData.focusCategories || DEFAULT_FOCUS_CATEGORIES;
  const gate = await buildDuplicateGate({
    blogUrl: 'https://acstory.tistory.com',
    ledgerPath: path.join(PROJECT_ROOT, 'content', 'published.json'),
    log: () => {}
  });

  // 1) 후보 도출 + 스코어링
  const scored = [];
  for (const trend of trends) {
    const core = cleanTrendCore(trend.title);
    if (!core) continue;
    const isBridged = getSeasonalBridgeCandidates(core) !== null;
    const baseCategory = mapCategory(core);
    for (const candidate of buildCandidates(core, baseCategory)) {
      const category = mapCategory(candidate) !== '생활·정보' || baseCategory === '이사·청소·주거' ? baseCategory : mapCategory(candidate);
      const contentType = inferContentType(candidate);
      const r = scoreKeyword({
        keyword: candidate,
        category,
        contentType,
        metrics: { monthlySearch: 0, cpcKrw: 0, source: 'estimate', checkedAt: '' }
      }, { focusCategories });
      if (!r.gates.ymyl.allowed) continue;
      if (!r.gates.focus.allowed) continue;
      // 상업 의도 문턱: 브릿지 키워드는 6점부터 허용, 일반은 8점
      const intentThreshold = isBridged ? 6 : 8;
      if (r.intent.score < intentThreshold) continue;
      if (!isBridged && r.intent.intent === 'informational') continue;
      // 기존 키워드/발행 원장 중복
      if (keywordExists(existingKeywords, candidate)) continue;
      const dup = isAlreadyPublished({ id: '', keyword: candidate, title: candidate }, gate);
      if (dup.matched) continue;
      scored.push({
        candidate,
        category,
        contentType,
        core,
        trendTitle: trend.title,
        trend,
        intentScore: r.intent.score,
        totalScore: r.score.total,
        ymylRisk: detectYmylRisk(candidate, category),
        money: moneyScore({ intentScore: r.intent.score, totalScore: r.score.total, trend })
      });
    }
  }
  const byCore = new Map();
  for (const s of scored) {
    const prev = byCore.get(s.core);
    if (!prev || s.money > prev.money) byCore.set(s.core, s);
  }
  const best = [...byCore.values()].sort((a, b) => b.money - a.money || b.intentScore - a.intentScore).slice(0, args.cap);

  console.log(`[trends-monetize] 트렌드 ${trends.length}건 → 후보 ${scored.length}건 → 선정 ${best.length}건`);
  for (const b of best) {
    console.log(`  ✓ ${b.candidate} [${b.category}/${b.contentType}] 의도=${b.intentScore} 총점=${b.totalScore} 돈점수=${b.money} (← "${b.trendTitle}" ${b.trend.trafficText})`);
  }
  if (best.length === 0) {
    // 트렌드가 전부 연예/스포츠면 월별 계절 키워드로 fallback — 매일 최소 1건은 돈되는 글로 연결
    const { getMonthlySeasonalKeywords } = await import('./seasonal-bridge.mjs');
    const month = Number.parseInt(args.date.slice(5, 7), 10) || new Date().getMonth() + 1;
    const seasonal = getMonthlySeasonalKeywords(month);
    const fallbackCandidates = [];
    for (const kw of seasonal.slice(0, args.cap)) {
      if (keywordExists(existingKeywords, kw)) continue;
      const dup = isAlreadyPublished({ id: '', keyword: kw, title: kw }, gate);
      if (dup.matched) continue;
      const category = mapCategory(kw);
      const contentType = inferContentType(kw);
      const r = scoreKeyword({ keyword: kw, category, contentType, metrics: { monthlySearch: 0, cpcKrw: 0, source: 'estimate', checkedAt: '' } }, { focusCategories });
      if (!r.gates.ymyl.allowed || !r.gates.focus.allowed) continue;
      fallbackCandidates.push({ candidate: kw, category, contentType, core: kw.split(' ')[0], trendTitle: `${month}월 시즌 키워드`, trend: { traffic: 5000, trafficText: '시즌 수요', increasePct: 0 }, intentScore: r.intent.score, totalScore: r.score.total, ymylRisk: detectYmylRisk(kw, category), money: moneyScore({ intentScore: r.intent.score, totalScore: r.score.total, trend: { traffic: 5000 } }) });
    }
    if (fallbackCandidates.length > 0) {
      console.log(`[trends-monetize] 트렌드 0건 → 시즌 fallback ${fallbackCandidates.length}건 주입 (${month}월)`);
      best.push(...fallbackCandidates.slice(0, args.cap));
    } else {
      console.log('[trends-monetize] 오늘은 수익형 트렌드가 없다. (뉴스/연예 위주) — 시즌 fallback도 중복으로 스킵');
      return;
    }
  }
  // 3) keywords.json 등록
  if (args.dryRun) {
    console.log(`[trends-monetize] (dry-run) 등록 생략`);
    return;
  }
  const dateCompact = args.date.replace(/-/g, '');
  let seq = 1;
  const now = new Date().toISOString();
  for (const b of best) {
    const id = `trend-${dateCompact}-${seq++}`;
    existingKeywords.push({
      id,
      keyword: b.candidate,
      category: b.category,
      contentType: b.contentType,
      tags: [b.core, ...(b.contentType === 'cost' ? ['비용'] : b.contentType === 'process' ? ['신청'] : ['해결'])],
      description: `Google 트렌드 발굴 — "${b.trendTitle}" (${b.trend.trafficText})`,
      metrics: { monthlySearch: b.trend.traffic || 0, cpcKrw: 0, source: 'trends', checkedAt: '' },
      score: {
        intent: b.intentScore,
        bid: 0,
        volume: 0,
        gap: 0,
        source: 10,
        durability: 10,
        total: b.totalScore
      },
      gap: { priceTableMissing: null, noAsOfDate: null, extraFeesUncovered: null, rawTotal: 0 },
      ymylRisk: b.ymylRisk.risk,
      commercialIntent: b.intentScore,
      cpcTier: 'U',
      enabled: true,
      ymylDomain: b.ymylRisk.domain,
      researchedAt: now,
      source: 'trends',
      trendSource: {
        title: b.trendTitle,
        traffic: b.trend.trafficText,
        increasePct: b.trend.increasePct,
        fetchedAt: now
      }
    });
  }
  keywordsData.updatedAt = now;
  await fs.writeFile(KEYWORDS_PATH, JSON.stringify(keywordsData, null, 2), 'utf8');
  // 생성 스크립트(generate-daily.sh)가 읽을 수 있게 선택 id를 파일로도 저장
  const ids = best.map((_, i) => `trend-${dateCompact}-${i + 1}`);
  await fs.writeFile(path.join(TRENDS_DIR, `${args.date}.selected.txt`), ids.join('\n') + '\n', 'utf8');
  console.log(`[trends-monetize] ${best.length}건 keywords.json 등록 완료 (id: ${ids.join(', ')})`);
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('trends-monetize.mjs')) {
  main().catch((error) => {
    console.error(`[trends-monetize] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
