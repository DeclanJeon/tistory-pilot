#!/usr/bin/env node
/**
 * delete-tistory-posts.mjs — Tistory 글 삭제 (관리 목록 행의 삭제 버튼)
 *
 *   node scripts/delete-tistory-posts.mjs --ids 924-931
 */
import { chromium } from 'playwright-core';
import { ensureBrowserStarted } from './lib/agbrowse-cli.mjs';
import { loadProjectEnv } from './lib/load-env.mjs';

loadProjectEnv({ localEnvPath: '.env.local', fallbackEnvPaths: ['.env'] });

function parseIds(raw) {
  const out = [];
  for (const part of String(raw || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const [from, to] = a <= b ? [a, b] : [b, a];
      for (let i = from; i <= to; i += 1) out.push(String(i));
    } else if (/^\d+$/.test(part)) {
      out.push(part);
    }
  }
  return [...new Set(out)];
}

function parseArgs(argv) {
  const args = {
    blogUrl: process.env.TISTORY_BLOG_URL || 'https://acstory.tistory.com',
    ids: '',
    dryRun: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const n = argv[i + 1];
    if (a === '--ids' && n) { args.ids = n; i += 1; }
    else if (a === '--blog-url' && n) { args.blogUrl = n; i += 1; }
    else if (a === '--dry-run') args.dryRun = true;
  }
  args.idList = parseIds(args.ids);
  return args;
}

async function connectPage() {
  ensureBrowserStarted({ headed: true });
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT || 9230}`, { timeout: 30000 });
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  return { browser, page };
}

async function findListPage(page, blogUrl, postId) {
  const manageUrl = `${blogUrl.replace(/\/$/, '')}/manage/posts/`;
  for (let pageNo = 1; pageNo <= 12; pageNo += 1) {
    const url = pageNo === 1 ? manageUrl : `${manageUrl}?page=${pageNo}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(900);
    const found = await page.evaluate(id => Boolean(document.getElementById(`inpCheck${id}`)), postId);
    if (found) return { ok: true, pageNo, url };
  }
  return { ok: false };
}

async function verifyDeleted(page, blogUrl, postId) {
  // listed?
  let stillListed = false;
  const listed = await findListPage(page, blogUrl, postId);
  stillListed = listed.ok;

  await page.goto(`${blogUrl.replace(/\/$/, '')}/${postId}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
  const publicText = await page.locator('body').innerText().catch(() => '');
  const publicMissing = /없거나|삭제|not found|존재하지|페이지를 찾을 수 없/i.test(publicText);
  return { stillListed, publicMissing };
}

async function deleteOne(page, blogUrl, postId, dryRun) {
  const found = await findListPage(page, blogUrl, postId);
  if (!found.ok) {
    const v = await verifyDeleted(page, blogUrl, postId);
    return {
      ok: !v.stillListed,
      postId,
      skipped: !v.stillListed,
      reason: v.stillListed ? 'not-found-but-listed-unknown' : 'already-missing',
      verify: v
    };
  }

  const handle = page.locator(`#inpCheck${postId}`);
  await handle.scrollIntoViewIfNeeded().catch(() => {});
  const box = await handle.boundingBox();
  if (box) await page.mouse.move(box.x + 120, box.y + 8);
  await page.waitForTimeout(350);

  if (dryRun) {
    const text = await page.evaluate(id => {
      const cb = document.getElementById(`inpCheck${id}`);
      let n = cb;
      for (let i = 0; i < 6 && n; i += 1) {
        if (String(n.innerText || '').length > 20) break;
        n = n.parentElement;
      }
      return String(n?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    }, postId);
    return { ok: true, postId, dryRun: true, pageNo: found.pageNo, text };
  }

  const clicked = await page.evaluate(id => {
    const cb = document.getElementById(`inpCheck${id}`);
    if (!cb) return { ok: false, reason: 'checkbox-missing' };
    let root = cb;
    for (let i = 0; i < 10 && root; i += 1) {
      const anchors = Array.from(root.querySelectorAll('a.btn_post, a, button'));
      const del = anchors.find(el => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() === '삭제');
      if (del) {
        // force show hidden action bar
        let p = del.parentElement;
        for (let j = 0; j < 5 && p; j += 1) {
          if (p instanceof HTMLElement) {
            p.style.display = 'block';
            p.style.visibility = 'visible';
            p.style.opacity = '1';
          }
          p = p.parentElement;
        }
        if (del instanceof HTMLElement) {
          del.style.display = 'inline-block';
          del.style.visibility = 'visible';
        }
        del.click();
        return { ok: true };
      }
      root = root.parentElement;
    }
    return { ok: false, reason: 'row-delete-not-found' };
  }, postId);

  if (!clicked.ok) return { ok: false, postId, stage: 'click-delete', ...clicked };
  await page.waitForTimeout(700);

  let confirmed = await page.evaluate(() => {
    const normalize = v => String(v || '').replace(/\s+/g, ' ').trim();
    const visible = el => {
      if (!(el instanceof HTMLElement)) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const modal = document.querySelector('.ReactModal__Content, [role="dialog"], .modal, .layer_popup, .popup, .inner_confirm');
    const scope = modal
      ? Array.from(modal.querySelectorAll('button, a, [role="button"]')).filter(visible)
      : Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(visible);
    const confirm = scope.find(el => {
      const t = normalize(el.innerText || el.textContent || '');
      return t === '삭제' || t === '확인' || t === '영구 삭제' || t === '예' || t === 'Delete';
    });
    if (!confirm) {
      return { ok: false, texts: scope.map(e => normalize(e.innerText || e.textContent || '')).filter(Boolean).slice(0, 25) };
    }
    confirm.click();
    return { ok: true, text: normalize(confirm.innerText || confirm.textContent || '') };
  });

  if (!confirmed.ok) {
    const btn = page.getByRole('button', { name: /삭제|확인|Delete|예/ });
    if (await btn.count()) {
      await btn.last().click();
      confirmed = { ok: true, text: 'role-button' };
    }
  }
  if (!confirmed.ok) return { ok: false, postId, stage: 'confirm', confirmed };

  await page.waitForTimeout(1800);
  const verify = await verifyDeleted(page, blogUrl, postId);
  return {
    ok: !verify.stillListed || verify.publicMissing,
    postId,
    confirmText: confirmed.text || null,
    verify
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.idList.length) throw new Error('--ids required (e.g. 924-931)');
  console.log(JSON.stringify({ blogUrl: args.blogUrl, ids: args.idList, dryRun: args.dryRun }, null, 2));

  const { browser, page } = await connectPage();
  const results = [];
  try {
    for (const id of args.idList) {
      console.log(`\n=== DELETE ${id}`);
      const result = await deleteOne(page, args.blogUrl, id, args.dryRun);
      results.push(result);
      console.log(JSON.stringify(result));
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

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
