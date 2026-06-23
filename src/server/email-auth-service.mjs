import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const CODE_DIGEST_SEPARATOR = '\0';
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_CODE_ATTEMPTS = 5;

function authError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

export function normalizeAuthEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function assertAllowedAuthEmail(config, email) {
  const normalized = normalizeAuthEmail(email);
  if (!EMAIL_PATTERN.test(normalized)) {
    throw authError('invalid-email', 'valid email is required');
  }

  const allowed = (config.authEmail?.allowedRecipients || [])
    .map(normalizeAuthEmail)
    .filter(Boolean);
  if (!allowed.includes(normalized)) {
    throw authError('email-not-allowed', 'email is not allowed');
  }

  return normalized;
}

export function createEmailLoginCode(randomInt = crypto.randomInt) {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function digestCode(secret, email, code) {
  return crypto
    .createHmac('sha256', String(secret || 'publish-workbench-email-auth'))
    .update(email)
    .update(CODE_DIGEST_SEPARATOR)
    .update(String(code || '').trim())
    .digest('hex');
}

function timingSafeHexEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createTransport(config) {
  const auth = config.authEmail.smtpUser
    ? { user: config.authEmail.smtpUser, pass: config.authEmail.smtpPass }
    : undefined;
  return nodemailer.createTransport({
    host: config.authEmail.smtpHost,
    port: config.authEmail.smtpPort,
    secure: config.authEmail.smtpSecure,
    auth
  });
}

export class EmailAuthService {
  constructor({ config, transport = null, now = () => new Date(), randomInt = crypto.randomInt } = {}) {
    this.config = config;
    this.transport = transport;
    this.now = now;
    this.randomInt = randomInt;
    this.codes = new Map();
  }

  get enabled() {
    return Boolean(this.config?.authEmail?.enabled);
  }

  assertReady() {
    if (!this.enabled) {
      throw authError('email-auth-disabled', 'email auth is disabled');
    }
    if (!this.config.authEmail.from || !this.config.authEmail.smtpHost) {
      throw authError('email-auth-not-configured', 'email auth SMTP is not configured');
    }
  }

  pruneExpired(nowMs = this.now().getTime()) {
    for (const [email, record] of this.codes.entries()) {
      if (record.expiresAtMs <= nowMs) {
        this.codes.delete(email);
      }
    }
  }

  async requestCode({ email }) {
    this.assertReady();
    const normalizedEmail = assertAllowedAuthEmail(this.config, email);
    const nowMs = this.now().getTime();
    this.pruneExpired(nowMs);

    const code = createEmailLoginCode(this.randomInt);
    const expiresAtMs = nowMs + this.config.authEmail.codeTtlMs;
    this.codes.set(normalizedEmail, {
      digest: digestCode(this.config.sessionSecret, normalizedEmail, code),
      expiresAtMs,
      attempts: 0
    });

    await this.sendCode({ email: normalizedEmail, code, expiresAtMs });

    return {
      email: normalizedEmail,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ttlMs: this.config.authEmail.codeTtlMs
    };
  }

  async verifyCode({ email, code }) {
    this.assertReady();
    const normalizedEmail = normalizeAuthEmail(email);
    if (!EMAIL_PATTERN.test(normalizedEmail)) return false;

    const nowMs = this.now().getTime();
    this.pruneExpired(nowMs);
    const record = this.codes.get(normalizedEmail);
    if (!record) return false;

    const candidateDigest = digestCode(this.config.sessionSecret, normalizedEmail, code);
    if (timingSafeHexEqual(record.digest, candidateDigest)) {
      this.codes.delete(normalizedEmail);
      return true;
    }

    record.attempts += 1;
    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      this.codes.delete(normalizedEmail);
    }
    return false;
  }

  async sendCode({ email, code, expiresAtMs }) {
    const transport = this.transport || createTransport(this.config);
    const minutes = Math.max(1, Math.round(this.config.authEmail.codeTtlMs / 60_000));
    const baseUrl = this.config.baseUrl || 'Publish Workbench';
    await transport.sendMail({
      from: this.config.authEmail.from,
      to: email,
      subject: '[Publish Workbench] 로그인 코드',
      text: [
        'Publish Workbench 로그인 코드입니다.',
        '',
        code,
        '',
        `유효 시간: ${minutes}분`,
        `요청 서비스: ${baseUrl}`,
        `만료 시각: ${new Date(expiresAtMs).toISOString()}`
      ].join('\n'),
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111827;max-width:560px;margin:0 auto;">
          <h2 style="margin-bottom:12px;">Publish Workbench 로그인 코드</h2>
          <p>아래 6자리 코드를 로그인 화면에 입력하세요.</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;">${code}</p>
          <p><strong>유효 시간:</strong> ${minutes}분</p>
          <p><strong>요청 서비스:</strong> ${escapeHtml(baseUrl)}</p>
        </div>
      `
    });
  }
}

export function createEmailAuthService(config, options = {}) {
  return new EmailAuthService({ config, ...options });
}
