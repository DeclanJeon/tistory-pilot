import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import nodemailer from 'nodemailer';

let cachedTransportKey = '';
let cachedTransport = null;

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

export function resolveQrEmailOptions(options = {}, env = process.env) {
  return {
    blogUrl: String(options.blogUrl || env.TISTORY_BLOG_URL || '').trim(),
    qrEmailTo: String(
      options.qrEmailTo
      || env.TISTORY_QR_EMAIL_TO
      || env.PONSLINK_PROVIDER_DASHBOARD_OWNER_EMAIL
      || env.CONTACT_EMAIL
      || ''
    ).trim(),
    qrEmailFrom: String(
      options.qrEmailFrom
      || env.TISTORY_QR_EMAIL_FROM
      || env.TISTORY_SMTP_FROM
      || env.SMTP_FROM
      || env.EMAIL_FROM
      || ''
    ).trim(),
    qrEmailOnRefresh: options.qrEmailOnRefresh ?? parseBool(env.TISTORY_QR_EMAIL_ON_REFRESH, false),
    qrEmailSubjectPrefix: String(options.qrEmailSubjectPrefix || env.TISTORY_QR_EMAIL_SUBJECT_PREFIX || '[Tistory QR]').trim(),
    smtpHost: String(env.TISTORY_SMTP_HOST || env.SMTP_HOST || '').trim(),
    smtpPort: Number(env.TISTORY_SMTP_PORT || env.SMTP_PORT || 587),
    smtpSecure: parseBool(env.TISTORY_SMTP_SECURE ?? env.SMTP_SECURE, false),
    smtpUser: String(env.TISTORY_SMTP_USER || env.SMTP_USER || '').trim(),
    smtpPass: String(env.TISTORY_SMTP_PASS || env.SMTP_PASS || '')
  };
}

export function hasQrEmailDelivery(options = {}, env = process.env) {
  const resolved = resolveQrEmailOptions(options, env);
  return Boolean(resolved.qrEmailTo && resolved.qrEmailFrom && resolved.smtpHost);
}

function getTransport(options) {
  const key = JSON.stringify([
    options.smtpHost,
    options.smtpPort,
    options.smtpSecure,
    options.smtpUser,
    Boolean(options.smtpPass)
  ]);

  if (cachedTransport && cachedTransportKey === key) {
    return cachedTransport;
  }

  cachedTransportKey = key;
  cachedTransport = nodemailer.createTransport({
    host: options.smtpHost,
    port: options.smtpPort,
    secure: options.smtpSecure,
    auth: options.smtpUser || options.smtpPass
      ? {
          user: options.smtpUser,
          pass: options.smtpPass
        }
      : undefined
  });
  return cachedTransport;
}

function getBlogHost(blogUrl) {
  try {
    return new URL(blogUrl).host;
  } catch {
    return String(blogUrl || '').trim();
  }
}

export async function sendQrEmailIfConfigured({
  options = {},
  filePath,
  phase = 'initial',
  qrState = null,
  context = 'tistory-login'
} = {}, env = process.env) {
  const resolvedOptions = resolveQrEmailOptions(options, env);
  if (!resolvedOptions.qrEmailTo) {
    return { sent: false, skipped: true, reason: 'recipient-not-configured' };
  }
  if (phase === 'refresh' && !resolvedOptions.qrEmailOnRefresh) {
    return { sent: false, skipped: true, reason: 'refresh-email-disabled' };
  }
  if (!resolvedOptions.qrEmailFrom || !resolvedOptions.smtpHost) {
    return { sent: false, skipped: true, reason: 'smtp-not-configured' };
  }

  const resolvedPath = path.resolve(String(filePath || ''));
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return { sent: false, skipped: true, reason: 'file-missing', filePath: resolvedPath };
  }

  const host = getBlogHost(resolvedOptions.blogUrl) || 'tistory';
  const phaseLabel = phase === 'refresh' ? '갱신' : '생성';
  const expiresIn = Number.isFinite(qrState?.timeLeftSeconds)
    ? `${qrState.timeLeftSeconds}초`
    : '수분 내';
  const subject = `${resolvedOptions.qrEmailSubjectPrefix} ${host} Kakao QR ${phaseLabel}`.trim();
  const attachmentName = path.basename(resolvedPath);
  const cid = `qr-${Date.now()}-${Math.random().toString(16).slice(2)}@tistory-automation`;

  const text = [
    `카카오 QR 로그인 이미지가 ${phaseLabel}됐다.`,
    resolvedOptions.blogUrl ? `블로그: ${resolvedOptions.blogUrl}` : '',
    `컨텍스트: ${context}`,
    `예상 만료: ${expiresIn}`,
    `첨부 파일: ${attachmentName}`,
    '',
    '이 QR은 금방 만료된다. 카카오톡에서 승인한 뒤 새 QR이 필요하면 최신 메일을 확인해라.'
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111827;max-width:720px;margin:0 auto;">
      <h2 style="margin-bottom:12px;">카카오 QR 로그인 이미지가 ${phaseLabel}됐다.</h2>
      <p><strong>블로그:</strong> ${resolvedOptions.blogUrl || '(없음)'}</p>
      <p><strong>컨텍스트:</strong> ${context}</p>
      <p><strong>예상 만료:</strong> ${expiresIn}</p>
      <p>이 QR은 금방 만료된다. 카카오톡에서 승인한 뒤 새 QR이 필요하면 최신 메일을 확인해라.</p>
      <p><img src="cid:${cid}" alt="Kakao QR" style="max-width:320px;border:1px solid #e5e7eb;border-radius:12px;display:block;" /></p>
    </div>
  `;

  try {
    const info = await getTransport(resolvedOptions).sendMail({
      from: resolvedOptions.qrEmailFrom,
      to: resolvedOptions.qrEmailTo,
      subject,
      text,
      html,
      attachments: [
        {
          filename: attachmentName,
          path: resolvedPath,
          cid
        }
      ]
    });
    return {
      sent: true,
      messageId: info.messageId,
      to: resolvedOptions.qrEmailTo,
      subject,
      filePath: resolvedPath,
      phase
    };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      reason: 'send-failed',
      error: error instanceof Error ? error.message : String(error),
      to: resolvedOptions.qrEmailTo,
      subject,
      filePath: resolvedPath,
      phase
    };
  }
}
