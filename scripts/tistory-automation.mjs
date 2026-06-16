#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import {
  browserStatus,
  ensureBrowserStarted,
  stopBrowser
} from './lib/agbrowse-cli.mjs';
import {
  mergeSourceIntoConfig,
  prepareSourceBundle
} from './lib/source-import.mjs';
import { loadProjectEnv } from './lib/load-env.mjs';

loadProjectEnv();

function parseSourceUrls(...values) {
  return values
    .flatMap(value => Array.isArray(value) ? value : [value])
    .flatMap(value => String(value || '').split(','))
    .map(value => value.trim())
    .filter(Boolean);
}

const DEFAULTS = {
  mode: 'draft',
  browserMode: process.env.TISTORY_HEADED === '1' ? 'headed' : 'headless',
  blogUrl: process.env.TISTORY_BLOG_URL || '',
  title: process.env.TISTORY_POST_TITLE || '',
  body: process.env.TISTORY_POST_BODY || '',
  bodyFile: process.env.TISTORY_POST_BODY_FILE || '',
  description: process.env.TISTORY_POST_DESCRIPTION || '',
  tags: process.env.TISTORY_POST_TAGS || '',
  category: process.env.TISTORY_POST_CATEGORY || '',
  heroImage: process.env.TISTORY_POST_HERO_IMAGE || '',
  qrImagePath: process.env.TISTORY_QR_IMAGE_PATH || 'tmp/kakao-tistory-qr.png',
  waitForLoginMs: Number(process.env.TISTORY_WAIT_FOR_LOGIN_MS || 300000),
  qrEmailTo: process.env.TISTORY_QR_EMAIL_TO || '',
  qrEmailOnRefresh: ['1', 'true', 'yes', 'on'].includes(String(process.env.TISTORY_QR_EMAIL_ON_REFRESH || '').toLowerCase()),
  qrEmailSubjectPrefix: process.env.TISTORY_QR_EMAIL_SUBJECT_PREFIX || '[Tistory QR]',
  sourceUrls: parseSourceUrls(process.env.TISTORY_SOURCE_URLS || '', process.env.TISTORY_SOURCE_URL || ''),
  sourceOutputDir: process.env.TISTORY_SOURCE_OUTPUT_DIR || 'tmp/source-imports',
  sourceImageLimit: Number(process.env.TISTORY_SOURCE_IMAGE_LIMIT || 3),
  sourceParagraphs: Number(process.env.TISTORY_SOURCE_PARAGRAPHS || 12),
  sourceImageEvery: Number(process.env.TISTORY_SOURCE_IMAGE_EVERY || 3),
  downloadSourceHero: process.env.TISTORY_DOWNLOAD_SOURCE_HERO !== '0'
};

const HELP = `티스토리 자동화 CLI

실행:
  npm run tistory
  npm run tistory:automation
  tistory-automation prompt
  tistory-automation publish --blog-url https://example.tistory.com --title "제목" --body "본문"
  tistory-automation source https://example.com/article
  tistory-automation source https://a.com/article https://b.com/article
  tistory-automation category ensure --blog-url https://acstory.tistory.com --category 시사 --headless

명령:
  prompt               질문형 마법사 실행 (기본값)
  draft                초안 입력만 실행
  publish              공개 발행 실행
  dry-run              실제 입력 없이 상태 점검
  source               기사/문서 URL에서 제목·본문·이미지 수집
  category ensure      카테고리 존재 보장(없으면 생성)
  browser start        agbrowse 브라우저 시작
  browser status       agbrowse 브라우저 상태 확인
  browser stop         agbrowse 브라우저 종료

주요 옵션:
  --interactive              명령형 실행에서도 질문형 입력 병행
  --headless                 headless + 카카오 QR 로그인 사용
  --headed                   눈에 보이는 브라우저 사용
  --blog-url URL             블로그 URL
  --title TEXT               글 제목
  --body TEXT                본문 직접 입력
  --body-file PATH           본문 파일 경로
  --body-stdin               표준입력 전체를 본문으로 읽기
  --description TEXT         설명
  --category TEXT            카테고리
  --tags TEXT                쉼표 구분 태그
  --hero-image PATH          대표 이미지 경로
  --qr-image-path PATH       QR 이미지 저장 경로
  --qr-email-to EMAIL        QR 이미지를 보낼 이메일 수신자
  --qr-email-on-refresh      QR 갱신 때도 이메일 재전송
  --no-qr-email-on-refresh   QR 갱신 메일 비활성화
  --wait-for-login-ms N      로그인 대기 시간(ms)
  --wait-for-login-sec N     로그인 대기 시간(초)
  --source-url URL           소스 기사 URL, 여러 번 반복 가능
  --source-output-dir DIR    수집 결과 저장 디렉터리
  --source-images N          본문에 넣을 소스 이미지 개수
  --source-paragraphs N      수집 본문 문단 수 제한
  --source-image-every N     몇 문단마다 이미지 삽입할지
  --download-source-hero     대표 이미지를 소스에서 다운로드
  --skip-download-source-hero 대표 이미지 다운로드 생략
  --yes                      질문형 실행의 마지막 확인 생략
  --help                     도움말 출력

예시:
  tistory-automation prompt
  tistory-automation publish --interactive --blog-url https://acstory.tistory.com
  tistory-automation dry-run --blog-url https://acstory.tistory.com --headless
  cat body.txt | tistory-automation draft --body-stdin --title "터미널 입력 예시" --blog-url https://acstory.tistory.com
  tistory-automation source https://openai.com/index/introducing-gpt-4o/
  tistory-automation draft --source-url https://a.com/post --source-url https://b.com/post --blog-url https://acstory.tistory.com --headless`;

function printHelp() {
  console.log(HELP);
}

function normalizeUrl(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  const url = new URL(value.startsWith('http') ? value : `https://${value}`);
  return `${url.protocol}//${url.host}`;
}

function resolveIfPresent(filePath) {
  const value = String(filePath || '').trim();
  return value ? path.resolve(value) : '';
}

function validateExistingFile(filePath, label) {
  const resolved = resolveIfPresent(filePath);
  if (!resolved) return '';
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} 파일을 찾을 수 없다: ${resolved}`);
  }
  return resolved;
}

function parseYes(choice, defaultValue = true) {
  const value = String(choice || '').trim().toLowerCase();
  if (!value) return defaultValue;
  if (['y', 'yes', '1', 'true'].includes(value)) return true;
  if (['n', 'no', '0', 'false'].includes(value)) return false;
  return defaultValue;
}

function parsePositiveInt(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const numeric = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function parseCli(argv) {
  const parsed = {
    command: 'prompt',
    browserAction: '',
    categoryAction: '',
    options: {
      mode: '',
      browserMode: '',
      interactive: false,
      skipConfirm: false,
      bodyFromStdin: false,
      blogUrl: '',
      title: '',
      body: '',
      bodyFile: '',
      description: '',
      category: '',
      tags: '',
      heroImage: '',
      qrImagePath: '',
      waitForLoginMs: null,
      qrEmailTo: '',
      qrEmailOnRefresh: null,
      qrEmailSubjectPrefix: '',
      sourceUrls: [],
      sourceOutputDir: '',
      sourceImageLimit: null,
      sourceParagraphs: null,
      sourceImageEvery: null,
      downloadSourceHero: null
    }
  };

  let index = 0;
  if (argv[0] && !argv[0].startsWith('-')) {
    parsed.command = argv[0];
    index = 1;
    if (parsed.command === 'browser' && argv[1] && !argv[1].startsWith('-')) {
      parsed.browserAction = argv[1];
      index = 2;
    }
    if (parsed.command === 'category' && argv[1] && !argv[1].startsWith('-')) {
      parsed.categoryAction = argv[1];
      index = 2;
    }
    if (parsed.command === 'source') {
      while (argv[index] && !argv[index].startsWith('-')) {
        parsed.options.sourceUrls.push(argv[index]);
        index += 1;
      }
    }
  }

  while (index < argv.length) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help') {
      parsed.command = 'help';
      index += 1;
    } else if (arg === '--interactive') {
      parsed.options.interactive = true;
      index += 1;
    } else if (arg === '--yes') {
      parsed.options.skipConfirm = true;
      index += 1;
    } else if (arg === '--headless') {
      parsed.options.browserMode = 'headless';
      index += 1;
    } else if (arg === '--headed') {
      parsed.options.browserMode = 'headed';
      index += 1;
    } else if (arg === '--mode' && next) {
      parsed.options.mode = next;
      index += 2;
    } else if (arg === '--blog-url' && next) {
      parsed.options.blogUrl = next;
      index += 2;
    } else if (arg === '--title' && next) {
      parsed.options.title = next;
      index += 2;
    } else if (arg === '--body' && next) {
      parsed.options.body = next;
      index += 2;
    } else if (arg === '--body-file' && next) {
      parsed.options.bodyFile = next;
      index += 2;
    } else if (arg === '--body-stdin') {
      parsed.options.bodyFromStdin = true;
      index += 1;
    } else if (arg === '--description' && next) {
      parsed.options.description = next;
      index += 2;
    } else if (arg === '--category' && next) {
      parsed.options.category = next;
      index += 2;
    } else if (arg === '--tags' && next) {
      parsed.options.tags = next;
      index += 2;
    } else if (arg === '--hero-image' && next) {
      parsed.options.heroImage = next;
      index += 2;
    } else if (arg === '--qr-image-path' && next) {
      parsed.options.qrImagePath = next;
      index += 2;
    } else if (arg === '--qr-email-to' && next) {
      parsed.options.qrEmailTo = next;
      index += 2;
    } else if (arg === '--qr-email-on-refresh') {
      parsed.options.qrEmailOnRefresh = true;
      index += 1;
    } else if (arg === '--no-qr-email-on-refresh') {
      parsed.options.qrEmailOnRefresh = false;
      index += 1;
    } else if (arg === '--wait-for-login-ms' && next) {
      parsed.options.waitForLoginMs = parsePositiveInt(next, DEFAULTS.waitForLoginMs);
      index += 2;
    } else if (arg === '--wait-for-login-sec' && next) {
      parsed.options.waitForLoginMs = parsePositiveInt(next, Math.floor(DEFAULTS.waitForLoginMs / 1000)) * 1000;
      index += 2;
    } else if (arg === '--source-url' && next) {
      parsed.options.sourceUrls.push(next);
      index += 2;
    } else if (arg === '--source-output-dir' && next) {
      parsed.options.sourceOutputDir = next;
      index += 2;
    } else if (arg === '--source-images' && next) {
      parsed.options.sourceImageLimit = parsePositiveInt(next, DEFAULTS.sourceImageLimit);
      index += 2;
    } else if (arg === '--source-paragraphs' && next) {
      parsed.options.sourceParagraphs = parsePositiveInt(next, DEFAULTS.sourceParagraphs);
      index += 2;
    } else if (arg === '--source-image-every' && next) {
      parsed.options.sourceImageEvery = parsePositiveInt(next, DEFAULTS.sourceImageEvery);
      index += 2;
    } else if (arg === '--download-source-hero') {
      parsed.options.downloadSourceHero = true;
      index += 1;
    } else if (arg === '--skip-download-source-hero') {
      parsed.options.downloadSourceHero = false;
      index += 1;
    } else {
      throw new Error(`알 수 없는 인자다: ${arg}`);
    }
  }

  parsed.options.sourceUrls = parseSourceUrls(parsed.options.sourceUrls);
  return parsed;
}

async function readBodyFromStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function askRequired(rl, label, current = '') {
  while (true) {
    const suffix = current ? ` [${current}]` : '';
    const answer = (await rl.question(`${label}${suffix}: `)).trim();
    const value = answer || current;
    if (value) return value;
    console.log('값이 필요하다.');
  }
}

async function askOptional(rl, label, current = '') {
  const suffix = current ? ` [${current}]` : '';
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || current || '';
}

async function askChoice(rl, label, options, defaultKey) {
  const menu = options.map(option => `  ${option.key}) ${option.label}`).join('\n');
  console.log(`${label}\n${menu}`);
  while (true) {
    const answer = (await rl.question(`선택 [${defaultKey}]: `)).trim() || defaultKey;
    const picked = options.find(option => option.key === answer);
    if (picked) return picked.value;
    console.log('올바른 번호를 입력해라.');
  }
}

async function askMultilineBody(rl, current = '') {
  const lines = [];
  console.log('본문을 붙여넣고 마지막 줄에 단독으로 . 을 입력해라.');
  if (current) {
    console.log('기본 본문이 있다. 그대로 쓰려면 바로 . 만 입력하면 된다.');
  }
  while (true) {
    const line = await rl.question('');
    if (line === '.') {
      if (lines.length === 0 && current) return current;
      const body = lines.join('\n').trim();
      if (body) return body;
      console.log('본문이 비어 있다. 다시 입력해라.');
      continue;
    }
    lines.push(line);
  }
}

function summarizeConfig(config, preparedSource = null) {
  console.log('\n실행 요약');
  console.log(`- 작업: ${config.mode}`);
  console.log(`- 브라우저: ${config.browserMode}`);
  console.log(`- 블로그: ${config.blogUrl}`);
  console.log(`- 제목: ${config.title || '(없음)'}`);
  console.log(`- 본문 입력: ${config.bodyFile || (config.body ? '직접 입력' : '(없음)')}`);
  console.log(`- 카테고리: ${config.category || '(없음)'}`);
  console.log(`- 태그: ${config.tags || '(없음)'}`);
  console.log(`- 대표 이미지: ${config.heroImage || '(없음)'}`);
  console.log(`- QR 경로: ${config.qrImagePath}`);
  console.log(`- QR 이메일: ${config.qrEmailTo || '(없음)'}`);
  console.log(`- QR 갱신 메일: ${config.qrEmailOnRefresh ? '전송' : '생략'}`);
  console.log(`- 로그인 대기: ${Math.floor(config.waitForLoginMs / 1000)}초`);
  console.log(`- 소스 URL: ${config.sourceUrls.length ? config.sourceUrls.join(', ') : '(없음)'}`);
  if (preparedSource) {
    console.log(`- 소스 개수: ${preparedSource.source.sourceCount || 1}`);
    console.log(`- 소스 본문 파일: ${preparedSource.paths.bodyPath}`);
    console.log(`- 소스 메타 파일: ${preparedSource.paths.jsonPath}`);
    console.log(`- 소스 대표 이미지: ${preparedSource.paths.heroImagePath || '(없음)'}`);
  }
}

function seedConfig(parsed) {
  return {
    mode: parsed.options.mode || (['draft', 'publish', 'dry-run'].includes(parsed.command) ? parsed.command : DEFAULTS.mode),
    browserMode: parsed.options.browserMode || DEFAULTS.browserMode,
    blogUrl: normalizeUrl(parsed.options.blogUrl || DEFAULTS.blogUrl || 'https://acstory.tistory.com'),
    title: parsed.options.title || DEFAULTS.title,
    body: parsed.options.body || DEFAULTS.body,
    bodyFile: parsed.options.bodyFile ? validateExistingFile(parsed.options.bodyFile, '본문') : validateExistingFile(DEFAULTS.bodyFile, '본문'),
    description: parsed.options.description || DEFAULTS.description,
    category: parsed.options.category || DEFAULTS.category,
    tags: parsed.options.tags || DEFAULTS.tags,
    heroImage: parsed.options.heroImage ? validateExistingFile(parsed.options.heroImage, '대표 이미지') : validateExistingFile(DEFAULTS.heroImage, '대표 이미지'),
    qrImagePath: resolveIfPresent(parsed.options.qrImagePath || DEFAULTS.qrImagePath),
    waitForLoginMs: parsed.options.waitForLoginMs ?? DEFAULTS.waitForLoginMs,
    qrEmailTo: parsed.options.qrEmailTo || DEFAULTS.qrEmailTo,
    qrEmailOnRefresh: parsed.options.qrEmailOnRefresh ?? DEFAULTS.qrEmailOnRefresh,
    qrEmailSubjectPrefix: parsed.options.qrEmailSubjectPrefix || DEFAULTS.qrEmailSubjectPrefix,
    sourceUrls: parsed.options.sourceUrls.length ? parsed.options.sourceUrls : DEFAULTS.sourceUrls,
    sourceOutputDir: resolveIfPresent(parsed.options.sourceOutputDir || DEFAULTS.sourceOutputDir),
    sourceImageLimit: parsed.options.sourceImageLimit ?? DEFAULTS.sourceImageLimit,
    sourceParagraphs: parsed.options.sourceParagraphs ?? DEFAULTS.sourceParagraphs,
    sourceImageEvery: parsed.options.sourceImageEvery ?? DEFAULTS.sourceImageEvery,
    downloadSourceHero: parsed.options.downloadSourceHero ?? DEFAULTS.downloadSourceHero
  };
}

async function collectConfig(seed, { skipConfirm = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('티스토리 자동화 CLI');
    console.log('질문에 답하면 글 작성/발행 명령을 실행한다.');

    const mode = await askChoice(rl, '작업 유형을 선택해라.', [
      { key: '1', label: '드라이런(실제 입력 없이 점검)', value: 'dry-run' },
      { key: '2', label: '초안 입력만', value: 'draft' },
      { key: '3', label: '공개 발행', value: 'publish' }
    ], seed.mode === 'dry-run' ? '1' : seed.mode === 'publish' ? '3' : '2');

    const browserMode = await askChoice(rl, '브라우저 실행 방식을 선택해라.', [
      { key: '1', label: 'headless + 카카오 QR 로그인', value: 'headless' },
      { key: '2', label: 'headed + 눈에 보이는 브라우저', value: 'headed' }
    ], seed.browserMode === 'headed' ? '2' : '1');

    const blogUrl = normalizeUrl(await askRequired(rl, '블로그 URL', seed.blogUrl));
    const sourceUrlInput = await askOptional(rl, '소스 URL(쉼표 구분, 선택)', seed.sourceUrls.join(', '));
    const sourceUrls = parseSourceUrls(sourceUrlInput);
    const sourceOutputDir = resolveIfPresent(await askOptional(rl, '소스 저장 디렉터리', seed.sourceOutputDir));

    let title = seed.title;
    let body = seed.body;
    let bodyFile = seed.bodyFile;

    if (mode !== 'dry-run') {
      title = await askOptional(rl, '제목(소스 URL이 있으면 비워도 됨)', seed.title);
      const inputMode = sourceUrls.length ? await askChoice(rl, '본문을 어디서 가져올지 선택해라.', [
        { key: '1', label: '소스 URL에서 자동 수집', value: 'source' },
        { key: '2', label: '터미널에 직접 붙여넣기', value: 'direct' },
        { key: '3', label: '본문 파일 경로 입력', value: 'file' }
      ], seed.bodyFile ? '3' : '1') : await askChoice(rl, '본문 입력 방식을 선택해라.', [
        { key: '2', label: '터미널에 직접 붙여넣기', value: 'direct' },
        { key: '3', label: '본문 파일 경로 입력', value: 'file' }
      ], seed.bodyFile ? '3' : '2');

      if (inputMode === 'file') {
        bodyFile = validateExistingFile(await askRequired(rl, '본문 파일 경로', seed.bodyFile), '본문');
        body = '';
      } else if (inputMode === 'direct') {
        body = await askMultilineBody(rl, seed.body);
        bodyFile = '';
      } else {
        body = '';
        bodyFile = '';
      }
    }

    const description = await askOptional(rl, '설명(선택)', seed.description);
    const category = await askOptional(rl, '카테고리(선택)', seed.category);
    const tags = await askOptional(rl, '태그(쉼표 구분, 선택)', seed.tags);
    const heroImage = validateExistingFile(await askOptional(rl, '대표 이미지 경로(선택)', seed.heroImage), '대표 이미지');
    const qrImagePath = resolveIfPresent(await askOptional(rl, 'QR 저장 경로', seed.qrImagePath));
    const qrEmailTo = await askOptional(rl, 'QR 이메일 수신자(선택)', seed.qrEmailTo);
    const qrRefreshEmailInput = await askOptional(rl, 'QR 갱신 때도 이메일 재전송할까? [y/N]', seed.qrEmailOnRefresh ? 'y' : 'n');
    const qrEmailOnRefresh = parseYes(qrRefreshEmailInput, seed.qrEmailOnRefresh);
    const waitSecondsInput = await askOptional(rl, '로그인 대기 시간(초)', String(Math.floor(seed.waitForLoginMs / 1000)));
    const waitForLoginMs = Math.max(1000, parsePositiveInt(waitSecondsInput, Math.floor(seed.waitForLoginMs / 1000)) * 1000);

    const config = {
      mode,
      browserMode,
      blogUrl,
      title,
      body,
      bodyFile,
      description,
      category,
      tags,
      heroImage,
      qrImagePath,
      waitForLoginMs,
      qrEmailTo,
      qrEmailOnRefresh,
      qrEmailSubjectPrefix: seed.qrEmailSubjectPrefix,
      sourceUrls,
      sourceOutputDir,
      sourceImageLimit: seed.sourceImageLimit,
      sourceParagraphs: seed.sourceParagraphs,
      sourceImageEvery: seed.sourceImageEvery,
      downloadSourceHero: seed.downloadSourceHero
    };

    summarizeConfig(config);
    if (skipConfirm) {
      return config;
    }

    const confirmed = parseYes(await rl.question('이 설정으로 실행할까? [Y/n]: '), true);
    if (!confirmed) {
      throw new Error('사용자가 실행을 취소했다.');
    }

    return config;
  } finally {
    rl.close();
  }
}

function validateMode(mode) {
  if (!['draft', 'publish', 'dry-run'].includes(mode)) {
    throw new Error(`지원하지 않는 작업 유형이다: ${mode}`);
  }
  return mode;
}

function validateBrowserMode(browserMode) {
  if (!['headless', 'headed'].includes(browserMode)) {
    throw new Error(`지원하지 않는 브라우저 방식이다: ${browserMode}`);
  }
  return browserMode;
}

async function prepareSourceForConfig(config) {
  if (!config.sourceUrls.length) {
    return { config, preparedSource: null };
  }

  const preparedSource = await prepareSourceBundle(config.sourceUrls, {
    outputDir: config.sourceOutputDir,
    imageLimit: config.sourceImageLimit,
    inlineImageLimit: config.sourceImageLimit,
    maxParagraphs: config.sourceParagraphs,
    maxParagraphsPerSource: Math.max(2, Math.ceil(config.sourceParagraphs / Math.max(1, config.sourceUrls.length))),
    imageEvery: config.sourceImageEvery,
    downloadHero: config.downloadSourceHero
  });

  const nextConfig = mergeSourceIntoConfig(config, preparedSource);
  return {
    config: nextConfig,
    preparedSource
  };
}

async function resolveCommandConfig(parsed) {
  const seed = seedConfig(parsed);

  if (parsed.options.body && parsed.options.bodyFile) {
    throw new Error('--body 와 --body-file 은 함께 쓸 수 없다.');
  }

  if (parsed.options.bodyFromStdin) {
    seed.body = await readBodyFromStdin();
    seed.bodyFile = '';
  }

  if (parsed.command === 'prompt' || parsed.options.interactive) {
    return collectConfig(seed, { skipConfirm: parsed.options.skipConfirm });
  }

  const mode = validateMode(seed.mode);
  const browserMode = validateBrowserMode(seed.browserMode);
  const config = {
    ...seed,
    mode,
    browserMode
  };

  if (mode !== 'dry-run') {
    if (!config.title && !config.sourceUrls.length) {
      throw new Error('제목이 필요하다. --title 을 주거나 --source-url 또는 --interactive 를 사용해라.');
    }
    if (!config.body && !config.bodyFile && !config.sourceUrls.length) {
      throw new Error('본문이 필요하다. --body, --body-file, --body-stdin, --source-url 중 하나를 사용해라.');
    }
  }

  return config;
}

function buildEnv(config) {
  const env = { ...process.env };
  env.TISTORY_BLOG_URL = config.blogUrl;
  env.TISTORY_POST_TITLE = config.title;
  env.TISTORY_POST_DESCRIPTION = config.description;
  env.TISTORY_POST_TAGS = config.tags;
  env.TISTORY_POST_CATEGORY = config.category;
  env.TISTORY_POST_HERO_IMAGE = config.heroImage;
  env.TISTORY_QR_IMAGE_PATH = config.qrImagePath;
  env.TISTORY_WAIT_FOR_LOGIN_MS = String(config.waitForLoginMs);
  env.TISTORY_QR_EMAIL_TO = config.qrEmailTo;
  env.TISTORY_QR_EMAIL_ON_REFRESH = config.qrEmailOnRefresh ? '1' : '0';
  env.TISTORY_QR_EMAIL_SUBJECT_PREFIX = config.qrEmailSubjectPrefix;
  env.TISTORY_SOURCE_URL = config.sourceUrls[0] || '';
  env.TISTORY_SOURCE_URLS = config.sourceUrls.join(',');
  env.TISTORY_SOURCE_OUTPUT_DIR = config.sourceOutputDir;
  delete env.TISTORY_POST_BODY;
  delete env.TISTORY_POST_BODY_FILE;
  if (config.bodyFile) {
    env.TISTORY_POST_BODY_FILE = config.bodyFile;
  } else if (config.body) {
    env.TISTORY_POST_BODY = config.body;
  }
  return env;
}

async function runAutomation(config, preparedSource = null) {
  summarizeConfig(config, preparedSource);
  const args = ['scripts/tistory-post.mjs'];
  if (config.mode === 'publish') args.push('--publish');
  if (config.mode === 'dry-run') args.push('--dry-run');
  args.push(config.browserMode === 'headed' ? '--headed' : '--headless');
  args.push('--blog-url', config.blogUrl);
  args.push('--qr-image-path', config.qrImagePath);
  args.push('--wait-for-login-ms', String(config.waitForLoginMs));
  if (config.title) args.push('--title', config.title);
  if (config.body && !config.bodyFile) args.push('--body', config.body);
  if (config.bodyFile) args.push('--body-file', config.bodyFile);
  if (config.description) args.push('--description', config.description);
  if (config.category) args.push('--category', config.category);
  if (config.tags) args.push('--tags', config.tags);
  if (config.heroImage) args.push('--hero-image', config.heroImage);

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: buildEnv(config),
    stdio: 'inherit'
  });

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => {
      if ((code ?? 0) === 0) {
        resolve(code ?? 0);
        return;
      }
      reject(new Error(`티스토리 자동화 실행이 종료 코드 ${code} 로 실패했다.`));
    });
  });
}

function handleBrowserCommand(action, parsed) {
  const browserMode = parsed.options.browserMode || 'headed';
  if (action === 'start') {
    const headed = browserMode !== 'headless';
    const result = ensureBrowserStarted({ headed });
    console.log(JSON.stringify({
      ok: true,
      action,
      headed,
      started: result.started
    }, null, 2));
    return;
  }

  if (action === 'status') {
    console.log(JSON.stringify(browserStatus(), null, 2));
    return;
  }

  if (action === 'stop') {
    const result = stopBrowser();
    console.log(JSON.stringify({
      ok: result.status === 0,
      action,
      output: result.combined
    }, null, 2));
    return;
  }

  throw new Error(`지원하지 않는 browser 명령이다: ${action || '(없음)'}`);
}

async function handleCategoryCommand(action, parsed) {
  if (action !== 'ensure') {
    throw new Error(`지원하지 않는 category 명령이다: ${action || '(없음)'}`);
  }

  const blogUrl = normalizeUrl(parsed.options.blogUrl || DEFAULTS.blogUrl || 'https://acstory.tistory.com');
  const category = parsed.options.category || DEFAULTS.category || '시사';
  const browserMode = validateBrowserMode(parsed.options.browserMode || DEFAULTS.browserMode);
  const qrImagePath = resolveIfPresent(parsed.options.qrImagePath || DEFAULTS.qrImagePath);
  const waitForLoginMs = parsed.options.waitForLoginMs ?? DEFAULTS.waitForLoginMs;
  const qrEmailTo = parsed.options.qrEmailTo || DEFAULTS.qrEmailTo;
  const qrEmailOnRefresh = parsed.options.qrEmailOnRefresh ?? DEFAULTS.qrEmailOnRefresh;
  const args = [
    'scripts/tistory-category.mjs',
    '--blog-url', blogUrl,
    '--category', category,
    '--qr-image-path', qrImagePath,
    '--wait-for-login-ms', String(waitForLoginMs),
    browserMode === 'headed' ? '--headed' : '--headless'
  ];
  if (qrEmailTo) args.push('--qr-email-to', qrEmailTo);
  if (qrEmailOnRefresh) args.push('--qr-email-on-refresh');

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      TISTORY_BLOG_URL: blogUrl,
      TISTORY_POST_CATEGORY: category,
      TISTORY_QR_IMAGE_PATH: qrImagePath,
      TISTORY_WAIT_FOR_LOGIN_MS: String(waitForLoginMs),
      TISTORY_QR_EMAIL_TO: qrEmailTo,
      TISTORY_QR_EMAIL_ON_REFRESH: qrEmailOnRefresh ? '1' : '0',
      TISTORY_QR_EMAIL_SUBJECT_PREFIX: DEFAULTS.qrEmailSubjectPrefix,
      TISTORY_HEADED: browserMode === 'headed' ? '1' : '0'
    }
  });

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => {
      if ((code ?? 0) === 0) {
        resolve(code ?? 0);
        return;
      }
      reject(new Error(`카테고리 보장 실행이 종료 코드 ${code} 로 실패했다.`));
    });
  });
}

async function handleSourceCommand(parsed) {
  const sourceUrls = parsed.options.sourceUrls.length ? parsed.options.sourceUrls : DEFAULTS.sourceUrls;
  if (!sourceUrls.length) {
    throw new Error('source 명령에는 URL이 필요하다. 예: tistory-automation source https://example.com/article https://example.com/another');
  }

  const preparedSource = await prepareSourceBundle(sourceUrls, {
    outputDir: resolveIfPresent(parsed.options.sourceOutputDir || DEFAULTS.sourceOutputDir),
    imageLimit: parsed.options.sourceImageLimit ?? DEFAULTS.sourceImageLimit,
    inlineImageLimit: parsed.options.sourceImageLimit ?? DEFAULTS.sourceImageLimit,
    maxParagraphs: parsed.options.sourceParagraphs ?? DEFAULTS.sourceParagraphs,
    maxParagraphsPerSource: Math.max(2, Math.ceil((parsed.options.sourceParagraphs ?? DEFAULTS.sourceParagraphs) / Math.max(1, sourceUrls.length))),
    imageEvery: parsed.options.sourceImageEvery ?? DEFAULTS.sourceImageEvery,
    downloadHero: parsed.options.downloadSourceHero ?? DEFAULTS.downloadSourceHero
  });

  console.log(JSON.stringify({
    ok: true,
    source: {
      url: preparedSource.source.url,
      title: preparedSource.source.title,
      description: preparedSource.source.description,
      siteName: preparedSource.source.siteName,
      imageCount: preparedSource.source.images.length,
      textLength: preparedSource.source.textLength,
      sourceCount: preparedSource.source.sourceCount || 1,
      urls: sourceUrls
    },
    paths: preparedSource.paths
  }, null, 2));
}

async function main() {
  const parsed = parseCli(process.argv.slice(2));

  if (parsed.command === 'help') {
    printHelp();
    return;
  }

  if (parsed.command === 'browser') {
    handleBrowserCommand(parsed.browserAction, parsed);
    return;
  }

  if (parsed.command === 'category') {
    await handleCategoryCommand(parsed.categoryAction, parsed);
    return;
  }

  if (parsed.command === 'source') {
    await handleSourceCommand(parsed);
    return;
  }

  if (!['prompt', 'draft', 'publish', 'dry-run'].includes(parsed.command)) {
    throw new Error(`지원하지 않는 명령이다: ${parsed.command}`);
  }

  const rawConfig = await resolveCommandConfig(parsed);
  const prepared = await prepareSourceForConfig(rawConfig);
  await runAutomation(prepared.config, prepared.preparedSource);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
