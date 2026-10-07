#!/usr/bin/env node
import { chromium } from 'playwright-core';
import { ensureBrowserStarted } from '/srv/publish-workbench/app/scripts/lib/agbrowse-cli.mjs';

const IDS = ['925', '926', '927', '928', '929', '930', '931'];
const BLOG = 'https://acstory.tistory.com';

async function connectPage() {
  ensureBrowserStarted({ headed: true });
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9230', { timeout: 30000 });
  const context = browser.contexts()[0] || await browser.newContext();
  return { browser, page: await context.newPage() };
}

async function setPrivate(page, postId) {
  const url = `${BLOG}/manage/newpost/${postId}?type=post`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  // Click publish layer button (완료)
  const layerBtn = page.locator('#publish-layer-btn');
  if (!(await layerBtn.count())) {
    return { ok: false, reason: 'publish-layer-btn-not-found' };
  }
  await layerBtn.click({ force: true });
  await page.waitForTimeout(2000);

  // Click 비공개 in the publish layer
  const clicked = await page.evaluate(() => {
    const normalize = v => String(v || '').replace(/\s+/g, ' ').trim();
    const visible = el => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const els = Array.from(document.querySelectorAll('label, a, button, span, div, input')).filter(visible);
    const priv = els.find(el => normalize(el.value || el.innerText || el.textContent || '') === '비공개');
    if (priv) {
      priv.click();
      return { ok: true };
    }
    return { ok: false, reason: '비공개-element-not-found' };
  });
  if (!clicked.ok) return clicked;
  await page.waitForTimeout(1000);

  // Click 비공개 저장 (save button)
  const saveResult = await page.evaluate(() => {
    const normalize = v => String(v || '').replace(/\s+/g, ' ').trim();
    const visible = el => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const btns = Array.from(document.querySelectorAll('button, a, input[type=button]')).filter(visible);
    const saveBtn = btns.find(b => normalize(b.value || b.innerText || '') === '비공개 저장' || normalize(b.value || b.innerText || '') === '저장');
    if (saveBtn) { saveBtn.click(); return { ok: true, text: normalize(saveBtn.value || saveBtn.innerText || '') }; }
    const pubBtn = document.getElementById('publish-btn');
    if (pubBtn && visible(pubBtn)) { pubBtn.click(); return { ok: true, text: normalize(pubBtn.innerText || ''), fallback: true }; }
    return { ok: false, reason: 'save-button-not-found' };
  });
  await page.waitForTimeout(4000);
  return saveResult;
}

async function main() {
  const { browser, page } = await connectPage();
  const results = [];
  try {
    for (const id of IDS) {
      console.log(`\n=== SET PRIVATE ${id}`);
      try {
        const r = await setPrivate(page, id);
        results.push({ id, ...r });
        console.log(JSON.stringify(r));
      } catch (e) {
        results.push({ id, ok: false, error: e?.message || String(e) });
        console.error(JSON.stringify(results.at(-1)));
      }
    }
    // Verify via API
    await page.goto(`${BLOG}/manage/posts/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const check = await page.evaluate(async (ids) => {
      const all = [];
      for (let p = 1; p <= 8; p++) {
        const r = await fetch(`/manage/posts.json?category=-3&page=${p}&searchKeyword=&searchType=title&visibility=all`, { credentials: 'include' });
        const data = await r.json();
        all.push(...(data.items || []));
        if (all.length >= data.totalCount) break;
      }
      return ids.map(id => {
        const post = all.find(x => String(x.id) === String(id));
        return { id, vis: post?.visibility || 'NOT_FOUND', title: (post?.title || '').slice(0, 40) };
      });
    }, IDS);
    console.log('\n=== VERIFICATION ===');
    for (const c of check) {
      console.log(`${c.id}: ${c.vis} | ${c.title}`);
    }
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(e => { console.error(e?.message || String(e)); process.exit(1); });
