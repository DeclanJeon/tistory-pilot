import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowedQrRecipient, buildQrEmailMessage, canSendQrEmail } from '../../src/core/qr/email-service.mjs';

test('QR email recipient must be allowlisted', async () => {
  const config = {
    enabled: true,
    from: 'ops@ponslink.com',
    smtpHost: 'smtp.ponslink.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'user',
    smtpPass: 'pass',
    allowedRecipients: ['ops@ponslink.com']
  };

  assert.equal(canSendQrEmail(config), true);
  assert.equal(assertAllowedQrRecipient(config, 'ops@ponslink.com'), 'ops@ponslink.com');
  assert.throws(() => assertAllowedQrRecipient(config, 'other@ponslink.com'), /allowlisted/);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-qr-email-'));
  await fs.writeFile(path.join(tempRoot, 'qr.png'), 'fake');
});

test('QR email includes a live link when a web URL is configured', () => {
  const webUrl = 'https://publish.ponslink.com';
  const message = buildQrEmailMessage({
    blogUrl: 'https://acstory.tistory.com',
    phase: 'initial',
    context: 'tistory-login',
    webUrl,
    attachmentName: 'qr.png',
    cid: 'qr-1@test'
  });

  assert.match(message.subject, /acstory\.tistory\.com/);
  assert.match(message.subject, /Kakao QR/);
  assert.ok(message.text.includes(webUrl), 'text should include the live link');
  assert.match(message.html, new RegExp(`href="${webUrl}"`), 'html should include an anchor to the web URL');
  assert.match(message.html, /QR 로그인 페이지 열기/);
  assert.match(message.html, /cid:qr-1@test/);
});

test('QR email omits the link when no web URL is available', () => {
  const message = buildQrEmailMessage({
    blogUrl: 'https://acstory.tistory.com',
    phase: 'refresh',
    attachmentName: 'qr.png',
    cid: 'qr-2@test'
  });

  assert.ok(!message.text.includes('링크로 열기'), 'text should not mention a link');
  assert.ok(!message.html.includes('로그인 페이지 열기'), 'html should not render a link button');
});
