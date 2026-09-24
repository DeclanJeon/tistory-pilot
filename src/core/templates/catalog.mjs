const BASE_STYLE = 'font-size:16px;line-height:1.82;color:#1f2937;max-width:800px;margin:0 auto;';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TEMPLATE_DEFINITIONS = [
  {
    id: 'tech-deep-dive',
    label: '기술 심층 분석형',
    description: '매거진형 리드와 목차, 계층형 헤딩으로 복잡한 주제를 단계적으로 읽는 템플릿',
    layout: ['hero', 'lead', 'toc', 'sectioned-analysis', 'references'],
    prompt: '에디토리얼 매거진 구조를 사용한다. h1 다음에 문제-해결-근거를 압축한 리드 2개와 목차(nav)를 둔다. 본문은 원리, 작동 방식, 사례, 한계, 실전 적용의 5~7개 h2로 나누고 각 섹션에 핵심 문장과 근거를 배치한다. 마지막에는 참고 자료와 독자가 다음에 할 일을 둔다.'
  },
  {
    id: 'tutorial-guide',
    label: '튜토리얼/가이드형',
    description: '준비물, 단계별 실행, 체크리스트와 문제 해결을 한 흐름으로 보여 주는 템플릿',
    layout: ['hero', 'goal', 'prerequisites', 'steps', 'checklist', 'troubleshooting', 'references'],
    prompt: '실행 중심 가이드 구조를 사용한다. h1 뒤에 목표와 예상 결과를 짧게 제시하고 준비 조건을 정보 박스로 둔다. 1단계부터 5~7단계까지 번호가 보이는 h2와 ordered list를 사용하며, 완료 기준 체크리스트 표와 실패했을 때의 점검 순서를 포함한다. 독자가 글만 보고 재현할 수 있게 입력값, 주의점, 중단 기준을 구체적으로 쓴다.'
  },
  {
    id: 'news-briefing',
    label: '뉴스 브리핑형',
    description: '핵심 사실, 시간순 맥락, 영향과 확인할 출처를 빠르게 훑는 템플릿',
    layout: ['headline', 'dateline', 'fact-box', 'timeline', 'impact', 'faq', 'references'],
    prompt: '뉴스 브리핑 구조를 사용한다. h1 바로 아래에 기준일과 핵심 사실을 3개 이하의 짧은 항목으로 제시한다. 이어서 무엇이 바뀌었는지, 왜 중요한지, 시간순 배경, 독자에게 미치는 영향, 앞으로 확인할 신호를 5~7개 h2로 나눈다. 날짜·수치·발표 주체는 근처에 출처 링크를 붙이고 사실과 해석을 분리한다.'
  },
  {
    id: 'opinion-analysis',
    label: '의견/해설형',
    description: '명확한 논지, 비교 기준, 반론 검토와 조건부 결론을 강조하는 템플릿',
    layout: ['headline', 'thesis', 'criteria-table', 'evidence', 'counterargument', 'verdict', 'references'],
    prompt: '해설·판단 구조를 사용한다. h1 뒤에 결론의 조건과 핵심 논지를 blockquote로 명확히 밝힌다. 판단 기준을 먼저 정의하고 비교표와 근거를 제시한 뒤, 반대 관점과 한계를 공정하게 다룬다. 5~7개 h2를 사용하고 마지막에는 누구에게 어떤 선택이 맞는지 조건부 결론과 추가 확인 자료를 둔다.'
  },
  {
    id: 'curation-roundup',
    label: '큐레이션/라운드업형',
    description: '여러 선택지를 카드와 비교 기준으로 정리해 독자의 선택 비용을 줄이는 템플릿',
    layout: ['headline', 'selection-criteria', 'recommendation-cards', 'comparison-table', 'who-should-choose', 'faq', 'references'],
    prompt: '큐레이션·라운드업 구조를 사용한다. 선정 기준과 제외 기준을 먼저 밝힌다. 각 추천 항목은 h3 카드 안에서 대상, 적합한 독자, 장점, 주의점, 확인 링크를 같은 순서로 정리한다. 5~7개 h2, 비교표, 상황별 추천과 FAQ를 포함하되 단일 대상을 무조건 최고라고 단정하지 않는다.'
  }
];

export const TEMPLATE_CATALOG = Object.freeze(TEMPLATE_DEFINITIONS.map(template => Object.freeze(template)));

const TEMPLATE_RENDERERS = Object.freeze({
  'tech-deep-dive': context => {
    const keyword = escapeHtml(context.keyword || '주제');
    const description = escapeHtml(context.description || `${keyword}의 구조와 실제 적용 방법을 차근차근 살펴본다.`);
    return templateShell(context, `
<h1>${keyword} 기술 심층 분석</h1>
<p style="margin:0.8rem 0;">${description}</p>
<nav style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:1rem 1.2rem;margin:1.5rem 0;" aria-label="목차">
  <strong>목차</strong>
  <ol><li>핵심 개념</li><li>작동 방식</li><li>실전 적용</li><li>한계와 참고 자료</li></ol>
</nav>
<h2>📖 핵심 개념과 문제 정의</h2>
<p>독자가 먼저 확인할 용어와 문제의 범위를 정리한다. 실제 판단에 필요한 기준을 앞에서 정의하면 뒤의 설명을 빠르게 비교할 수 있다.</p>
<h2>⚙️ 작동 방식과 구조</h2>
<p>구성 요소가 어떤 순서로 연결되는지 설명한다. 단계 사이의 전제와 예외를 함께 적어 겉보기의 단순함 때문에 생기는 오해를 줄인다.</p>
<h2>🔎 사례로 보는 적용</h2>
<p>일반적인 사용 장면을 기준으로 입력, 과정, 결과를 나눠 살펴본다. 독자는 자신의 환경과 다른 조건을 이 부분에서 대조할 수 있다.</p>
<h2>⚖️ 장점과 한계</h2>
<p>얻는 이점뿐 아니라 비용, 유지 관리, 실패 가능성도 같은 비중으로 검토한다. 특정 선택을 단정하지 않고 조건별 차이를 남긴다.</p>
<h2>🧭 실전 적용 순서</h2>
<p>작은 범위에서 확인할 항목과 확대 전에 기록할 결과를 제시한다. 수치나 정책처럼 변할 수 있는 내용은 기준일과 출처를 확인한다.</p>
<h2>📚 참고 자료와 다음 단계</h2>
<p>공식 문서와 원문 자료를 우선 확인하고, 자신의 조건에 맞는 질문을 한 가지씩 좁혀 간다.</p>
${tagLine(context)}
`);
  },
  'tutorial-guide': context => {
    const keyword = escapeHtml(context.keyword || '주제');
    const description = escapeHtml(context.description || `${keyword}를 처음 시도하는 독자가 준비부터 점검까지 따라갈 수 있게 정리한다.`);
    return templateShell(context, `
<h1>${keyword} 단계별 실행 가이드</h1>
<p style="margin:0.8rem 0;">${description}</p>
<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:0.9rem 1.2rem;margin:1.2rem 0;border-radius:0 8px 8px 0;"><strong>목표:</strong> 시작 조건을 확인하고 작은 범위에서 결과를 검증한다.</div>
<h2>🧰 시작 전 준비 조건</h2>
<p>필요한 계정, 도구, 권한과 되돌릴 방법을 먼저 확인한다. 준비 조건이 맞지 않으면 다음 단계로 넘어가지 않는다.</p>
<h2>1️⃣ 첫 단계: 범위와 입력값 정하기</h2>
<ol><li>목표를 한 문장으로 적는다.</li><li>확인할 입력값과 완료 기준을 기록한다.</li></ol>
<h2>2️⃣ 둘째 단계: 기본 설정 적용하기</h2>
<p>설정값을 한 번에 많이 바꾸지 말고 핵심 한 가지씩 적용한다. 변경 전 상태를 남기면 문제가 생겼을 때 원인을 되돌릴 수 있다.</p>
<h2>3️⃣ 셋째 단계: 결과 검증하기</h2>
<p>예상 결과와 실제 결과를 비교한다. 화면, 로그, 문서 등 관찰 가능한 증거를 남겨 재현 가능성을 높인다.</p>
<h2>✅ 완료 체크리스트</h2>
<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="border:1px solid #e5e7eb;padding:8px;text-align:left;">확인 항목</th><th style="border:1px solid #e5e7eb;padding:8px;text-align:left;">완료 기준</th></tr></thead><tbody><tr><td style="border:1px solid #e5e7eb;padding:8px;">핵심 동작</td><td style="border:1px solid #e5e7eb;padding:8px;">의도한 결과와 일치</td></tr><tr><td style="border:1px solid #e5e7eb;padding:8px;">복구 방법</td><td style="border:1px solid #e5e7eb;padding:8px;">변경 전 상태로 되돌릴 수 있음</td></tr></tbody></table>
<h2>🛠️ 자주 막히는 지점과 점검</h2>
<p>결과가 다르면 입력값, 권한, 네트워크, 캐시 순서로 확인한다. 재시도하기 전에 실패 시각과 메시지를 기록하면 같은 문제를 반복하지 않는다.</p>
<h2>📌 마무리 점검</h2>
<p>작은 성공을 확인한 뒤 범위를 넓힌다. 비용·정책·보안 조건은 최신 공식 자료로 다시 확인한다.</p>
${tagLine(context)}
`);
  },
  'news-briefing': context => {
    const keyword = escapeHtml(context.keyword || '주제');
    const description = escapeHtml(context.description || `${keyword}와 관련해 확인된 사실과 앞으로 살펴볼 변화를 정리한다.`);
    return templateShell(context, `
<h1>${keyword} 최신 동향 브리핑</h1>
<p style="font-size:14px;color:#6b7280;">기준일: ${escapeHtml(context.today || '')}</p>
<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:0.9rem 1.2rem;margin:1.2rem 0;border-radius:0 8px 8px 0;"><strong>핵심 사실</strong><ul><li>무엇이 발표되었는지 확인한다.</li><li>변화가 적용되는 범위를 구분한다.</li><li>원문 출처와 기준일을 기록한다.</li></ul></div>
<h2>📰 무엇이 바뀌었나</h2>
<p>${description}</p>
<h2>🗓️ 시간순 배경</h2>
<p>발표, 적용, 후속 공지를 시간순으로 배열한다. 서로 다른 날짜의 수치와 상태를 한 문장에 섞지 않는다.</p>
<h2>🔍 확인된 사실과 해석</h2>
<p>공식 발표에서 직접 확인되는 내용과 작성자의 해석을 문단으로 분리한다. 확인되지 않은 전망은 사실처럼 표현하지 않는다.</p>
<h2>📊 독자에게 미치는 영향</h2>
<p>대상, 시점, 예외 조건에 따라 영향이 달라질 수 있다. 독자가 자신의 상황을 대조할 질문을 함께 제시한다.</p>
<h2>🔮 앞으로 확인할 신호</h2>
<p>추가 발표, 시행 일정, 수치 변화를 확인할 위치를 적는다. 변동 가능성이 있는 정보는 원문 링크를 다시 열어 검증한다.</p>
<h2>❓ 자주 묻는 확인 사항</h2>
<p>누가 영향을 받는지, 언제부터 적용되는지, 어디서 원문을 볼 수 있는지를 짧게 답한다.</p>
<h2>📎 원문 출처</h2>
<p>공식 발표와 1차 자료를 우선 확인하고 보도 내용은 원문과 대조한다.</p>
${tagLine(context)}
`);
  },
  'opinion-analysis': context => {
    const keyword = escapeHtml(context.keyword || '주제');
    const description = escapeHtml(context.description || `${keyword}를 판단할 때 필요한 기준과 서로 다른 관점을 함께 살펴본다.`);
    return templateShell(context, `
<h1>${keyword} 선택 기준과 해설</h1>
<blockquote style="border-left:3px solid #d1d5db;padding:0.8rem 1.2rem;margin:1.5rem 0;color:#4b5563;background:#f9fafb;">${description}</blockquote>
<h2>🎯 먼저 결론의 조건 정하기</h2>
<p>같은 대상도 목적, 예산, 시간과 위험 허용 범위에 따라 판단이 달라진다. 결론보다 조건을 먼저 적어 과도한 일반화를 피한다.</p>
<h2>📏 비교 기준 세우기</h2>
<p>가격, 편의성, 성능, 유지 비용처럼 비교 가능한 기준을 정의한다. 측정 방법이 다른 수치는 직접 순위를 매기지 않는다.</p>
<h2>📋 근거와 비교 결과</h2>
<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="border:1px solid #e5e7eb;padding:8px;">기준</th><th style="border:1px solid #e5e7eb;padding:8px;">확인할 질문</th></tr></thead><tbody><tr><td style="border:1px solid #e5e7eb;padding:8px;">적합성</td><td style="border:1px solid #e5e7eb;padding:8px;">내 조건에서 반복해 쓸 수 있는가?</td></tr><tr><td style="border:1px solid #e5e7eb;padding:8px;">비용</td><td style="border:1px solid #e5e7eb;padding:8px;">추가 비용과 변경 조건은 무엇인가?</td></tr></tbody></table>
<h2>🧩 반대 관점과 한계</h2>
<p>다른 결론이 나오는 조건을 함께 제시한다. 정보가 부족한 부분은 모른다고 밝히고, 추가로 확인할 자료를 구분한다.</p>
<h2>⚖️ 상황별 판단</h2>
<p>초보자, 반복 사용이 필요한 사람, 비용을 우선하는 사람처럼 조건별로 다른 선택이 합리적일 수 있다.</p>
<h2>🧭 조건부 결론</h2>
<p>현재 확인한 근거가 유효한 범위에서 판단을 마무리한다. 기준일 이후 바뀔 수 있는 항목은 공식 페이지에서 재확인한다.</p>
<h2>📚 추가 읽을 자료</h2>
<p>원문 데이터와 반대 관점을 함께 읽으면 결론의 적용 범위를 더 정확히 조정할 수 있다.</p>
${tagLine(context)}
`);
  },
  'curation-roundup': context => {
    const keyword = escapeHtml(context.keyword || '주제');
    const description = escapeHtml(context.description || `${keyword}를 고를 때 비교할 후보와 상황별 선택 기준을 한 번에 정리한다.`);
    return templateShell(context, `
<h1>${keyword} 추천 후보 라운드업</h1>
<p style="margin:0.8rem 0;">${description}</p>
<h2>🧪 선정 기준과 제외 기준</h2>
<p>비교 대상의 범위, 확인한 날짜, 포함·제외 기준을 먼저 밝힌다. 협찬이나 제휴가 있다면 판단에 영향을 줄 수 있는 관계를 명시한다.</p>
<h2>🏷️ 후보 1: 기본 조건을 우선하는 경우</h2>
<div style="border:1px solid #e5e7eb;border-radius:12px;padding:1rem;margin:1rem 0;"><h3>누구에게 맞는가</h3><p>복잡한 기능보다 시작 조건과 관리 편의성을 우선하는 독자에게 적합한지 확인한다.</p><p><strong>장점:</strong> 핵심 조건을 빠르게 비교할 수 있다.</p><p><strong>주의점:</strong> 사용량과 추가 비용을 별도로 확인한다.</p></div>
<h2>💡 후보 2: 기능과 확장성을 우선하는 경우</h2>
<div style="border:1px solid #e5e7eb;border-radius:12px;padding:1rem;margin:1rem 0;"><h3>비교할 질문</h3><p>현재 기능뿐 아니라 유지 관리, 호환성, 확장에 필요한 조건을 확인한다.</p><p><strong>장점:</strong> 활용 범위를 넓히기 쉽다.</p><p><strong>주의점:</strong> 초기 설정과 학습 비용이 커질 수 있다.</p></div>
<h2>📊 후보 비교표</h2>
<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="border:1px solid #e5e7eb;padding:8px;">상황</th><th style="border:1px solid #e5e7eb;padding:8px;">우선 기준</th><th style="border:1px solid #e5e7eb;padding:8px;">확인할 점</th></tr></thead><tbody><tr><td style="border:1px solid #e5e7eb;padding:8px;">처음 선택</td><td style="border:1px solid #e5e7eb;padding:8px;">시작 난이도</td><td style="border:1px solid #e5e7eb;padding:8px;">지원 문서와 환불 조건</td></tr><tr><td style="border:1px solid #e5e7eb;padding:8px;">반복 사용</td><td style="border:1px solid #e5e7eb;padding:8px;">총비용과 유지</td><td style="border:1px solid #e5e7eb;padding:8px;">추가 요금과 제한</td></tr></tbody></table>
<h2>👥 상황별 추천</h2>
<p>한 가지 대상을 모두에게 권하지 않고, 예산·시간·목표가 다른 독자별로 우선순위를 나눈다.</p>
<h2>❓ 구매 전 확인 질문</h2>
<p>최신 가격, 지원 범위, 해지·교환 조건, 공식 도움말을 확인한 뒤 자신의 조건에 맞는 후보를 좁힌다.</p>
<h2>🔗 참고 자료</h2>
<p>각 후보의 공식 페이지와 원문 자료를 직접 확인해 현재 정보인지 검증한다.</p>
${tagLine(context)}
`);
  }
});

function templateShell(context, body) {
  const templateId = escapeHtml(context.templateId || 'template');
  return `<div data-template-id="${templateId}" style="${BASE_STYLE}">\n${body.trim()}\n</div>`;
}

function tagLine(context) {
  const tags = (context.tags || []).slice(0, 5).map(tag => `#${String(tag).replace(/^#/, '').replace(/\s+/g, '')}`);
  return `<p style="margin:1.5rem 0 0.5rem;font-size:14px;color:#6b7280;">${escapeHtml(tags.join(' ') || `#${context.keyword || '정보'}`)}</p>`;
}

export function getTemplateCatalog() {
  return TEMPLATE_CATALOG;
}

export function getTemplateById(templateId) {
  return TEMPLATE_CATALOG.find(template => template.id === templateId) || null;
}

export function selectTemplate({ seed = '', templateId = '' } = {}) {
  const explicit = getTemplateById(String(templateId || '').trim());
  if (explicit) return explicit;
  let hash = 2166136261;
  for (const character of String(seed || 'default')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return TEMPLATE_CATALOG[(hash >>> 0) % TEMPLATE_CATALOG.length];
}

export function buildTemplatePrompt(templateId) {
  return getTemplateById(templateId)?.prompt || '';
}

export function renderTemplateFallback(context = {}) {
  const template = selectTemplate({ seed: context.templateSeed || context.id || context.keyword, templateId: context.templateId });
  const renderer = TEMPLATE_RENDERERS[template.id];
  if (!renderer) throw new Error(`지원하지 않는 템플릿: ${template.id}`);
  return renderer({ ...context, templateId: template.id, today: context.today || new Date().toISOString().slice(0, 10) });
}
