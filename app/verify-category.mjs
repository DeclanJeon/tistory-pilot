import { chromium } from 'playwright-core';

const cdpPort = process.env.CDP_PORT || '9230';
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
const context = browser.contexts()[0];
const page = await context.newPage();
try {
  await page.goto('https://acstory.tistory.com/manage/category', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  const result = await page.evaluate(() => {
    const text = document.body.innerText;
    const lines = text.split('\n');
    const countLine = lines.find(l => l.includes('/ 500')) || '';
    const p2pLines = lines.filter(l => l.includes('P2P'));
    const aiLines = lines.filter(l => l.startsWith('AI')).slice(0, 20);
    return {
      hasP2P: text.includes('P2P'),
      countLine,
      p2pLines: p2pLines.slice(0, 20),
      aiLines,
      tail: text.slice(-2000)
    };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await page.close({ runBeforeUnload: false }).catch(() => {});
}
process.exit(0);
