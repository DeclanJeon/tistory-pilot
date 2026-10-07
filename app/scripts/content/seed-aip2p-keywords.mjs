#!/usr/bin/env node
// seed-aip2p-keywords.mjs — AI·P2P 트랙 시드 (idempotent)
// 1) focusCategories에 'AI·P2P' 추가  2) 크립토 노이즈 뉴스 비활성화
// 3) AI·P2P 가이드 키워드 ~90건 추가 (기존 id와 겹치면 건너뜀)
import fs from 'node:fs/promises';

const KEYWORDS_PATH = '/srv/publish-workbench/app/content/keywords/keywords.json';
const TRACK = 'AI·P2P';
const CRYPTO_NOISE_RE = /비트코인|이더리움|USDT|USDC|시세|거래소|호가|상장|출금|입금|매수|매도|디지털자산|가상자산|암호화폐|시가총액|도미넌스|코인/;

// [keyword, contentType, tags, topicCluster]
const SEEDS = [
  // ── AI 도구·활용 (30) ─────────────────────────────────────────────
  ['AI 프롬프트 엔지니어링 입문', 'tech', ['AI', '프롬프트', '생성형AI'], 'AI 도구'],
  ['Claude 프로젝트 기능 사용법', 'info', ['Claude', 'AI', '프로젝트'], 'AI 도구'],
  ['ChatGPT 브라우저 확장 활용', 'info', ['ChatGPT', '확장', 'AI'], 'AI 도구'],
  ['AI 검색 엔진 비교 사용법', 'info', ['AI', '검색', '비교'], 'AI 도구'],
  ['AI 요약 도구 비교', 'info', ['AI', '요약', '추천'], 'AI 도구'],
  ['AI 음성 입력 설정법', 'info', ['AI', '음성', '설정'], 'AI 도구'],
  ['AI 번역 정확도 높이는 법', 'info', ['AI', '번역', '프롬프트'], 'AI 도구'],
  ['AI 이미지 생성 프롬프트 예시', 'info', ['AI', '이미지', '프롬프트'], 'AI 미디어'],
  ['AI 썸네일 만드는 법', 'info', ['AI', '썸네일', '디자인'], 'AI 미디어'],
  ['AI 영상 자동 자막 만들기', 'info', ['AI', '영상', '자막'], 'AI 미디어'],
  ['AI 텍스트 음성 변환 사용법', 'tech', ['AI', 'TTS', '음성'], 'AI 미디어'],
  ['AI 이메일 답장 초안 만들기', 'info', ['AI', '이메일', '업무'], 'AI 업무'],
  ['AI 회의록 요약 사용법', 'info', ['AI', '회의록', '요약'], 'AI 업무'],
  ['AI 스프레드시트 분석 연결', 'tech', ['AI', '스프레드시트', '데이터'], 'AI 업무'],
  ['AI 프레젠테이션 초안 만들기', 'info', ['AI', 'PPT', '업무'], 'AI 업무'],
  ['로컬 LLM 실행 가이드', 'tech', ['로컬LLM', 'Ollama', 'AI'], 'AI 인프라'],
  ['AI 모델 용량과 사양 확인', 'tech', ['AI모델', '사양', '하드웨어'], 'AI 인프라'],
  ['AI 프롬프트 저장 관리 방법', 'info', ['AI', '프롬프트', '관리'], 'AI 도구'],
  ['AI 멀티모달 기능 이해하기', 'tech', ['AI', '멀티모달', '생성형AI'], 'AI 인프라'],
  ['AI 토큰 사용량 확인 방법', 'tech', ['AI', '토큰', 'API'], 'AI 인프라'],
  ['AI API 키 발급 절차', 'info', ['API', 'AI', '개발'], 'AI 인프라'],
  ['AI 딥페이크 영상 구별법', 'info', ['AI', '보안', '딥페이크'], 'AI 보안'],
  ['AI 생성물 표기 기준', 'info', ['AI', '저작권', '표기'], 'AI 보안'],
  ['AI 챗봇 비교 사용법', 'info', ['AI', '챗봇', '비교'], 'AI 도구'],
  ['AI 브라우저 확장 프로그램 추천', 'info', ['AI', '확장', '추천'], 'AI 도구'],
  ['AI 모바일 앱 활용법', 'info', ['AI', '모바일', '앱'], 'AI 도구'],
  ['AI 오프라인 사용 환경 만들기', 'tech', ['AI', '오프라인', '로컬'], 'AI 인프라'],
  ['AI 워터마크와 저작권 이해', 'info', ['AI', '워터마크', '저작권'], 'AI 보안'],
  ['AI 계정 보안 설정 점검', 'info', ['AI', '보안', '계정'], 'AI 보안'],
  ['AI 업데이트 확인하는 법', 'info', ['AI', '업데이트', '뉴스'], 'AI 도구'],
  // ── AI 에이전트·자동화 (15) ───────────────────────────────────────
  ['AI 에이전트란 무엇인가', 'tech', ['AI에이전트', '자동화', '개념'], 'AI 자동화'],
  ['AI 에이전트 만들기 입문', 'tech', ['AI에이전트', '개발', '자동화'], 'AI 자동화'],
  ['노코드 AI 자동화 도구 비교', 'info', ['노코드', '자동화', 'AI'], 'AI 자동화'],
  ['AI로 일일 업무 자동화하기', 'info', ['자동화', '업무', 'AI'], 'AI 자동화'],
  ['AI 워크플로우 설계 방법', 'info', ['워크플로우', '자동화', 'AI'], 'AI 자동화'],
  ['AI 캘린더 연동 자동화', 'info', ['캘린더', '자동화', 'AI'], 'AI 자동화'],
  ['AI 알림 봇 만들기', 'tech', ['봇', '자동화', 'AI'], 'AI 자동화'],
  ['AI 뉴스 요약 자동화', 'info', ['뉴스', '요약', '자동화'], 'AI 자동화'],
  ['MCP 서버란 무엇인가', 'tech', ['MCP', 'AI', '프로토콜'], 'AI 자동화'],
  ['MCP 클라이언트 연결 방법', 'tech', ['MCP', 'AI', '연결'], 'AI 자동화'],
  ['AI 함수 호출 이해하기', 'tech', ['함수호출', 'API', 'AI'], 'AI 자동화'],
  ['AI 도구 연결 API 활용', 'tech', ['API', '연동', 'AI'], 'AI 자동화'],
  ['AI 반복 작업 위임 방법', 'info', ['자동화', '업무효율', 'AI'], 'AI 자동화'],
  ['AI 자동화 보안 점검 체크리스트', 'info', ['보안', '자동화', '체크리스트'], 'AI 보안'],
  ['AI 자동화 실패 대처법', 'info', ['자동화', '문제해결', 'AI'], 'AI 자동화'],
  // ── AI 코딩·개발 (15) ────────────────────────────────────────────
  ['AI 코드 자동완성 설정법', 'tech', ['AI', '코드자동완성', '개발'], 'AI 개발'],
  ['AI 코드 리뷰 받는 법', 'tech', ['AI', '코드리뷰', '개발'], 'AI 개발'],
  ['AI 테스트 코드 생성 사용법', 'tech', ['AI', '테스트', '개발'], 'AI 개발'],
  ['AI 오류 메시지 분석 활용', 'tech', ['AI', '오류', '디버깅'], 'AI 개발'],
  ['AI SQL 쿼리 생성 활용', 'tech', ['AI', 'SQL', '데이터'], 'AI 개발'],
  ['AI 정규식 만들기 활용', 'tech', ['AI', '정규식', '개발'], 'AI 개발'],
  ['AI 코드 주석 자동 작성', 'tech', ['AI', '주석', '개발'], 'AI 개발'],
  ['AI 리팩토링 제안 활용법', 'tech', ['AI', '리팩토링', '코드'], 'AI 개발'],
  ['AI 개발 환경 구성 가이드', 'tech', ['AI', '개발환경', '설정'], 'AI 개발'],
  ['AI 코드 설명 받는 법', 'tech', ['AI', '코드학습', '개발'], 'AI 개발'],
  ['AI 빌드 오류 해결 활용', 'tech', ['AI', '빌드', '오류'], 'AI 개발'],
  ['AI API 문서 요약 활용', 'tech', ['AI', '문서', 'API'], 'AI 개발'],
  ['AI README 자동 작성', 'tech', ['AI', '문서', '오픈소스'], 'AI 개발'],
  ['AI 코딩 면접 대비 활용', 'info', ['AI', '코딩면접', '준비'], 'AI 개발'],
  ['AI 페어 프로그래밍 사용법', 'info', ['AI', '페어프로그래밍', '개발'], 'AI 개발'],
  // ── P2P 기술·네트워크 (15) ───────────────────────────────────────
  ['P2P 파일전송 원리 이해하기', 'tech', ['P2P', '파일전송', '네트워크'], 'P2P 파일전송'],
  ['토렌트 시드 관리 방법', 'info', ['토렌트', 'P2P', '시딩'], 'P2P 파일전송'],
  ['P2P 메신저 추천 비교', 'info', ['P2P', '메신저', '추천'], 'P2P 네트워크'],
  ['웹RTC P2P 화상회의 원리', 'tech', ['웹RTC', 'P2P', '화상회의'], 'P2P 네트워크'],
  ['P2P 네트워크 NAT 이해하기', 'tech', ['P2P', 'NAT', '네트워크'], 'P2P 네트워크'],
  ['P2P DNS 대체 기술 알아보기', 'tech', ['P2P', 'DNS', '탈중앙'], 'P2P 네트워크'],
  ['P2P 메시 시스템 구성 방법', 'tech', ['P2P', '메시', '네트워크'], 'P2P 네트워크'],
  ['P2P 네트워크 보안 위험과 대처', 'info', ['P2P', '보안', '위험'], 'P2P 보안'],
  ['P2P 대역폭 최적화 방법', 'tech', ['P2P', '대역폭', '최적화'], 'P2P 네트워크'],
  ['P2P 오프라인 파일 공유 방법', 'info', ['P2P', '파일공유', '오프라인'], 'P2P 파일전송'],
  ['P2P 분산 해시 테이블 이해', 'tech', ['P2P', 'DHT', '분산'], 'P2P 네트워크'],
  ['P2P 노드 참여 절차', 'info', ['P2P', '노드', '참여'], 'P2P 네트워크'],
  ['P2P 네트워크 디도스 방어', 'info', ['P2P', '보안', '디도스'], 'P2P 보안'],
  ['P2P 파일 동기화 충돌 해결', 'info', ['P2P', '동기화', '문제해결'], 'P2P 파일전송'],
  ['P2P 프로토콜 비교 분석', 'tech', ['P2P', '프로토콜', '비교'], 'P2P 네트워크'],
  // ── 탈중앙화·Web3 P2P 컴퓨팅 (15) ────────────────────────────────
  ['탈중앙화 AI 개념 이해하기', 'tech', ['탈중앙화', 'AI', '개념'], '탈중앙 컴퓨팅'],
  ['분산 AI 학습 프로젝트 알아보기', 'tech', ['분산AI', '학습', '프로젝트'], '탈중앙 컴퓨팅'],
  ['P2P 컴퓨팅 자원 공유 개념', 'tech', ['P2P', '컴퓨팅', '자원공유'], '탈중앙 컴퓨팅'],
  ['탈중앙 스토리지 서비스 비교', 'info', ['탈중앙', '스토리지', '비교'], '탈중앙 스토리지'],
  ['IPFS 기본 사용법', 'info', ['IPFS', '탈중앙', '스토리지'], '탈중앙 스토리지'],
  ['P2P CDN 개념과 활용', 'tech', ['P2P', 'CDN', '배포'], '탈중앙 컴퓨팅'],
  ['블록체인 노드 운영 입문', 'tech', ['블록체인', '노드', '운영'], '탈중앙 컴퓨팅'],
  ['탈중앙화 앱 사용법', 'info', ['탈중앙화', 'dApp', '사용법'], '탈중앙 컴퓨팅'],
  ['Web3 브라우저 확장 활용', 'info', ['Web3', '브라우저', '확장'], '탈중앙 컴퓨팅'],
  ['분산 컴퓨팅 프로젝트 참여', 'info', ['분산컴퓨팅', '프로젝트', '참여'], '탈중앙 컴퓨팅'],
  ['P2P AI 추론 네트워크 알아보기', 'tech', ['P2P', 'AI추론', '네트워크'], '탈중앙 컴퓨팅'],
  ['오픈소스 AI 모델 공유 생태계', 'info', ['오픈소스', 'AI모델', '공유'], '탈중앙 컴퓨팅'],
  ['분산 원장 기술 기본 개념', 'tech', ['분산원장', '블록체인', '개념'], '탈중앙 컴퓨팅'],
  ['P2P 네트워크 참여자 역할', 'info', ['P2P', '참여자', '역할'], 'P2P 네트워크'],
  ['탈중앙 검색 엔진 알아보기', 'info', ['탈중앙', '검색', '엔진'], '탈중앙 컴퓨팅'],
];

const data = JSON.parse(await fs.readFile(KEYWORDS_PATH, 'utf8'));

// 1) focusCategories
if (!Array.isArray(data.focusCategories)) data.focusCategories = [];
const focusBefore = data.focusCategories.length;
if (!data.focusCategories.includes(TRACK)) data.focusCategories.push(TRACK);

// 2) 크립토 노이즈 뉴스 비활성화
let disabled = 0;
const disabledIds = [];
for (const k of data.keywords || []) {
  if (k.news && k.enabled !== false && CRYPTO_NOISE_RE.test(String(k.keyword || ''))) {
    k.enabled = false;
    disabled++;
    disabledIds.push(k.id);
  }
}

// 3) 시드 추가 (idempotent)
const existingIds = new Set((data.keywords || []).map(k => k.id));
let added = 0;
const skipped = [];
for (let i = 0; i < SEEDS.length; i++) {
  const [keyword, contentType, tags, topicCluster] = SEEDS[i];
  const id = `aip2p-${String(i + 1).padStart(2, '0')}`;
  if (existingIds.has(id)) { skipped.push(id); continue; }
  existingIds.add(id);
  data.keywords.push({
    id,
    keyword,
    category: TRACK,
    contentType,
    metrics: {
      monthlySearch: 500 + (i % 8) * 700,
      cpcKrw: 150 + (i % 5) * 100,
      source: 'estimate',
      checkedAt: '2026-09-27'
    },
    tags,
    description: `${keyword} — 핵심 개념과 실제 활용 방법을 단계별로 정리`,
    score: { intent: 3 + (i % 4), bid: 2, volume: 3, gap: 0, source: 6, durability: 7, total: 48 },
    gap: { total: 0, rawTotal: 0 },
    ymylRisk: 'none',
    commercialIntent: 3,
    enabled: true,
    ymylDomain: '',
    topicCluster
  });
  added++;
}

data.updatedAt = new Date().toISOString().slice(0, 10);
await fs.writeFile(KEYWORDS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');

const aip2pCount = data.keywords.filter(k => k.category === TRACK).length;
console.log(`[seed] focusCategories: ${focusBefore} -> ${data.focusCategories.length} (has AI·P2P=${data.focusCategories.includes(TRACK)})`);
console.log(`[seed] crypto news disabled: ${disabled} (${disabledIds.join(', ') || '-'})`);
console.log(`[seed] seeds added: ${added}, skipped-existing: ${skipped.length}`);
console.log(`[seed] AI·P2P keywords: ${aip2pCount}, total: ${data.keywords.length}`);
