#!/usr/bin/env node
import { chromium } from 'playwright-core';
import { ensureBrowserStarted } from './lib/agbrowse-cli.mjs';
import { loadProjectEnv } from './lib/load-env.mjs';
loadProjectEnv({ localEnvPath: '.env.local', fallbackEnvPaths: ['.env'] });

function parseIds(raw) {
  const out = [];
  for (const part of String(raw || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      const [from, to] = a <= b ? [a, b] : [b, a];
      for (let i = from; i <= to; i++) out.push(String(i));
    } else if (/^\d+$/.test(part)) out.push(part);
  }
  return [...new Set(out)];
}
function parseArgs(argv) {
  const args = { blogUrl: process.env.TISTORY_BLOG_URL || 'https://acstory.tistory.com', ids: '', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i], n = argv[i + 1];
    if (a === '--ids' && n) { args.ids = n; i++; }
    else if (a === '--blog-url' && n) { args.blogUrl = n; i++; }
    else if (a === '--dry-run') args.dryRun = true;
  }
  args.idList = parseIds(args.ids);
  return args;
}
async function connectPage() {
  ensureBrowserStarted({ headed: true });
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT || 9230}`, { timeout: 30000 });
  const context = browser.contexts()[0] || await browser.newContext();
  return { browser, page: await context.newPage() };
}
async function findPage(page, blogUrl, id) {
  const base = `${blogUrl.replace(/\/$/, '')}/manage/posts/`;
  for (let p = 1; p <= 12; p++) {
    await page.goto(p === 1 ? base : `${base}?page=${p}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    if (await page.evaluate(i => Boolean(document.getElementById(`inpCheck${i}`)), id)) return { ok: true, pageNo: p };
  }
  return { ok: false };
}
async function deleteOne(page, blogUrl, id, dryRun) {
  const found = await findPage(page, blogUrl, id);
  if (!found.ok) {
    await page.goto(`${blogUrl.replace(/\/$/, '')}/${id}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(600);
    const t = await page.locator('body').innerText().catch(() => '');
    const missing = /없거나|삭제|not found|존재하지|페이지를 찾을 수 없/i.test(t);
    return { ok: missing, postId: id, skipped: missing, reason: missing ? 'already-missing' : 'not-listed' };
  }
  // check item
  await page.evaluate(i => {
    const cb = document.getElementById(`inpCheck${i}`);
    if (cb && !cb.checked) cb.click();
  }, id);
  await page.waitForTimeout(300);
  if (dryRun) return { ok: true, postId: id, dryRun: true, pageNo: found.pageNo };

  // ── 2026 티스토리 글 관리 UI (08-20 실측) ──
  // "변경" 드롭다운(.layer_opt) 방식은 현재 UI에 없고, 행 hover 시 "수정/삭제/통계/공개"가
  // 나타난다. 삭제 클릭 시 window.confirm("선택한 글을 삭제하시겠습니까?")이 뜬다.
  let confirmAccepted = false;
  const onDialog = (dialog) => {
    const msg = String(dialog.message() || '');
    if (/삭제/.test(msg)) { confirmAccepted = true; dialog.accept(); }
    else dialog.dismiss();
  };
  page.on('dialog', onDialog);
  try {
    const row = page.locator(`li:has(#inpCheck${id})`).first();
    if (!(await row.count())) return { ok: false, postId: id, stage: 'row-not-found' };
    await row.hover();
    await page.waitForTimeout(500);
    const delBtn = row.locator('a, button').filter({ hasText: '삭제' }).first();
    if (!(await delBtn.count())) return { ok: false, postId: id, stage: 'delete-btn-not-found' };
    await delBtn.click();
    await page.waitForTimeout(2500);
    const still = await findPage(page, blogUrl, id);
    await page.goto(`${blogUrl.replace(/\/$/, '')}/${id}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(700);
    const publicText = await page.locator('body').innerText().catch(() => '');
    const publicMissing = /없거나|삭제|not found|존재하지|페이지를 찾을 수 없/i.test(publicText);
    return {
      ok: !still.ok || publicMissing,
      postId: id,
      pageNo: found.pageNo,
      confirmAccepted,
      deleted: !still.ok
    };
  } finally {
    page.off('dialog', onDialog);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.idList.length) throw new Error('--ids required');
  console.log(JSON.stringify({ blogUrl: args.blogUrl, ids: args.idList, dryRun: args.dryRun }, null, 2));
  const { browser, page } = await connectPage();
  const results = [];
  try {
    for (const id of args.idList) {
      console.log(`\n=== DELETE ${id}`);
      const r = await deleteOne(page, args.blogUrl, id, args.dryRun);
      results.push(r);
      console.log(JSON.stringify(r));
    }
  } finally {
    await page.close({ runBeforeUnload: false }).catch(() => {});
    await browser.close().catch(() => {});
  }
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  console.log(`\nDONE ok=${ok} fail=${fail}`);
  if (fail) process.exit(2);
}
main().catch(e => { console.error(e?.message || e); process.exit(1); });
