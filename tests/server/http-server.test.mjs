import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpServer } from '../../src/server/http-server.mjs';

test('http server serves session, template, blog, job, and markdown analysis endpoints', async () => {

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-http-server-'));
  const app = await createHttpServer({
    cwd: tempRoot,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data',
      PUBLISH_WORKBENCH_WEB_HOST: '127.0.0.1',
      PUBLISH_WORKBENCH_WEB_PORT: '4411',
      PUBLISH_WORKBENCH_SESSION_SECRET: 'secret'
    }
  });
  const url = await app.listen();

  try {
    let response = await fetch(`${url}/api/session`);
    let payload = await response.json();
    assert.equal(payload.authenticated, true);

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
        title: '제목',
        body: '본문',
        category: 'IT·테크'
      })
    });
    payload = await response.json();
    assert.equal(payload.job.type, 'publish_post');

    response = await fetch(`${url}/api/jobs/${encodeURIComponent(payload.job.jobId)}`, { headers: { cookie } });
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
    assert.equal(payload.authenticated, true);
    assert.equal(payload.auth.emailEnabled, true);

    response = await fetch(`${url}/api/templates`);
    assert.equal(response.status, 200);

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
