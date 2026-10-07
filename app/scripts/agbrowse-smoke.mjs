import assert from 'node:assert/strict';
import {
  browserStatus,
  ensureBrowserStarted,
  evaluate,
  navigate,
  snapshot,
  stopBrowser
} from './lib/agbrowse-cli.mjs';

function readLoginPage() {
  const links = Array.from(document.querySelectorAll('a, button'))
    .map(element => String(element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return {
    title: document.title,
    href: location.href,
    hasKakaoLogin: links.some(text => text.includes('카카오계정으로 로그인')),
    links: links.filter(text => /카카오|티스토리|로그인/i.test(text)).slice(0, 10)
  };
}

const before = browserStatus();
const { started } = ensureBrowserStarted({ headed: false });

try {
  navigate('https://www.tistory.com/auth/login');
  const page = evaluate(readLoginPage);
  const snap = snapshot({ interactive: true, maxNodes: 20 });

  assert.equal(page.title, 'TISTORY');
  assert.equal(page.hasKakaoLogin, true);
  assert.match(snap, /카카오계정으로 로그인/);

  console.log(JSON.stringify({
    ok: true,
    browserWasRunning: before.running,
    page,
    snapshot: snap
  }, null, 2));
} finally {
  if (started) {
    stopBrowser();
  }
}
