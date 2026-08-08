import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeSelectionScore,
  normalizeGapScore,
  scoreCommercialIntent,
  evaluateYmylGate,
  evaluateFocusGate,
  detectYmylRisk,
  topicClusterOf,
  topicDiversityFactor,
  applyTopicDiversity
} from '../../scripts/content/keyword-score.mjs';
import { mixBucket } from '../../scripts/content/select-keywords.mjs';
import { enforceMix, rerankWithBatchDiversity } from '../../scripts/content/auto-queue.mjs';

// ─── computeSelectionScore (설계 §5: 45% 의도 + 25% QA + 20% 갭 + 10% 신선도) ───

test('selection score 가중치 계약: 만점 100, 클램프', () => {
  assert.equal(
    computeSelectionScore({ commercialIntentScore: 25, qaScore: 100, serpGapScore: 20, freshness: 1 }),
    100
  );
  // 입력 상한을 넘겨도 100을 넘지 않는다
  assert.equal(
    computeSelectionScore({ commercialIntentScore: 99, qaScore: 999, serpGapScore: 99, freshness: 9 }),
    100
  );
  // 최소 구성: 의도 0·QA 0·갭 0·신선도 0.5 (날짜 없는 키워드 기본)
  assert.equal(
    computeSelectionScore({ commercialIntentScore: 0, qaScore: 0, serpGapScore: 0, freshness: 0.5 }),
    5
  );
});

test('selection score는 각 구성요소 비중에 비례한다', () => {
  const base = { commercialIntentScore: 0, qaScore: 0, serpGapScore: 0, freshness: 0.5 };
  // 의도 25점 만점 → +45점
  assert.equal(computeSelectionScore({ ...base, commercialIntentScore: 25 }), 50);
  // QA 100점 → +25점
  assert.equal(computeSelectionScore({ ...base, qaScore: 100 }), 30);
  // 갭 20점 만점 → +20점
  assert.equal(computeSelectionScore({ ...base, serpGapScore: 20 }), 25);
  // 신선도 0.5 → 1.0은 +5점 (10% 가중치 × 0.5 구간)
  assert.equal(computeSelectionScore({ ...base, freshness: 1 }), 10);
});

// ─── normalizeGapScore (갭 0~26 → 0~20) ───

test('갭 정규화: 26점 만점이 20점으로, 0 이하·무결은 0', () => {
  assert.equal(normalizeGapScore({ total: 26 }), 20);
  assert.equal(normalizeGapScore({ total: 13 }), 10);
  assert.equal(normalizeGapScore({ total: 0 }), 0);
  assert.equal(normalizeGapScore({ total: -5 }), 0);
  assert.equal(normalizeGapScore(undefined), 0);
  assert.equal(normalizeGapScore({}), 0);
  // rawTotal 레거시 폴백
  assert.equal(normalizeGapScore({ rawTotal: 26 }), 20);
});

// ─── mixBucket (keywords.json 정규 contentType 기준) ───

test('믹스 버킷 분류: cost/comparison/calculator→비용, guide/checklist/procedure→절차, problem→문제해결, 기타', () => {
  assert.equal(mixBucket('cost'), '비용');
  assert.equal(mixBucket('comparison'), '비용');
  assert.equal(mixBucket('calculator'), '비용');
  assert.equal(mixBucket('guide'), '절차');
  assert.equal(mixBucket('checklist'), '절차');
  assert.equal(mixBucket('procedure'), '절차');
  assert.equal(mixBucket('problem'), '문제해결');
  assert.equal(mixBucket('info'), '정보·기타');
  assert.equal(mixBucket(''), '정보·기타');
  assert.equal(mixBucket(undefined), '정보·기타');
});

// ─── enforceMix (설계 §3: 50/30/20 ±10%p, 정보·기타 20% 상한, 캡 초과 미채움, 완전 정지 방지) ───

function kw(id, contentType) {
  return { id, contentType };
}
function cand(kwObj, score = 100) {
  return { post: { id: kwObj.id }, kw: kwObj, selectionScore: score };
}

test('믹스 게이트: 목표 ±10%p 초과 유형은 defer, 부족 유형은 채운다', () => {
  // 최근 10건: 비용 6 (60% — 경계), 절차 3, 문제해결 1
  const recent = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, contentType: 'cost' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `r6${i}`, contentType: 'guide' })),
    { id: 'r9', contentType: 'problem' }
  ];
  const kwById = new Map(recent.map(p => [p.id, p]));
  const candidates = [
    cand(kw('c1', 'cost'), 90),
    cand(kw('c2', 'cost'), 85),
    cand(kw('c3', 'cost'), 80),
    cand(kw('g1', 'guide'), 70),
    cand(kw('g2', 'guide'), 65),
    cand(kw('m1', 'problem'), 60),
    cand(kw('m2', 'problem'), 50),
    cand(kw('m3', 'problem'), 40)
  ];
  const { selected, rejectedMix } = enforceMix(candidates, recent, kwById, 5);

  // c1: (6+1)/11 = 63.6% > 60% → defer / c2: (7)/12 = 58.3% ≤ 60% → 통과 / c3: 61.5% → defer
  // g1: 36.4% ≤ 40% 통과 / g2: 41.7% > 40% defer / m1·m2: ≤30% 통과 / m3: 30.8% defer
  const reasons = rejectedMix.map(r => r.reason);
  assert.ok(reasons.some(r => r.includes('비용 유형 목표 비중 초과')), `defer 이유: ${reasons}`);
  assert.ok(reasons.some(r => r.includes('절차 유형 목표 비중 초과')));
  const picked = selected.map(s => s.kw.id);
  assert.ok(picked.includes('g1'));
  assert.ok(picked.includes('m1'));
  assert.ok(picked.includes('m2'));
  // 완전 정지 방지: defer 풀에서 캡(5)까지 점수순 채움 → c1(90) 재충전
  assert.equal(selected.length, 5);
  assert.ok(picked.includes('c1'));
});

test('일일 발행 캡 초과분은 믹스 완화로도 채우지 않는다', () => {
  // 최근 10건이 목표 비중 내라 믹스 defer 없이 5건이 차는 시나리오
  const recent = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, contentType: 'cost' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `r5${i}`, contentType: 'guide' })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `r8${i}`, contentType: 'problem' }))
  ];
  const kwById = new Map(recent.map(p => [p.id, p]));
  const candidates = [
    cand(kw('c1', 'cost')), cand(kw('c2', 'cost')),
    cand(kw('g1', 'guide')), cand(kw('g2', 'guide')), cand(kw('g3', 'guide')),
    cand(kw('m1', 'problem')), cand(kw('m2', 'problem')),
    cand(kw('n1', 'cost')) // 6번째부터는 캡 초과 defer
  ];
  const { selected, rejectedMix } = enforceMix(candidates, recent, kwById, 5);

  assert.equal(selected.length, 5); // 캡 5
  const capReasons = rejectedMix.filter(r => r.reason.startsWith('일일 발행 캡 초과'));
  assert.ok(capReasons.length >= 1, `캡 초과 defer 없음: ${rejectedMix.map(r => r.reason)}`);
  // 캡 초과 reason은 fill에서 절대 재충전되지 않는다 — selected가 이미 5건이라 fill 미실행
  assert.equal(selected.length, 5);
});

test('정보·기타(레거시 시리즈)는 20% 상한으로 defer', () => {
  // 최근 10건: 비용 5, 절차 3, 문제해결 1, 정보 1 (레거시 이미 10%)
  const recent = [
    ...Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, contentType: 'cost' })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `r5${i}`, contentType: 'guide' })),
    { id: 'r8', contentType: 'problem' },
    { id: 'r9', contentType: 'info' }
  ];
  const kwById = new Map(recent.map(p => [p.id, p]));
  const candidates = [
    cand(kw('l1', 'info'), 90),
    cand(kw('l2', 'info'), 80),
    cand(kw('c1', 'cost'), 60),
    cand(kw('g1', 'guide'), 50),
    cand(kw('m1', 'problem'), 40)
  ];
  const { selected, rejectedMix } = enforceMix(candidates, recent, kwById, 4);

  // l1: (1+1)/11 = 18.2% ≤ 20% 통과 / l2: (2+1)/12 = 25% > 20% defer
  // 캡 4로 이미 꽉 차 fill이 실행되지 않아 l2는 미채택
  const reasons = rejectedMix.map(r => r.reason);
  assert.ok(reasons.some(r => r.includes('레거시 시리즈 비중 상한 초과')), `defer 이유: ${reasons}`);
  assert.ok(selected.some(s => s.kw.id === 'l1'));
  assert.ok(!selected.some(s => s.kw.id === 'l2'));
});

// ─── YMYL / 울타리 게이트 (설계 §2·§6) ───

test('YMYL 게이트: 금융 고위험은 거부, 공식 절차 유형은 허용', () => {
  const risk = detectYmylRisk('개인연금 세액공제', '투자·재테크');
  assert.equal(risk.risk, 'high');
  const denied = evaluateYmylGate({ keyword: 'ISA 추천 2026', category: '투자·재테크', contentType: 'guide' });
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /YMYL 허용 유형/);
  const allowed = evaluateYmylGate({
    keyword: '근로장려금 신청 방법',
    category: '투자·재테크',
    contentType: 'procedure',
    title: '근로장려금 신청 서류와 문의처'
  });
  assert.equal(allowed.allowed, true);
});

test('울타리 게이트: FOCUS 카테고리 통과, 레거시 예외와 투자 거부', () => {
  assert.equal(evaluateFocusGate('이사·청소·주거').allowed, true);
  assert.equal(evaluateFocusGate('생활·정보').allowed, true);
  assert.equal(evaluateFocusGate('IT·테크').allowed, false); // 예외 미지정 시 거부
  assert.equal(evaluateFocusGate('IT·테크', { allowLegacySeries: true }).allowed, true);
  assert.equal(evaluateFocusGate('투자·재테크', { allowLegacySeries: true }).allowed, false);
});

// ─── 상업 의도 루브릭 (설계 §2: 25점) ───

test('상업 의도: 강한 상업어·서비스 명사 득점, 정보형 단어 감점', () => {
  const strong = scoreCommercialIntent('포장이사 비용 견적');
  assert.ok(strong.score >= 8, `강한 상업어 스코어: ${strong.score}`);
  const info = scoreCommercialIntent('ISA 뜻 정의');
  assert.ok(info.score < 0 || info.strongHits.length === 0);
});

// ─── 소주제 다양성 (생활 울타리 확장) ───

test('topicClusterOf: topicCluster 필드 우선, 없으면 비일반 태그', () => {
  assert.equal(topicClusterOf({ topicCluster: '타이어', tags: ['비용'], keyword: '타이어 교체 비용' }), '타이어');
  assert.equal(topicClusterOf({ tags: ['비용', '타이어'], keyword: '타이어 교체 비용' }), '타이어');
  assert.equal(topicClusterOf({ keyword: '샷시 교체 비용' }), '샷시');
});

test('topicDiversityFactor: 동일 소주제 반복 시 감쇠', () => {
  assert.equal(topicDiversityFactor('타이어', []), 1);
  assert.equal(topicDiversityFactor('타이어', ['타이어']), 0.55);
  assert.equal(topicDiversityFactor('타이어', ['타이어', '타이어']), 0.25);
  assert.equal(topicDiversityFactor('타이어', ['타이어', '타이어', '타이어']), 0.1);
  assert.equal(topicDiversityFactor('샷시', ['타이어']), 1);
});

test('applyTopicDiversity: 가중 25%로 base 점수 감쇠', () => {
  assert.equal(applyTopicDiversity(100, 1), 100);
  assert.equal(applyTopicDiversity(100, 0), 75); // 100 * (0.75 + 0)
  assert.equal(applyTopicDiversity(100, 0.55), 89); // 100 * (0.75 + 0.25*0.55) = 88.75 → 89
});

test('rerankWithBatchDiversity: 같은 소주제 연속 선정을 피한다', () => {
  const candidates = [
    cand({ id: 'a1', contentType: 'cost', topicCluster: '에어컨' }, 90),
    cand({ id: 'a2', contentType: 'cost', topicCluster: '에어컨' }, 88),
    cand({ id: 'b1', contentType: 'cost', topicCluster: '타이어' }, 80),
    cand({ id: 'c1', contentType: 'cost', topicCluster: '샷시' }, 78)
  ].map(c => ({
    ...c,
    topicCluster: c.kw.topicCluster,
    baseScore: c.selectionScore,
    selectionScore: c.selectionScore
  }));
  const ordered = rerankWithBatchDiversity(candidates, 3);
  const top3 = ordered.slice(0, 3).map(c => c.kw.id);
  // 1등은 에어컨 a1, 2등은 같은 에어컨 대신 타이어/샷시
  assert.equal(top3[0], 'a1');
  assert.ok(top3.includes('b1') || top3.includes('c1'));
  assert.ok(!(top3[0] === 'a1' && top3[1] === 'a2'), `연속 동일 클러스터: ${top3}`);
});
