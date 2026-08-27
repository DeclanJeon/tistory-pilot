#!/usr/bin/env node
/**
 * sources/google-trends.mjs — Google Trends KR adapter (설계 §3.1)
 *
 * 기존 trends-fetch.mjs 의 브라우저 렌더링 로직을 사용하되,
 * 파일 저장 없이 표준 source contract로 반환한다.
 *
 * 실패는 throw하지 않고 unavailable/rate_limited status로 반환한다.
 */
import { chromium } from 'playwright-core';
import { validateSourceResult } from './contract.mjs';
import { normalizeTitle } from '../../lib/published-posts.mjs';

const TRENDING_URL = 'https://trends.google.co.kr/trending?geo=KR&hours=24';
const DEFAULT_CDP = process.env.TRENDS_CDP_URL || 'http://127.0.0.1:9230';
const CHROMIUM_BIN = process.env.CHROMIUM_BIN || '/usr/bin/chromium-browser';

export function parseTraffic(text = '') {
  const cleaned = String(text || '').replace(/\s+/g, '');
  const m = cleaned.match(/(\d+(?:\.\d+)?)([만천])\+?/);
  if (!m) return null;
  const unit = m[2] === '만' ? 10000 : 1000;
  return Math.round(Number(m[1]) * unit);
}

async function connectBrowser({ cdp, launch = true, noLaunch = false } = {}) {
  try {
    const browser = await chromium.connectOverCDP(cdp, { timeout: 8000 });
    return { browser, context: browser.contexts()[0], close: false };
  } catch (error) {
    if (noLaunch) throw error;
    if (!launch) throw new Error(`CDP(${cdp}) 연결 실패 (--no-launch). (${error.message})`);
  }
  const browser = await chromium.launch({
    executablePath: CHROMIUM_BIN,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run']
  });
  return { browser, context: null, close: true };
}

async function extractRows(page) {
  return page.evaluate(() => {
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
}

export async function fetchGoogleTrends({ cdp = DEFAULT_CDP, launch = true, noLaunch = false, ttlSeconds = 24 * 60 * 60 } = {}) {
  let browser;
  try {
    const conn = await connectBrowser({ cdp, launch, noLaunch });
    browser = conn.browser;
    const page = conn.context ? await conn.context.newPage() : await conn.browser.newPage();
    try {
      await page.goto(TRENDING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      let rows = [];
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1500);
        rows = await extractRows(page);
        if (rows.length >= 5) break;
      }
      if (rows.length === 0) {
        const body = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 200)).catch(() => '');
        return validateSourceResult({
          source: 'google-trends',
          status: 'unavailable',
          items: [],
          error: `트렌드 행을 찾을 수 없다. body: ${body}`
        });
      }
      const items = rows.map((r, index) => ({
        raw: r.title,
        normalized: normalizeTitle(r.title),
        rank: index + 1,
        volume: parseTraffic(r.trafficText),
        volumeKind: 'range',
        url: TRENDING_URL
      }));
      return validateSourceResult({
        source: 'google-trends',
        status: 'ok',
        fetchedAt: new Date().toISOString(),
        ttlSeconds,
        items
      });
    } finally {
      await page.close().catch(() => {});
    }
  } catch (error) {
    return validateSourceResult({
      source: 'google-trends',
      status: 'error',
      items: [],
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}