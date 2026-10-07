import test from 'node:test';
import assert from 'node:assert/strict';
import { EmailAuthService, assertAllowedAuthEmail, createEmailLoginCode } from '../../src/server/email-auth-service.mjs';

function config(overrides = {}) {
  return {
    sessionSecret: 'cookie-secret',
    baseUrl: 'https://publish.ponslink.com',
    authEmail: {
      enabled: true,
      from: 'bot@ponslink.com',
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      allowedRecipients: ['ops@ponslink.com'],
      codeTtlMs: 600000,
      ...overrides
    }
  };
}

test('email auth allows only configured recipients', () => {
  assert.equal(assertAllowedAuthEmail(config(), 'OPS@PONSLINK.COM'), 'ops@ponslink.com');
  assert.throws(() => assertAllowedAuthEmail(config(), 'outsider@example.com'), /email is not allowed/);
});

test('email login codes are six digits', () => {
  assert.equal(createEmailLoginCode(() => 42), '000042');
  assert.equal(createEmailLoginCode(() => 999999), '999999');
});

test('email auth service sends and verifies a one-time code', async () => {
  const messages = [];
  const service = new EmailAuthService({
    config: config(),
    randomInt: () => 123456,
    transport: {
      async sendMail(message) {
        messages.push(message);
      }
    }
  });

  const request = await service.requestCode({ email: 'ops@ponslink.com' });
  assert.equal(request.email, 'ops@ponslink.com');
  assert.equal(messages.length, 1);
  assert.match(messages[0].text, /123456/);
  assert.equal(await service.verifyCode({ email: 'ops@ponslink.com', code: '000000' }), false);
  assert.equal(await service.verifyCode({ email: 'ops@ponslink.com', code: '123456' }), true);
  assert.equal(await service.verifyCode({ email: 'ops@ponslink.com', code: '123456' }), false);
});

test('email auth service expires codes', async () => {
  let current = new Date('2026-06-23T00:00:00.000Z');
  const service = new EmailAuthService({
    config: config({ codeTtlMs: 60000 }),
    now: () => current,
    randomInt: () => 654321,
    transport: { async sendMail() {} }
  });

  await service.requestCode({ email: 'ops@ponslink.com' });
  current = new Date('2026-06-23T00:02:00.000Z');
  assert.equal(await service.verifyCode({ email: 'ops@ponslink.com', code: '654321' }), false);
});
