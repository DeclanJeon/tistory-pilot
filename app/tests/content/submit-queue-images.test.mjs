import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const cli = new URL('../../scripts/schedule/submit-queue.mjs', import.meta.url);
const paragraph = '공식 문서를 읽고 서비스 설정과 접근 권한을 확인합니다. 사용한 기능과 결과를 기록하면 같은 문제를 다시 점검할 수 있습니다. '.repeat(6);
const body = `<div style="font-size:16px;line-height:1.82;color:#1f2937;"><h1>자동화 이미지 사전 점검 가이드</h1>${Array.from({ length: 5 }, (_, i) => `<h2>🔍 점검 단계 ${i + 1}</h2><p>${paragraph}</p><p>${paragraph}</p>`).join('')}<div style="background:#fefce8">핵심 점검</div><div style="background:#eff6ff;border-left:4px solid #3b82f6">공식 문서 참고</div><blockquote>검증된 설정을 사용합니다.</blockquote>IMAGE</div>`;

test('queue dry-run rejects missing local image bytes but accepts a self-contained image', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-image-preflight-'));
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.end('<rss><channel><item><title>별개의 이전 게시물</title><link>https://example.com/1</link></item></channel></rss>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const queue = path.join(root, 'queue');
  await fs.mkdir(queue);
  const blogUrl = `http://127.0.0.1:${server.address().port}`;
  const run = async src => {
    await fs.writeFile(path.join(queue, 'post.json'), JSON.stringify({ posts: [{
      title: '자동화 이미지 사전 점검 가이드',
      blogUrl,
      publishAt: '2026-01-01T00:00:00Z',
      bodyHtml: body.replace('IMAGE', `<img src="${src}" alt="설정 안내">`),
      sourceBundle: [{ url: 'https://example.com/docs' }]
    }] }));
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli.pathname.replace(/^\/(\w:)/, '$1'), '--queue-dir', queue, '--due', '--dry-run'], {
        env: { ...process.env, PUBLISHED_LEDGER_PATH: path.join(root, 'ledger.json') },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', reject);
      child.on('close', code => resolve({ code, output }));
    });
  };
  const valid = await run('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(valid.code, 0, valid.output);
  const missing = await run('nonexistent-image-qa.png');
  assert.equal(missing.code, 1, missing.output);
});
