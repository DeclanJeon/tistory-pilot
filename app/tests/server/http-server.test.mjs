import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpServer } from '../../src/server/http-server.mjs';

const PUBLISH_BODY = `<div style="font-size:16px;line-height:1.82;color:#1f2937;">
<h1>출처 검증 테스트 글</h1>
${'<p>검증 가능한 본문을 충분히 작성합니다. 가격과 절차는 공식 자료를 확인하고 독자가 직접 판단하도록 안내합니다. </p>'.repeat(32)}
<h2>📌 핵심</h2><p>본문의 핵심 내용을 설명합니다 (출처: 공식 안내).</p>
<h2>⚙️ 절차</h2><p>단계별 절차와 주의사항을 정리합니다.</p>
<h2>💡 확인</h2><p>실행 전에 조건과 기준일을 확인합니다.</p>
<h2>✅ 마무리</h2><p>필요한 경우 담당 기관에 문의합니다.</p>
<div style="background:#fefce8;border:1px solid #fde68a;">인사이트</div>
<div style="background:#eff6ff;border-left:4px solid #3b82f6;">정보</div>
</div>`;

test('http server serves session, template, blog, job, and markdown analysis endpoints', async () => {

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-http-server-'));
  const app = await createHttpServer({
    cwd: tempRoot,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data',
      PUBLISH_WORKBENCH_WEB_HOST: '127.0.0.1',
      PUBLISH_WORKBENCH_WEB_PORT: '4411',
      PUBLISH_WORKBENCH_SESSION_SECRET: 'secret'
    },
    publicSiteQa: async () => ({ surface: { ok: true, blockers: [] } })
  });
  const url = await app.listen();

  try {
    let response = await fetch(`${url}/api/session`);
    let payload = await response.json();
    assert.equal(payload.authenticated, false);

    response = await fetch(`${url}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'publish_post', body: PUBLISH_BODY })
    });
    assert.equal(response.status, 401);

    response = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'secret' })
    });
    assert.equal(response.status, 204);
    const cookie = response.headers.get('set-cookie');
    assert.equal(Boolean(cookie), true);

    response = await fetch(`${url}/api/templates`, { headers: { cookie } });
    payload = await response.json();
    assert.equal(Array.isArray(payload.templates), true);

    response = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ markdown: '# 제목\n\n본문' })
    });
    payload = await response.json();
    assert.equal(payload.mode, 'markdown');
    assert.equal(typeof payload.analysis.recommendedTemplateId, 'string');
    assert.equal(typeof payload.draft.title, 'string');
    assert.equal(typeof payload.draft.body, 'string');

    response = await fetch(`${url}/api/blogs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ accountName: 'kakao-main', blogUrl: 'https://acstory.tistory.com', blogTitle: 'Acstory' })
    });
    payload = await response.json();
    assert.equal(payload.blogs.length, 1);

    response = await fetch(`${url}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'publish_post',
        blogUrl: 'https://acstory.tistory.com',
        title: '출처 검증 테스트 글 2026',
        body: PUBLISH_BODY,
        category: 'IT·테크',
        sourceBundle: [{ url: 'https://example.com/source', title: '공식 안내' }]
      })
    });
    payload = await response.json();
    assert.equal(payload.job.type, 'publish_post');
    const createdJobId = payload.job.jobId;

    response = await fetch(`${url}/api/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'publish_post',
        blogUrl: 'https://acstory.tistory.com',
        title: '출처 없는 글',
        body: PUBLISH_BODY
      })
    });
    payload = await response.json();
    assert.equal(response.status, 422);
    assert.equal(payload.error, 'publish-qa-failed');

    response = await fetch(`${url}/api/jobs/${encodeURIComponent(createdJobId)}`, { headers: { cookie } });
    payload = await response.json();
    assert.equal(Array.isArray(payload.artifacts), true);

    response = await fetch(`${url}/api/jobs`, { headers: { cookie } });
    payload = await response.json();
    assert.equal(payload.jobs.length >= 1, true);

    response = await fetch(`${url}/api/jobs/does-not-exist`, { headers: { cookie } });
    payload = await response.json();
    assert.equal(response.status, 404);
    assert.equal(payload.error, 'job-not-found');
  } finally {
    await new Promise(resolve => app.server.close(resolve));
  }
});

test('http server supports email code session login', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-http-email-auth-'));
  const requestedEmails = [];
  const app = await createHttpServer({
    cwd: tempRoot,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data',
      PUBLISH_WORKBENCH_WEB_HOST: '127.0.0.1',
      PUBLISH_WORKBENCH_WEB_PORT: '4412',
      PUBLISH_WORKBENCH_SESSION_SECRET: 'secret',
      PUBLISH_WORKBENCH_AUTH_EMAIL_ENABLED: '1',
      PUBLISH_WORKBENCH_AUTH_EMAIL_FROM: 'bot@ponslink.com',
      PUBLISH_WORKBENCH_AUTH_EMAIL_SMTP_HOST: 'smtp.example.com',
      PUBLISH_WORKBENCH_AUTH_EMAIL_ALLOWED_RECIPIENTS: 'ops@ponslink.com'
    },
    emailAuthService: {
      async requestCode({ email }) {
        requestedEmails.push(email);
        return { email, expiresAt: '2026-06-23T00:10:00.000Z', ttlMs: 600000 };
      },
      async verifyCode({ email, code }) {
        return email === 'ops@ponslink.com' && code === '123456';
      }
    }
  });
  const url = await app.listen();

  try {
    let response = await fetch(`${url}/api/session`);
    let payload = await response.json();
    assert.equal(payload.authenticated, false);
    assert.equal(payload.auth.emailEnabled, true);

    response = await fetch(`${url}/api/templates`);
    assert.equal(response.status, 401);

    response = await fetch(`${url}/api/session/email/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@ponslink.com' })
    });
    payload = await response.json();
    assert.equal(response.status, 202);
    assert.equal(payload.email, 'ops@ponslink.com');
    assert.deepEqual(requestedEmails, ['ops@ponslink.com']);

    response = await fetch(`${url}/api/session/email/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@ponslink.com', code: '000000' })
    });
    payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error, 'invalid-code');

    response = await fetch(`${url}/api/session/email/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@ponslink.com', code: '123456' })
    });
    assert.equal(response.status, 204);
    const cookie = response.headers.get('set-cookie');

    response = await fetch(`${url}/api/templates`, { headers: { cookie } });
    payload = await response.json();
    assert.equal(Array.isArray(payload.templates), true);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
  }
});
