import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

let cachedTransportKey = '';
let cachedTransport = null;

function getTransport(config) {
  const key = JSON.stringify([
    config.smtpHost,
    config.smtpPort,
    config.smtpSecure,
    config.smtpUser,
    Boolean(config.smtpPass)
  ]);

  if (cachedTransport && cachedTransportKey === key) {
    return cachedTransport;
  }

  cachedTransportKey = key;
  cachedTransport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUser || config.smtpPass
      ? {
          user: config.smtpUser,
          pass: config.smtpPass
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

export function canSendQrEmail(config) {
  return Boolean(config.enabled && config.from && config.smtpHost);
}

export function assertAllowedQrRecipient(config, recipient) {
  const normalized = String(recipient || '').trim().toLowerCase();
  if (!normalized) {
    throw new Error('QR email recipient is required.');
  }
  const allowed = (config.allowedRecipients || []).map(value => String(value).trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(normalized)) {
    throw new Error(`QR email recipient is not allowlisted: ${recipient}`);
  }
  return recipient;
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildQrEmailMessage({ blogUrl, phase = 'initial', context = 'tistory-login', qrState = null, webUrl = '', attachmentName = 'qr.png', cid = '' }) {
  const host = getBlogHost(blogUrl) || 'tistory';
  const phaseLabel = phase === 'refresh' ? '갱신' : '생성';
  const expiresIn = Number.isFinite(qrState?.timeLeftSeconds) ? `${qrState.timeLeftSeconds}초` : '수분 내';
  const subject = `[Tistory QR] ${host} Kakao QR ${phaseLabel}`.trim();

  const text = [
    `카카오 QR 로그인 이미지가 ${phaseLabel}됐다.`,
    blogUrl ? `블로그: ${blogUrl}` : '',
    `컨텍스트: ${context}`,
    `예상 만료: ${expiresIn}`,
    webUrl ? `링크로 열기 (실시간 QR): ${webUrl}` : '',
    `첨부 파일: ${attachmentName}`
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111827;max-width:720px;margin:0 auto;">
      <h2 style="margin-bottom:12px;">카카오 QR 로그인 이미지가 ${phaseLabel}됐다.</h2>
      <p><strong>블로그:</strong> ${blogUrl || '(없음)'}</p>
      <p><strong>컨텍스트:</strong> ${context}</p>
      <p><strong>예상 만료:</strong> ${expiresIn}</p>
      ${webUrl ? `<p style="margin:18px 0;"><a href="${escapeAttr(webUrl)}" style="display:inline-block;background:#fee500;color:#111827;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px;">QR 로그인 페이지 열기 (실시간)</a></p>` : ''}
      <p><img src="cid:${cid}" alt="Kakao QR" style="max-width:320px;border:1px solid #e5e7eb;border-radius:12px;display:block;" /></p>
      ${webUrl ? `<p style="font-size:13px;color:#6b7280;">첨부된 QR 이미지는 짧은 시간 안에 만료될 수 있다. 위 링크로 열면 현재 유효한 QR이 표시된다.</p>` : ''}
    </div>
  `;

  return { subject, text, html };
}

export async function sendQrEmail({ config, blogUrl, recipient, filePath, phase = 'initial', qrState = null, context = 'tistory-login', loginUrl = null }) {
  if (!canSendQrEmail(config)) {
    return { sent: false, skipped: true, reason: 'qr-email-disabled' };
  }

  assertAllowedQrRecipient(config, recipient);
  const resolvedPath = path.resolve(String(filePath || ''));
  if (!fs.existsSync(resolvedPath)) {
    return { sent: false, skipped: true, reason: 'file-missing', filePath: resolvedPath };
  }

  const attachmentName = path.basename(resolvedPath);
  const cid = `qr-${Date.now()}-${Math.random().toString(16).slice(2)}@publish-workbench`;
  const webUrl = loginUrl || config.webUrl || '';
  const { subject, text, html } = buildQrEmailMessage({
    blogUrl,
    phase,
    context,
    qrState,
    webUrl,
    attachmentName,
    cid
  });

  try {
    const info = await getTransport(config).sendMail({
      from: config.from,
      to: recipient,
      subject,
      text,
      html,
      attachments: [{ filename: attachmentName, path: resolvedPath, cid }]
    });
    return { sent: true, messageId: info.messageId, to: recipient, subject, filePath: resolvedPath, phase };
  } catch (error) {
    return {
      sent: false,
      skipped: false,
      reason: 'send-failed',
      error: error instanceof Error ? error.message : String(error),
      to: recipient,
      subject,
      filePath: resolvedPath,
      phase
    };
  }
}
