#!/usr/bin/env node
/**
 * trends-fetch.mjs — Google Trends 대한민국 인기 검색어 수집 (브라우저 렌더링 기반)
 *
 * Google Trends API는 봇 차단(404/비정상 트래픽)으로 직접 호출이 막혀 있어,
 * playwright + chromium으로 https://trends.google.co.kr/trending?geo=KR&hours=24
 * 페이지를 실제 렌더링한 뒤 테이블에서 트렌드(제목/검색량/증가율/경과시간)를 추출한다.
 *
 * 사용법:
 *   node scripts/content/trends-fetch.mjs [--date 2026-08-12] [--cdp http://127.0.0.1:9230] [--launch]
 *
 * 브라우저 우선순위:
 *   1) --cdp 로 지정한 CDP (기본 http://127.0.0.1:9230 — 워크벤치 브라우저)
 *   2) --launch 시 playwright가 시스템 chromium(/usr/bin/chromium-browser)을 직접 실행
 *
 * 출력: content/trends/<date>.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const TRENDS_DIR = path.join(PROJECT_ROOT, 'content', 'trends');
const TRENDING_URL = 'https://trends.google.co.kr/trending?geo=KR&hours=24';
const DEFAULT_CDP = process.env.TRENDS_CDP_URL || 'http://127.0.0.1:9230';
const CHROMIUM_BIN = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser';

function parseArgs(argv) {
  const args = { date: todayDate(), cdp: DEFAULT_CDP, launch: false, noLaunch: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i + 1]) args.date = argv[i + 1], i++;
    else if (argv[i] === '--cdp' && argv[i + 1]) args.cdp = argv[i + 1], i++;
    else if (argv[i] === '--launch') args.launch = true;
    else if (argv[i] === '--no-launch') args.noLaunch = true;
    else if (argv[i] === '--help') {
      console.log(`사용법: node trends-fetch.mjs [--date YYYY-MM-DD] [--cdp URL] [--launch]`);
      process.exit(0);
    }
  }
  return args;
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function connectBrowser(args) {
  // 1) CDP 우선 (워크벤치 브라우저가 떠 있으면 재사용)
  try {
    const browser = await chromium.connectOverCDP(args.cdp, { timeout: 8000 });
    console.log(`[trends] CDP 연결 성공: ${args.cdp}`);
    return { browser, context: browser.contexts()[0], close: false };
  } catch (error) {
    if (!args.launch) {
      // --no-launch 로 명시하지 않으면 headless chromium 직접 실행으로 폴백
      if (args.noLaunch) throw new Error(`CDP(${args.cdp}) 연결 실패 (--no-launch). (${error.message})`);
      console.log(`[trends] CDP(${args.cdp}) 없음 — headless chromium 직접 실행으로 폴백`);
    }
  }
  // 2) playwright 직접 실행 (headless)
  const browser = await chromium.launch({
    executablePath: CHROMIUM_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
  });
  console.log(`[trends] chromium 직접 실행 (headless): ${CHROMIUM_BIN}`);
  return { browser, context: null, close: true };
}

function parseTraffic(text = '') {
  const cleaned = String(text || '').replace(/\s+/g, '');
  const m = cleaned.match(/(\d+(?:\.\d+)?)([만천])\+?/);
  if (!m) return null;
  const unit = m[2] === '만' ? 10000 : 1000;
  return Math.round(Number(m[1]) * unit);
}

async function extractTrends(page) {
  // 테이블 행: [0]=빈 헤더, 이후 [제목][검색량+증가][경과시간][매체][...]
  const rows = await page.evaluate(() => {
    const out = [];
    const trs = Array.from(document.querySelectorAll('tbody tr'));
    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td.innerText || '').replace(/\s+/g, ' ').trim());
      const title = cells[1] || '';
      const trafficText = cells[2] || '';
      const timeText = cells[3] || '';
      const media = cells[4] || '';
      if (title && trafficText) {
        const increase = trafficText.match(/(\d+(?:,\d+)?)%/)?.[1]?.replace(',', '') || '';
        out.push({ title, trafficText, increase, timeText, media });
      }
    }
    return out;
  });
  return rows.map((r) => ({
    title: r.title,
    traffic: parseTraffic(r.trafficText),
    trafficText: r.trafficText,
    increasePct: r.increase ? Number(r.increase) : null,
    timeAgo: r.timeText,
    media: r.media
  }));
}

async function main() {
  const args = parseArgs(process.argv);
  const { browser, context, close } = await connectBrowser(args);
  const page = context ? await context.newPage() : await browser.newPage();
  try {
    console.log(`[trends] 페이지 로드: ${TRENDING_URL}`);
    await page.goto(TRENDING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // 테이블 렌더 대기
    let rows = [];
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1500);
      rows = await extractTrends(page);
      if (rows.length >= 5) break;
    }
    if (rows.length === 0) {
      const body = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 200)).catch(() => '');
      throw new Error(`트렌드 행을 찾을 수 없다. body: ${body}`);
    }
    const result = {
      fetchedAt: new Date().toISOString(),
      date: args.date,
      region: 'KR',
      sourceUrl: TRENDING_URL,
      trends: rows
    };
    await fs.mkdir(TRENDS_DIR, { recursive: true });
    const outPath = path.join(TRENDS_DIR, `${args.date}.json`);
    await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`[trends] ${rows.length}건 수집 → ${outPath}`);
    for (const t of rows.slice(0, 8)) {
      console.log(`  - ${t.title} | ${t.trafficText} | ${t.increasePct ?? ''}% | ${t.timeAgo}`);
    }
  } finally {
    await page.close().catch(() => {});
    // CDP 연결이든 자체 실행이든 브라우저 객체를 닫아 프로세스가 종료되게 한다.
    // connectOverCDP의 browser.close()는 실제 Chrome을 죽이지 않고 연결만 해제한다.
    await browser.close().catch(() => {});
  }
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('trends-fetch.mjs')) {
  main().catch((error) => {
    console.error(`[trends-fetch] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
