import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../scripts/schedule/submit-queue.mjs', import.meta.url));
const title = 'WebRTC 네트워크 프로토콜 최신 표준 발표';
const paragraph = '공식 문서를 읽고 서비스 설정과 접근 권한을 확인합니다. 사용한 기능과 결과를 기록하면 같은 문제를 다시 점검할 수 있습니다. '.repeat(6);
const body = `<div style="font-size:16px;line-height:1.82;color:#1f2937;"><h1>${title}</h1>${Array.from({ length: 5 }, (_, i) => `<h2>🔍 점검 단계 ${i + 1}</h2><p>${paragraph}</p><p>${paragraph}</p>`).join('')}<div style="background:#fefce8">핵심 점검</div><div style="background:#eff6ff;border-left:4px solid #3b82f6">공식 문서 참고</div><blockquote>검증된 설정을 사용합니다.</blockquote></div>`;

test('an old duplicate does not consume the submission limit ahead of a new topic', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-duplicate-limit-'));
  const server = http.createServer((req, res) => {
    res.end('<rss><channel><item><title>엘리스그룹 기업공개 소식</title></item></channel></rss>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const queue = path.join(root, 'queue');
  const ledger = path.join(root, 'ledger.json');
  await fs.mkdir(queue);
  await fs.writeFile(ledger, JSON.stringify({ posts: [{ id: 'old-topic', title: '엘리스그룹 기업공개 소식' }] }));
  const blogUrl = `http://127.0.0.1:${server.address().port}`;
  await fs.writeFile(path.join(queue, 'posts.json'), JSON.stringify({ posts: [
    { id: 'old-topic', keyword: '엘리스그룹 기업공개', title: '엘리스그룹 기업공개 소식', blogUrl, publishAt: '2026-01-01T00:00:00Z' },
    { title, blogUrl, publishAt: '2026-01-02T00:00:00Z', bodyHtml: body, sourceBundle: [{ url: 'https://example.com/source' }] }
  ] }));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, '--queue-dir', queue, '--due', '--limit', '1', '--dry-run'], {
      env: { ...process.env, PUBLISHED_LEDGER_PATH: ledger }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes(`[JOB] ${title}`), result.stdout + result.stderr);
});
