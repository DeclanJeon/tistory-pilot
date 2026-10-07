import { chromium } from 'playwright-core';
import { ensureBrowserStarted } from './lib/agbrowse-cli.mjs';

ensureBrowserStarted({ headed: true });
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT || 9230}`, { timeout: 30000 });
const context = browser.contexts()[0] || await browser.newContext();
const page = await context.newPage();
await page.goto('https://acstory.tistory.com/manage/posts/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1500);

const postsJson = await page.evaluate(async () => {
  const r = await fetch('/manage/posts.json?category=-3&page=1&searchKeyword=&searchType=title&visibility=all', { credentials: 'include' });
  const t = await r.text();
  return { status: r.status, body: t.slice(0, 800) };
});
console.log('postsJson', postsJson);

const scriptSrcs = await page.evaluate(() => Array.from(document.scripts).map(s => s.src).filter(Boolean));
console.log('scripts', scriptSrcs.slice(0, 20));

for (const u of scriptSrcs.filter(s => /manage|admin|tistory/i.test(s)).slice(0, 5)) {
  try {
    const txt = await page.evaluate(async url => {
      const r = await fetch(url, { credentials: 'include' });
      return r.text();
    }, u);
    const deleteHits = txt.match(/[^"'`]{0,50}delete[^"'`]{0,50}/gi) || [];
    const managePaths = txt.match(/\/manage\/[A-Za-z0-9_./-]{3,80}/g) || [];
    const interesting = [...new Set(managePaths)].filter(p => /post|delete|status|visibility|remove/i.test(p)).slice(0, 40);
    console.log('\nJS', u);
    console.log('deleteHits', deleteHits.slice(0, 20));
    console.log('paths', interesting);
  } catch (e) {
    console.log('js err', u, e.message);
  }
}

// Try common delete endpoints
const tries = [
  { url: '/manage/posts/delete.json', body: { ids: [924] } },
  { url: '/manage/post/delete.json', body: { id: 924 } },
  { url: '/manage/posts/change.json', body: { ids: [924], visibility: 'delete' } },
  { url: '/manage/posts/visibility.json', body: { ids: [924], visibility: 'D' } },
  { url: '/manage/posts/status.json', body: { ids: [924], status: 'delete' } }
];
for (const t of tries) {
  const res = await page.evaluate(async ({ url, body }) => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await r.text();
      return { url, status: r.status, text: text.slice(0, 300) };
    } catch (e) {
      return { url, error: String(e) };
    }
  }, t);
  console.log('try', res);
}

await page.close().catch(() => {});
await browser.close().catch(() => {});
