#!/usr/bin/env node
/**
 * keyword-score.mjs — 키워드 평가 루브릭 (수익형 블로그 가이드 배점)
 *
 * docs/design/content-selection-upgrade.md §2 기준:
 *   상업 의도 25 / 광고 입찰가 20 / 검색량 15 / 경쟁 갭 20 / 자료 확보 10 / 지속 검색 10
 * 하드 게이트 판정 (YMYL / 주제 집중) + 큐 선택용 selectionScore 산출.
 *
 * 사용법:
 *   node scripts/content/keyword-score.mjs --keyword "입주청소 30평 비용" --category "이사·청소·주거"
 *   node scripts/content/keyword-score.mjs --keyword-id invest-01 --json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { isWeatherTriggered } from './seasonal-bridge.mjs';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const KEYWORDS_PATH = path.join(PROJECT_ROOT, 'content', 'keywords', 'keywords.json');

// ─── 가이드 §4 단어 사전 ──────────────────────────────────────────────

// 강한 상업어 (2점/개, 최대 14점) — 구매·계약 의도
export const STRONG_COMMERCIAL_WORDS = [
  '비용', '가격', '견적', '평균', '비교', '추천', '업체', '순위', '상담', '신청',
  '가입', '설치', '교체', '대여', '렌탈', '위약금', '환불', '보상', '청구', '대행',
  '추가요금', '요금', '할인', '보조금', '지원금', '수당', '급여', '장학금', '보험료',
  '요율', '수수료', '기름값', '난방비', '전기요금', '보험'
];

// 보조어 (1점/개, 최대 5점) — 검색 유입 확장
export const AUX_WORDS = [
  '준비물', '절차', '기간', '주의사항', '체크리스트', '후기', '장단점', '셀프',
  '직접', '취소', '문제', '안 됨', '늦어짐', '분쟁'
];

// 정보형 단어 (감점 −5점) — 구매 의도 약함
export const INFO_WORDS = ['뜻', '이란', '정의', '종류', '개념'];

// 서비스 명사 (6점/개, 최대 12점) — 계약·구매가 전제된 서비스 분야 (가이드 §2 A급)
export const SERVICE_NOUNS = [
  '이사', '청소', '정수기', '렌탈', '보일러', '누수', '방충망', '도배', '장판', '변기',
  '세탁기', '에어컨', '가전', '인터넷', '알뜰폰', '요금제', 'CCTV', '비데', '웨딩',
  '스드메', '학원', '자격증', '보험', '타이어', '블랙박스', '중고차', '렌터카', '리스',
  '커튼', '블라인드', '싱크대', '샷시', '단열', '방역', '도어락', '공기청정기',
  '식기세척기', '안마의자', '헬스장', '이불', '카페트', '배수구', '필터', 'IPTV',
  '도시가스', '아이폰', '휴대폰', '자동차', '배터리', '대형폐기물', '전입신고', '확정일자',
  '엘리베이터', '전기차', '냉장고', '건조기', '제습기', '인덕션', '전기레인지', '오븐',
  '샤워기', '수전', '타일', '줄눈', '곰팡이', '환풍기', '태양광', '지붕', '누수탐지',
  '가스레인지', '에어프라이어', '로봇청소기', '공유기', '모니터', '노트북', '태블릿'
];

// 평수/규모 패턴 (+2점) — "30평" 등 서비스 규모 명시는 계약 직전 의도
const SCALE_RE = /\d+\s*평/;

// ─── 상업적 의도 점수 (배점 25) ───────────────────────────────────────

export function scoreCommercialIntent(keyword = '') {
  const text = String(keyword || '').replace(/\s+/g, '');
  const strongHits = [];
  const auxHits = [];
  const infoHits = [];
  const serviceHits = [];

  for (const w of STRONG_COMMERCIAL_WORDS) {
    if (text.includes(w)) strongHits.push(w);
  }
  for (const w of AUX_WORDS) {
    if (text.includes(w)) auxHits.push(w);
  }
  for (const w of INFO_WORDS) {
    if (text.includes(w)) infoHits.push(w);
  }
  for (const w of SERVICE_NOUNS) {
    if (text.includes(w)) serviceHits.push(w);
  }

  let score = Math.min(14, strongHits.length * 2)
    + Math.min(12, serviceHits.length * 6)
    + Math.min(5, auxHits.length);
  if (SCALE_RE.test(keyword)) score += 2;
  if (infoHits.length > 0) score -= 5;
  score = Math.max(0, Math.min(25, score));

  let intent = 'informational';
  if (score >= 10) intent = 'commercial';
  else if (score >= 4) intent = 'mixed';

  return {
    score,
    intent,
    strongHits,
    auxHits,
    infoHits
  };
}

// ─── 실측 메트릭 구간 매핑 (배점 20/15) ────────────────────────────────
// 실측 provenance 없으면 0점 (I2). 구간은 설계 문서 §2.2 표 기준.

export function scoreBid(measuredCpcKrw) {
  const cpc = Number(measuredCpcKrw);
  if (!Number.isFinite(cpc) || cpc <= 0) return 0;
  if (cpc >= 5000) return 20;
  if (cpc >= 3000) return 17;
  if (cpc >= 1500) return 13;
  if (cpc >= 800) return 9;
  if (cpc >= 300) return 5;
  return 2;
}

export function scoreVolume(monthlySearch) {
  const vol = Number(monthlySearch);
  if (!Number.isFinite(vol) || vol <= 0) return 0;
  if (vol >= 100000) return 15;
  if (vol >= 30000) return 12;
  if (vol >= 10000) return 9;
  if (vol >= 3000) return 6;
  if (vol >= 1000) return 3;
  return 1;
}

export function cpcTierFromCpc(cpcKrw) {
  const cpc = Number(cpcKrw);
  if (!Number.isFinite(cpc) || cpc <= 0) return 'U';
  if (cpc >= 3000) return 'S';
  if (cpc >= 1500) return 'A';
  if (cpc >= 800) return 'B';
  if (cpc >= 300) return 'C';
  return 'D';
}

// ─── 실측 선정 반영 (Phase 5): measured CPC/검색량을 selectionScore 보너스로 ──
// bid 20점 만점 → 6점, volume 15점 만점 → 4점, 합 최대 10점. 0으로 치환 금지 — 실측 없으면 0.
export function measuredSelectionBonus(measuredCpcKrw, monthlySearch) {
  const bid = scoreBid(measuredCpcKrw);
  const vol = scoreVolume(monthlySearch);
  if (bid === 0 && vol === 0) return 0;
  const bidBonus = Math.round((bid / 20) * 6);
  const volBonus = Math.round((vol / 15) * 4);
  return Math.min(10, bidBonus + volBonus);
}

// ─── 경쟁 갭 점수 (배점 20) ───────────────────────────────────────────
// serpGap: market-research.mjs G003 반환값 (신호별 점수 합 0~26). 20점 만점 정규화.

export function normalizeGapScore(serpGap = {}) {
  const raw = Number(serpGap?.total ?? serpGap?.rawTotal ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.round(Math.min(20, (raw / 26) * 20));
}

// ─── 자료 확보 점수 (배점 10) ─────────────────────────────────────────
// 수동 플래그 + 분야 규칙. 공식 자료(정부/공공/약관/공개 가격표) 확보 가능성.

const OFFICIAL_SOURCE_DOMAINS = {
  '이사·청소·주거': ['공정거래위원회 표준약관', '지자체 폐기물 수수료표', '업체 공개 견적'],
  '생활·정보': ['통신사 공식 요금표', '공공기관 자료', '약관'],
  'IT·테크': ['공식 문서', '벤더 문서'],
  '투자·재테크': ['금융감독원', '국세청', '기관 공식 자료'],
  'AI 활용법': ['공식 문서', '벤더 블로그']
};

export function scoreSourceAvailability(keyword = '', category = '', manualFlag = null) {
  if (manualFlag === true) return 10;
  if (manualFlag === false) return 0;
  const text = `${keyword} ${category}`;
  let score = 0;
  if (/비용|가격|요금|견적|수수료|보조금|지원금|급여|봉급/.test(text)) score += 6; // 공개 가격표/기준표 존재
  if (/이사|청소|정수기|렌탈|알뜰폰|인터넷|보일러|누수/.test(text)) score += 2; // 사업자 약관/요금표
  if (/신청|절차|자격|기준|서류/.test(text)) score += 2; // 정부/공공 절차 자료
  if (OFFICIAL_SOURCE_DOMAINS[category]) score += 2; // 분야별 공신력 자료 존재
  return Math.min(10, score);
}

// ─── 지속 검색 점수 (배점 10) ─────────────────────────────────────────
// "연도" 키워드는 갱신 부담으로 감점, 비용·절차·문제형은 지속 검색 고득점.

export function scoreDurability(keyword = '', contentType = '') {
  const text = String(keyword || '');
  let score = 5;
  if (/20\d{2}/.test(text)) score -= 4; // 시의성 키워드 — 갱신 부담
  if (/비용|가격|요금|위약금|체크리스트|절차|문제|주의사항|준비물/.test(text)) score += 5; // 지속 검색
  if (['cost', 'checklist', 'problem'].includes(contentType)) score += 2;
  if (/뉴스|트렌드|이슈/.test(text)) score -= 3;
  return Math.max(0, Math.min(10, score));
}

// ─── YMYL 리스크 / 하드 게이트 ────────────────────────────────────────
// 가이드 §2 S급 후보 + §3 안전 범위. 위험 분야는 허용 유형(공식 절차·서류·용어·문의처·수수료·경험기록)만 통과.

const YMYL_DOMAINS = [
  { domain: '대출·금융', re: /대출|카드론|채무조정|개인회생|적금|펀드|주식|주담대|전세자금|신용|ISA|연금|IRP|ETF|CMA|청약|배당|세액|공제|DSR/ },
  { domain: '보험', re: /보험|실손|암보험|치아보험|운전자보험/ },
  { domain: '세무·법률', re: /세금|소득세|상속세|증여세|부가가치세|이혼|교통사고|임대차|지급명령|법률|근로장려금|자녀장려금/ },
  { domain: '건강', re: /치료|의약|약물|처방|병원|건강|다이어트|식이요법|보충제|영양제/ }
];

export const YMYL_DENIED_PATTERNS = [
  '무조건 승인', '승인 보장', '가장 좋은 보험', '가장 좋은 대출', '확실히 줄이는',
  '확실히 내리는', '소송에서 이기는', '치료 효과', '완치', '부작용 없이'
];

// YMYL 허용 유형 (가이드 §2 안전 범위)
export const YMYL_SAFE_TYPES = [
  '공식 절차 정리', '필요 서류 정리', '공식 용어 설명', '기관별 문의처',
  '공개 수수료·처리기간', '직접 신청 경험', '공식 자료 풀어쓰기'
];

export function detectYmylRisk(keyword = '', category = '') {
  const text = `${keyword} ${category}`;
  for (const d of YMYL_DOMAINS) {
    if (d.re.test(text)) return { risk: 'high', domain: d.domain };
  }
  return { risk: 'none', domain: '' };
}

export function evaluateYmylGate({ keyword = '', category = '', contentType = '', title = '' } = {}) {
  const risk = detectYmylRisk(keyword, category);
  if (risk.risk === 'none') return { allowed: true, risk, reason: '비-YMYL' };

  const checkText = `${keyword} ${title}`;
  const denied = YMYL_DENIED_PATTERNS.find(p => checkText.includes(p));
  if (denied) {
    return { allowed: false, risk, reason: `YMYL 거부 패턴: ${denied}` };
  }

  // 허용 유형 판정 — 키워드가 공식 절차/서류/문의처 성격이면 통과
  const safe = [
    { label: '공식 절차 정리', re: /절차|신청 방법|신청 절차|진행 순서/ },
    { label: '필요 서류 정리', re: /서류|준비물|구비/ },
    { label: '공식 용어 설명', re: /용어|개념|뜻/ },
    { label: '기관별 문의처', re: /문의|상담|전화|센터/ },
    { label: '공개 수수료·처리기간', re: /수수료|처리 기간|기간|비용|수수/ },
    { label: '직접 신청 경험', re: /신청 후기|직접 신청|경험/ },
    { label: '공식 자료 풀어쓰기', re: /정리|해설|가이드/ }
  ];
  const matched = safe.filter(s => s.re.test(checkText)).map(s => s.label);

  if (matched.length === 0) {
    return { allowed: false, risk, reason: 'YMYL 허용 유형(공식 절차·서류·문의처·수수료·경험기록)에 해당하지 않음' };
  }
  return { allowed: true, risk, reason: `YMYL 안전 유형: ${matched.join(', ')}` };
}

// ─── 주제 집중 게이트 ─────────────────────────────────────────────────

export const DEFAULT_FOCUS_CATEGORIES = ['이사·청소·주거', '생활·정보'];

export function evaluateFocusGate(category = '', { focusCategories = DEFAULT_FOCUS_CATEGORIES, allowLegacySeries = false } = {}) {
  if (focusCategories.includes(category)) return { allowed: true, reason: `울타리 카테고리: ${category}` };
  if (allowLegacySeries && ['IT·테크', '개발지식', '개발 회고', 'AI 활용법'].includes(category)) {
    return { allowed: true, reason: `레거시 시리즈 예외: ${category}` };
  }
  return { allowed: false, reason: `울타리 밖 카테고리: ${category} (FOCUS: ${focusCategories.join(', ')})` };
}

// ─── 통합 루브릭 ──────────────────────────────────────────────────────

export function scoreKeyword(keywordObj = {}, options = {}) {
  const keyword = String(keywordObj.keyword || options.keyword || '').trim();
  const category = String(keywordObj.category || options.category || '').trim();
  const contentType = String(keywordObj.contentType || options.contentType || '').trim();

  const metrics = keywordObj.metrics || options.metrics || {};
  const measured = metrics.source && metrics.source !== 'estimate' && metrics.checkedAt;

  const intent = scoreCommercialIntent(keyword);
  const bid = measured ? scoreBid(metrics.cpcKrw) : 0;          // I2: 실측만 배점
  const volume = measured ? scoreVolume(metrics.monthlySearch) : 0;
  const gap = normalizeGapScore(options.serpGap || keywordObj.gap);
  const source = scoreSourceAvailability(keyword, category, options.sourceAvailable);
  const durability = scoreDurability(keyword, contentType);

  const total = intent.score + bid + volume + gap + source + durability;

  const ymyl = evaluateYmylGate({ keyword, category, contentType, title: keywordObj.title || options.title || '' });
  const focus = evaluateFocusGate(category, options);

  return {
    keyword,
    category,
    contentType,
    intent,
    score: {
      intent: intent.score,
      bid,
      volume,
      gap,
      source,
      durability,
      total
    },
    gates: { ymyl, focus },
    pass: ymyl.allowed && focus.allowed && total >= 60
  };
}

// ─── 큐 선택용 selectionScore (auto-queue.mjs G005에서 사용) ──────────
// selectionScore = 45% 상업 의도 + 25% qaScore + 20% 경쟁 갭 + 10% 신선도 (설계 §5)
// Phase 5 확장: measuredBonus(실측 bid/volume → 최대 10점)와 weatherTriggered(+30% 별도 가중)는
// 선택적 가중으로, 없으면 기존 동작을 그대로 유지한다 (shadow-run 호환).
export function computeSelectionScore({ commercialIntentScore = 0, qaScore = 0, serpGapScore = 0, freshness = 1, measuredBonus = 0, weatherTriggered = false, weatherBoost = false, keyword = '', activeTriggers = null, activeWeatherTriggers = null } = {}) {
  const intentNorm = Math.min(25, Math.max(0, commercialIntentScore)) / 25; // 0~1
  const qaNorm = Math.min(100, Math.max(0, qaScore)) / 100;
  const gapNorm = Math.min(20, Math.max(0, serpGapScore)) / 20;
  const freshNorm = Math.min(1, Math.max(0, freshness));
  const raw = 0.45 * intentNorm + 0.25 * qaNorm + 0.20 * gapNorm + 0.10 * freshNorm;
  let score = Math.round(raw * 100);
  // 실측 보너스: bid/volume 실측 반영 (별도 10점, 캡 100) — NaN guard, 실패를 0으로 치환 금지
  const mBonusNum = Number(measuredBonus);
  const mBonus = Number.isFinite(mBonusNum) ? mBonusNum : 0;
  if (mBonus !== 0) score = Math.min(100, score + Math.round(mBonus));
  // 날씨 부스팅: trigger 시 +30% 별도 가중 (캡 100, 실패를 0으로 치환 금지)
  // weatherTriggered가 직접 주어지면 그대로 사용, 아니면 keyword+activeTriggers로 seasonal-bridge 통해 유도
  let shouldWeatherBoost = Boolean(weatherTriggered || weatherBoost);
  if (!shouldWeatherBoost && keyword) {
    const triggers = activeTriggers ?? activeWeatherTriggers;
    if (Array.isArray(triggers) && triggers.length) {
      try { shouldWeatherBoost = isWeatherTriggered(String(keyword), triggers); } catch {}
    }
  }
  if (shouldWeatherBoost) score = Math.min(100, Math.round(score * 1.3));
  return score;
}

export function freshnessFactor(generatedAtIso, now = new Date(), maxAgeDays = 14) {
  if (!generatedAtIso) return 0.5;
  const ageDays = (now.getTime() - new Date(generatedAtIso).getTime()) / 86400000;
  if (ageDays <= 0) return 1;
  return Math.max(0, 1 - ageDays / maxAgeDays);
}
export function topicClusterOf(keywordObj = {}) {
  if (keywordObj?.topicCluster) return String(keywordObj.topicCluster);
  const tags = Array.isArray(keywordObj?.tags) ? keywordObj.tags : [];
  const generic = new Set([
    '비용', '비교', '추천', '견적', '추가요금', '체크리스트', '2026', '신청', '고장',
    '렌탈', '설치', '청소', '해지', '방법', '가이드', '절차', '후기'
  ]);
  for (const t of tags) {
    if (t && !generic.has(t)) return String(t);
  }
  const kw = String(keywordObj?.keyword || '').trim();
  if (!kw) return String(keywordObj?.id || '');
  return kw.split(/\s+/)[0];
}

// 최근 발행/생성 소주제와 겹치면 0~1 감쇠. 동일 클러스터 0회=1, 1회=0.55, 2회=0.25, 3회+=0.1
export function topicDiversityFactor(cluster, recentClusters = []) {
  if (!cluster) return 1;
  const hits = recentClusters.filter(c => c && c === cluster).length;
  if (hits <= 0) return 1;
  if (hits === 1) return 0.55;
  if (hits === 2) return 0.25;
  return 0.1;
}

// selectionScore에 소주제 다양성 가중(기본 25%)을 섞는다. base는 기존 0~100.
export function applyTopicDiversity(baseScore, diversityFactor = 1, weight = 0.25) {
  const base = Math.min(100, Math.max(0, Number(baseScore) || 0));
  const div = Math.min(1, Math.max(0, Number(diversityFactor) || 0));
  const w = Math.min(1, Math.max(0, Number(weight) || 0));
  return Math.round(base * (1 - w + w * div));
}

// ─── 날씨 부스팅 (Phase 5): trigger 시 +30% 별도 가중 ─────────────────────
// metrics-injector/selectionScore에서 trigger 시 적용. 0으로 치환 금지 — trigger 없으면 기존 점수 유지.
export function applyWeatherBoost(baseScore, triggered = false) {
  const base = Math.min(100, Math.max(0, Number(baseScore) || 0));
  if (!triggered) return base;
  return Math.min(100, Math.round(base * 1.3));
}

// ─── 키워드 로드/CLI ──────────────────────────────────────────────────

async function loadKeywords() {
  const raw = await fs.readFile(KEYWORDS_PATH, 'utf8');
  return JSON.parse(raw).keywords || [];
}

function parseArgs(argv) {
  const args = { keywordId: '', keyword: '', category: '', json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--keyword-id' && argv[i + 1]) { args.keywordId = argv[++i]; }
    else if (argv[i] === '--keyword' && argv[i + 1]) { args.keyword = argv[++i]; }
    else if (argv[i] === '--category' && argv[i + 1]) { args.category = argv[++i]; }
    else if (argv[i] === '--json') { args.json = true; }
    else if (argv[i] === '--help') {
      console.log(`사용법: node keyword-score.mjs --keyword "입주청소 30평 비용" --category "이사·청소·주거" [--json]
  --keyword-id ID   keywords.json 키워드로 평가
  --keyword TEXT    직접 키워드 입력
  --category TEXT   카테고리
  --json            JSON 출력`);
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  let kw;
  if (args.keywordId) {
    const keywords = await loadKeywords();
    kw = keywords.find(k => k.id === args.keywordId);
    if (!kw) throw new Error(`키워드를 찾을 수 없다: ${args.keywordId}`);
  } else {
    kw = { keyword: args.keyword, category: args.category };
  }
  const result = scoreKeyword(kw);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`키워드: ${result.keyword} (${result.category})`);
    console.log(`의도: ${result.intent.intent} (${result.intent.score}/25) — 상업어: ${result.intent.strongHits.join(', ') || '없음'}`);
    console.log(`배점: 입찰가 ${result.score.bid}/20 · 검색량 ${result.score.volume}/15 · 갭 ${result.score.gap}/20 · 자료 ${result.score.source}/10 · 지속 ${result.score.durability}/10`);
    console.log(`총점: ${result.score.total}/100`);
    console.log(`YMYL: ${result.gates.ymyl.allowed ? '통과' : '거부'} — ${result.gates.ymyl.reason}`);
    console.log(`주제: ${result.gates.focus.allowed ? '통과' : '거부'} — ${result.gates.focus.reason}`);
    console.log(`판정: ${result.pass ? '등재 후보' : '탈락'}`);
  }
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('keyword-score.mjs')) {
  main().catch(error => {
    console.error(`[keyword-score] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
