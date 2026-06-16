import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  ensureBrowserStarted,
  evaluate,
  navigate,
  snapshot,
  wait
} from './lib/agbrowse-cli.mjs';
import {
  hasQrEmailDelivery,
  sendQrEmailIfConfigured
} from './lib/qr-notify.mjs';
import { loadProjectEnv } from './lib/load-env.mjs';

loadProjectEnv();

function parseArgs(argv) {
  const options = {
    publish: false,
    dryRun: false,
    headed: process.env.TISTORY_HEADED === '1',
    blogUrl: process.env.TISTORY_BLOG_URL || '',
    title: process.env.TISTORY_POST_TITLE || '',
    body: process.env.TISTORY_POST_BODY || '',
    bodyFile: process.env.TISTORY_POST_BODY_FILE || '',
    description: process.env.TISTORY_POST_DESCRIPTION || '',
    tags: process.env.TISTORY_POST_TAGS || '',
    category: process.env.TISTORY_POST_CATEGORY || '',
    heroImage: process.env.TISTORY_POST_HERO_IMAGE || '',
    qrImagePath: process.env.TISTORY_QR_IMAGE_PATH || 'tmp/kakao-tistory-qr.png',
    waitForLoginMs: Number(process.env.TISTORY_WAIT_FOR_LOGIN_MS || 300000),
    qrEmailTo: process.env.TISTORY_QR_EMAIL_TO || '',
    qrEmailOnRefresh: ['1', 'true', 'yes', 'on'].includes(String(process.env.TISTORY_QR_EMAIL_ON_REFRESH || '').toLowerCase()),
    qrEmailSubjectPrefix: process.env.TISTORY_QR_EMAIL_SUBJECT_PREFIX || '[Tistory QR]'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--publish') options.publish = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--headless') options.headed = false;
    else if (arg === '--blog-url' && next) {
      options.blogUrl = next;
      i += 1;
    } else if (arg === '--title' && next) {
      options.title = next;
      i += 1;
    } else if (arg === '--body' && next) {
      options.body = next;
      i += 1;
    } else if (arg === '--body-file' && next) {
      options.bodyFile = next;
      i += 1;
    } else if (arg === '--description' && next) {
      options.description = next;
      i += 1;
    } else if (arg === '--tags' && next) {
      options.tags = next;
      i += 1;
    } else if (arg === '--category' && next) {
      options.category = next;
      i += 1;
    } else if (arg === '--hero-image' && next) {
      options.heroImage = next;
      i += 1;
    } else if (arg === '--qr-image-path' && next) {
      options.qrImagePath = next;
      i += 1;
    } else if (arg === '--wait-for-login-ms' && next) {
      options.waitForLoginMs = Number(next);
      i += 1;
    } else if (arg === '--qr-email-to' && next) {
      options.qrEmailTo = next;
      i += 1;
    } else if (arg === '--qr-email-on-refresh') {
      options.qrEmailOnRefresh = true;
    } else if (arg === '--no-qr-email-on-refresh') {
      options.qrEmailOnRefresh = false;
    } else if (arg === '--qr-email-subject-prefix' && next) {
      options.qrEmailSubjectPrefix = next;
      i += 1;
    }
  }

  if (options.bodyFile) {
    options.body = fs.readFileSync(options.bodyFile, 'utf8');
  }

  return options;
}

function normalizeBlogUrl(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  const url = new URL(value.startsWith('http') ? value : `https://${value}`);
  return `${url.protocol}//${url.host}`;
}

function buildEditorUrl(blogUrl) {
  const baseUrl = normalizeBlogUrl(blogUrl);
  return baseUrl ? `${baseUrl}/manage/newpost` : '';
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function toDataUrl(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`이미지 파일을 찾을 수 없다: ${resolved}`);
  }
  const data = fs.readFileSync(resolved).toString('base64');
  return `data:${getMimeType(resolved)};base64,${data}`;
}
function collectBodyImageDataUrls(body) {
  const imageDataUrls = {};
  const pattern = /^!\[(.*?)\]\(([^\s)]+)\)$/gim;
  let match;
  while ((match = pattern.exec(String(body || ''))) !== null) {
    const src = String(match[2] || '').trim();
    if (!src || /^https?:/i.test(src) || /^data:/i.test(src)) continue;
    imageDataUrls[src] = toDataUrl(src);
  }
  return imageDataUrls;
}

function resolveOutputPath(filePath) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function writeDataUrlFile(filePath, dataUrl) {
  const match = String(dataUrl || '').match(/^data:.*?;base64,(.+)$/);
  if (!match) {
    throw new Error('유효한 data URL 이 아니다.');
  }
  const resolved = resolveOutputPath(filePath);
  fs.writeFileSync(resolved, Buffer.from(match[1], 'base64'));
  return resolved;
}

async function notifyQrEmail(options, filePath, phase, qrState) {
  const result = await sendQrEmailIfConfigured({
    options,
    filePath,
    phase,
    qrState,
    context: 'tistory-post'
  });

  if (result?.sent) {
    console.log(`QR 이메일을 전송했다: ${result.to}`);
    return result;
  }

  if (!result?.skipped) {
    console.log(`QR 이메일 전송에 실패했다: ${result?.error || result?.reason || 'unknown-error'}`);
  }

  return result;
}

function detectTistoryState() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const isHtmlElement = element => {
    const view = element?.ownerDocument?.defaultView;
    return Boolean(view && element instanceof view.HTMLElement);
  };
  const visible = element => {
    if (!isHtmlElement(element)) return false;
    const style = (element.ownerDocument?.defaultView || window).getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textLike = element => isHtmlElement(element) && element.matches('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror');
  const summarize = element => ({
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    className: normalize(element.className || '').slice(0, 120) || null,
    name: element.getAttribute('name'),
    placeholder: element.getAttribute('placeholder'),
    ariaLabel: element.getAttribute('aria-label'),
    text: normalize(element.innerText || element.textContent || '').slice(0, 80) || null,
    width: Math.round(element.getBoundingClientRect().width),
    height: Math.round(element.getBoundingClientRect().height)
  });
  const scoreTitle = element => {
    const haystack = [
      element.getAttribute('name'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.id,
      element.className,
      element.getAttribute('data-placeholder'),
      element.getAttribute('title')
    ].map(normalize).join(' ');
    let score = 0;
    if (/제목|title|headline/i.test(haystack)) score += 10;
    if (element.matches('input[type="text"], input:not([type]), textarea')) score += 2;
    const rect = element.getBoundingClientRect();
    if (rect.y < 320) score += 2;
    if (rect.height <= 120) score += 1;
    return score;
  };
  const scoreBody = element => {
    const haystack = [
      element.getAttribute('name'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.id,
      element.className,
      element.getAttribute('data-placeholder'),
      element.getAttribute('title')
    ].map(normalize).join(' ');
    const rect = element.getBoundingClientRect();
    let score = rect.height > 180 ? 6 : rect.height > 80 ? 3 : 0;
    if (element.classList.contains('ProseMirror')) score += 10;
    if (element.isContentEditable) score += 4;
    if (/본문|내용|content|editor|article|write|story|post|markdown|html/i.test(haystack)) score += 6;
    return score;
  };
  const scoreTag = element => {
    const haystack = [
      element.getAttribute('name'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.id,
      element.className,
      element.getAttribute('data-placeholder')
    ].map(normalize).join(' ');
    return /태그|tag|keyword|label/i.test(haystack) ? 10 : 0;
  };
  const scoreCategory = element => {
    const haystack = [
      element.getAttribute('name'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.id,
      element.className,
      element.getAttribute('data-placeholder'),
      element.innerText,
      element.textContent,
      element.getAttribute('title')
    ].map(normalize).join(' ');
    return /카테고리|category/i.test(haystack) ? 10 : 0;
  };

  const fields = [
    ...Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror')),
    ...Array.from(document.querySelectorAll('iframe')).flatMap(frame => {
      if (!(frame instanceof HTMLIFrameElement)) return [];
      const doc = frame.contentDocument;
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror, body[contenteditable="true"]'));
    })
  ].filter(element => visible(element) && textLike(element));
  const titleCandidates = fields.map(element => ({ element, score: scoreTitle(element) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(entry => ({ score: entry.score, ...summarize(entry.element) }));
  const bodyCandidates = fields.map(element => ({ element, score: scoreBody(element) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(entry => ({ score: entry.score, ...summarize(entry.element) }));
  const tagCandidates = fields.map(element => ({ element, score: scoreTag(element) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(entry => ({ score: entry.score, ...summarize(entry.element) }));

  const categoryCandidates = Array.from(document.querySelectorAll('button, a, [role="button"], select, label, div, span'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .map(element => ({ element, score: scoreCategory(element) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(entry => ({ score: entry.score, ...summarize(entry.element) }));

  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .map(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || ''))
    .filter(Boolean);
  const bodyText = normalize(document.body?.innerText || '');
  const onKakaoHost = /(^|\.)accounts\.kakao\.com$/i.test(location.host);
  const authKind = onKakaoHost
    ? (location.pathname.includes('/qr_login') ? 'kakao-qr' : 'kakao-login')
    : (location.pathname.includes('/auth/login') ? 'tistory-login' : 'editor');
  const loginRequired = authKind === 'kakao-login'
    || authKind === 'kakao-qr'
    || location.pathname.includes('/auth/login')
    || bodyText.includes('카카오계정으로 로그인')
    || buttons.some(text => text.includes('카카오계정으로 로그인'));
  const errorPage = /존재하지 않는 페이지|에러 메세지/i.test(bodyText);

  return {
    url: location.href,
    title: document.title,
    host: location.host,
    authKind,
    loginRequired,
    errorPage,
    ready: titleCandidates.length > 0 && bodyCandidates.length > 0,
    titleCandidates,
    bodyCandidates,
    tagCandidates,
    categoryCandidates,
    buttons: buttons.filter(text => /완료|발행|공개|저장|태그|카테고리|로그인|첨부|사진|이미지|QR/i.test(text)).slice(0, 20),
    bodyPreview: bodyText.slice(0, 240)
  };
}

function detectKakaoLoginState() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], label'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .map(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || ''))
    .filter(Boolean);
  const qrCanvas = Array.from(document.querySelectorAll('canvas'))
    .find(element => element instanceof HTMLCanvasElement && visible(element));
  const timeLeftText = normalize(document.body?.innerText || '').match(/\b(\d{2}:\d{2})\b/)?.[1] || '';
  const [minutes, seconds] = timeLeftText.split(':').map(value => Number.parseInt(value, 10));
  const timeLeftSeconds = Number.isFinite(minutes) && Number.isFinite(seconds)
    ? (minutes * 60) + seconds
    : null;
  const staySignedInCheckbox = Array.from(document.querySelectorAll('input[type="checkbox"]'))
    .find(element => element instanceof HTMLInputElement && /Stay Logged In|로그인 상태 유지/i.test(normalize(element.closest('label, div, li')?.textContent || element.getAttribute('aria-label') || '')));

  return {
    url: location.href,
    title: document.title,
    host: location.host,
    onKakaoHost: /(^|\.)accounts\.kakao\.com$/i.test(location.host),
    onQrPage: location.pathname.includes('/qr_login'),
    hasQrCanvas: Boolean(qrCanvas),
    qrRect: qrCanvas
      ? {
        x: Math.round(qrCanvas.getBoundingClientRect().x),
        y: Math.round(qrCanvas.getBoundingClientRect().y),
        width: Math.round(qrCanvas.getBoundingClientRect().width),
        height: Math.round(qrCanvas.getBoundingClientRect().height)
      }
      : null,
    timeLeftText,
    timeLeftSeconds,
    buttons: buttons.slice(0, 20),
    staySignedInChecked: staySignedInCheckbox instanceof HTMLInputElement ? staySignedInCheckbox.checked : null
  };
}

function clickTistoryKakaoLogin() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element));
  const target = candidates.find(element => /카카오계정으로 로그인/i.test(normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '')));
  if (!target) {
    return { clicked: false, reason: 'kakao-login-button-not-found', url: location.href };
  }
  target.click();
  return { clicked: true, label: normalize(target.innerText || target.textContent || target.getAttribute('aria-label') || ''), url: location.href };
}

function openKakaoQrLogin() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  if (location.pathname.includes('/qr_login')) {
    return { clicked: false, alreadyOnQrPage: true, url: location.href };
  }
  const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element));
  const target = candidates.find(element => {
    const label = normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '');
    return /(log in with qr code|qr코드 로그인|qr 코드 로그인|qr login)/i.test(label)
      && !/(새로고침|refresh|사용방법|help)/i.test(label);
  });
  if (!target) {
    return { clicked: false, reason: 'qr-login-button-not-found', url: location.href };
  }
  target.click();
  return { clicked: true, label: normalize(target.innerText || target.textContent || target.getAttribute('aria-label') || ''), url: location.href };
}

function ensureKakaoStaySignedIn() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const checkbox = Array.from(document.querySelectorAll('input[type="checkbox"]'))
    .find(element => element instanceof HTMLInputElement && /Stay Logged In|로그인 상태 유지/i.test(normalize(element.closest('label, div, li')?.textContent || element.getAttribute('aria-label') || '')));
  if (!(checkbox instanceof HTMLInputElement)) {
    return { found: false, checked: null };
  }
  if (!checkbox.checked) {
    checkbox.click();
  }
  return { found: true, checked: checkbox.checked };
}

function refreshKakaoQr() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const target = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .find(element => /(qr코드 새로고침|refresh qr code)/i.test(normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '')));
  if (!target) {
    return { clicked: false, reason: 'qr-refresh-button-not-found' };
  }
  target.click();
  return { clicked: true };
}

function captureKakaoQrData() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const qrCanvas = Array.from(document.querySelectorAll('canvas'))
    .find(element => element instanceof HTMLCanvasElement && visible(element));
  if (!(qrCanvas instanceof HTMLCanvasElement)) {
    return { ok: false, reason: 'qr-canvas-not-found', url: location.href };
  }
  const timeLeftText = normalize(document.body?.innerText || '').match(/\b(\d{2}:\d{2})\b/)?.[1] || '';
  const [minutes, seconds] = timeLeftText.split(':').map(value => Number.parseInt(value, 10));
  const timeLeftSeconds = Number.isFinite(minutes) && Number.isFinite(seconds)
    ? (minutes * 60) + seconds
    : null;
  try {
    return {
      ok: true,
      url: location.href,
      dataUrl: qrCanvas.toDataURL('image/png'),
      timeLeftText,
      timeLeftSeconds,
      width: qrCanvas.width,
      height: qrCanvas.height
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      url: location.href
    };
  }
}
function fillTistoryPost(payload) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const isHtmlElement = element => {
    const view = element?.ownerDocument?.defaultView;
    return Boolean(view && element instanceof view.HTMLElement);
  };
  const visible = element => {
    if (!isHtmlElement(element)) return false;
    const style = (element.ownerDocument?.defaultView || window).getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const descriptorFor = object => object ? Object.getOwnPropertyDescriptor(object, 'value') : null;
  const setNativeValue = (element, value) => {
    const own = descriptorFor(element);
    const proto = descriptorFor(Object.getPrototypeOf(element));
    const setter = own?.set || proto?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const escapeHtml = value => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const fieldDescriptor = element => ({
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    className: normalize(element.className || '').slice(0, 120) || null,
    name: element.getAttribute('name'),
    placeholder: element.getAttribute('placeholder')
  });
  const scoreTitle = element => {
    const haystack = [
      element.getAttribute('name'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.id,
      element.className,
      element.getAttribute('data-placeholder'),
      element.getAttribute('title')
    ].map(normalize).join(' ');
    let score = 0;
    if (/제목|title|headline/i.test(haystack)) score += 10;
    if (element.matches('input[type="text"], input:not([type]), textarea')) score += 3;
    const rect = element.getBoundingClientRect();
    if (rect.y < 320) score += 2;
    if (rect.height <= 120) score += 1;
    return score;
  };
  const scoreBody = element => {
    const haystack = [
      element.getAttribute('name'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.id,
      element.className,
      element.getAttribute('data-placeholder'),
      element.getAttribute('title')
    ].map(normalize).join(' ');
    const rect = element.getBoundingClientRect();
    let score = rect.height > 180 ? 6 : rect.height > 80 ? 3 : 0;
    if (element.classList.contains('ProseMirror')) score += 10;
    if (element.isContentEditable) score += 4;
    if (/본문|내용|content|editor|article|write|story|post|markdown|html/i.test(haystack)) score += 6;
    return score;
  };
  const scoreTag = element => {
    const haystack = [
      element.getAttribute('name'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.id,
      element.className,
      element.getAttribute('data-placeholder')
    ].map(normalize).join(' ');
    return /태그|tag|keyword|label/i.test(haystack) ? 10 : 0;
  };
  const buildBodyHtml = input => {
    const blocks = [];
    if (input.heroImageDataUrl) {
      blocks.push(
        `<p><img src="${input.heroImageDataUrl}" alt="${escapeHtml(input.heroImageAlt || input.title || 'hero image')}" style="max-width:100%;height:auto;" /></p>`
      );
    }
    if (input.description) {
      blocks.push(`<p><strong>${escapeHtml(input.description)}</strong></p>`);
    }

    for (const part of String(input.body || '').split(/\n\n+/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const imageMatch = trimmed.match(/^!\[(.*?)\]\(([^\s)]+)\)$/i);
      if (imageMatch) {
        const [, alt, src] = imageMatch;
        const resolvedSrc = /^https?:/i.test(src) || /^data:/i.test(src)
          ? src
          : (input.bodyImageDataUrls?.[src] || src);
        blocks.push(`<p><img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(alt || input.title || 'source image')}" style="max-width:100%;height:auto;" /></p>`);
        continue;
      }

      const headingMatch = trimmed.match(/^(#{2,3})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(3, headingMatch[1].length);
        blocks.push(`<h${level}>${escapeHtml(headingMatch[2].trim())}</h${level}>`);
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        const items = trimmed.split(/\n/)
          .map(line => line.replace(/^[-*]\s+/, '').trim())
          .filter(Boolean)
          .map(item => `<li>${escapeHtml(item)}</li>`)
          .join('');
        if (items) blocks.push(`<ul>${items}</ul>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const items = trimmed.split(/\n/)
          .map(line => line.replace(/^\d+\.\s+/, '').trim())
          .filter(Boolean)
          .map(item => `<li>${escapeHtml(item)}</li>`)
          .join('');
        if (items) blocks.push(`<ol>${items}</ol>`);
        continue;
      }

      blocks.push(`<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`);
    }
    return blocks.join('') || '<p><br></p>';
  };
  const setContentEditable = (element, plainText, html) => {
    const ownerDocument = element.ownerDocument || document;
    const ownerWindow = ownerDocument.defaultView || window;
    element.focus();
    const selection = ownerWindow.getSelection?.();
    if (selection) {
      const range = ownerDocument.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    let inserted = false;
    try {
      inserted = ownerDocument.execCommand('insertText', false, plainText);
    } catch {
      inserted = false;
    }

    if (!inserted || normalize(element.innerText || '') !== normalize(plainText)) {
      element.innerHTML = html;
      const InputCtor = ownerWindow.InputEvent || InputEvent;
      const EventCtor = ownerWindow.Event || Event;
      element.dispatchEvent(new InputCtor('input', {
        bubbles: true,
        cancelable: true,
        data: plainText,
        inputType: 'insertText'
      }));
      element.dispatchEvent(new EventCtor('change', { bubbles: true }));
    }
  };
  const pickBest = (elements, scorer, exclude = new Set()) => elements
    .map(element => ({ element, score: exclude.has(element) ? -1 : scorer(element) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.element || null;
  const visibleFields = [
    ...Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror')),
    ...Array.from(document.querySelectorAll('iframe')).flatMap(frame => {
      if (!(frame instanceof HTMLIFrameElement)) return [];
      const doc = frame.contentDocument;
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror, body[contenteditable="true"]'));
    })
  ].filter(element => visible(element));
  const titleField = pickBest(visibleFields, scoreTitle);
  const excluded = new Set(titleField ? [titleField] : []);
  const bodyField = pickBest(visibleFields, scoreBody, excluded);
  if (bodyField) excluded.add(bodyField);
  const tagField = pickBest(visibleFields, scoreTag, excluded);
  const bodyHtml = buildBodyHtml(payload);

  const clickExactVisible = label => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], [role="option"], [role="menuitem"], [role="combobox"], li, label, span, div'))
      .filter(element => visible(element));
    const exact = candidates.find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '') === label);
    const fuzzy = candidates.find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '').includes(label));
    const target = exact || fuzzy;
    if (target) {
      target.click();
      return fieldDescriptor(target);
    }
    return null;
  };

  const setCategory = label => {
    if (!label) return { requested: '', applied: false, mode: 'skipped' };

    const selects = Array.from(document.querySelectorAll('select'))
      .filter(element => element instanceof HTMLSelectElement && visible(element));
    for (const select of selects) {
      const option = Array.from(select.options).find(item => normalize(item.textContent || item.label || '').includes(label));
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return { requested: label, applied: true, mode: 'select', value: option.value, text: normalize(option.textContent || option.label || '') };
      }
    }

    const combobox = Array.from(document.querySelectorAll('[role="combobox"], button, div'))
      .filter(element => visible(element))
      .find(element => /카테고리/.test(normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '')));
    if (combobox) {
      combobox.click();
      const clickedOption = clickExactVisible(label);
      if (clickedOption) {
        return { requested: label, applied: true, mode: 'combobox', target: clickedOption };
      }
    }

    const clicked = clickExactVisible(label);
    if (clicked) {
      return { requested: label, applied: true, mode: 'click', target: clicked };
    }

    return { requested: label, applied: false, mode: 'not-found' };
  };

  if (!titleField || !bodyField) {
    return {
      ok: false,
      reason: 'editor-not-ready',
      titleFound: Boolean(titleField),
      bodyFound: Boolean(bodyField),
      location: location.href
    };
  }

  if (titleField instanceof HTMLInputElement || titleField instanceof HTMLTextAreaElement) {
    setNativeValue(titleField, payload.title);
  } else {
    setContentEditable(titleField, payload.title, `<p>${escapeHtml(payload.title)}</p>`);
  }

  if (bodyField instanceof HTMLInputElement || bodyField instanceof HTMLTextAreaElement) {
    const textBody = [payload.description, payload.body].filter(Boolean).join('\n\n');
    setNativeValue(bodyField, textBody);
  } else {
    const plainBody = [payload.description, payload.body].filter(Boolean).join('\n\n');
    setContentEditable(bodyField, plainBody, bodyHtml);
  }

  if (payload.tags && tagField) {
    if (tagField instanceof HTMLInputElement || tagField instanceof HTMLTextAreaElement) {
      setNativeValue(tagField, payload.tags);
    } else {
      setContentEditable(tagField, payload.tags, `<p>${escapeHtml(payload.tags)}</p>`);
    }
  }

  const categoryResult = setCategory(payload.category);

  return {
    ok: true,
    titleField: fieldDescriptor(titleField),
    bodyField: fieldDescriptor(bodyField),
    tagField: tagField ? fieldDescriptor(tagField) : null,
    titleLength: payload.title.length,
    bodyLength: payload.body.length,
    tags: payload.tags || '',
    categoryResult,
    heroImageIncluded: Boolean(payload.heroImageDataUrl)
  };
}

function clickPublishButtons() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element));
  const targets = ['완료', '발행', '공개', '저장'];
  const clicked = [];

  for (const word of targets) {
    const button = buttons.find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '') === word)
      || buttons.find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '').includes(word));
    if (button) {
      button.click();
      clicked.push(word);
    }
  }

  return {
    clicked,
    url: location.href,
    title: document.title
  };
}

function ensureKakaoQrReady(options) {
  const deadline = Date.now() + Math.min(options.waitForLoginMs, 30000);
  let lastTistoryState = evaluate(detectTistoryState);
  let lastKakaoState = evaluate(detectKakaoLoginState);

  while (Date.now() < deadline) {
    if (lastTistoryState?.ready) {
      return {
        started: false,
        skipped: true,
        reason: 'already-authenticated',
        state: lastTistoryState
      };
    }

    if (lastKakaoState?.onQrPage) {
      evaluate(ensureKakaoStaySignedIn);
      const qrCapture = evaluate(captureKakaoQrData);
      if (qrCapture?.ok) {
        const qrImagePath = writeDataUrlFile(options.qrImagePath, qrCapture.dataUrl);
        return {
          started: true,
          method: 'kakao-qr',
          qrImagePath,
          qrState: qrCapture,
          kakaoState: lastKakaoState
        };
      }
    }

    if (lastKakaoState?.onKakaoHost) {
      evaluate(ensureKakaoStaySignedIn);
      const openedQr = evaluate(openKakaoQrLogin);
      if (openedQr?.clicked || openedQr?.alreadyOnQrPage) {
        wait(1500);
        lastTistoryState = evaluate(detectTistoryState);
        lastKakaoState = evaluate(detectKakaoLoginState);
        continue;
      }
    }

    if (lastTistoryState?.authKind === 'tistory-login') {
      const clickedLogin = evaluate(clickTistoryKakaoLogin);
      if (clickedLogin?.clicked) {
        wait(1500);
        lastTistoryState = evaluate(detectTistoryState);
        lastKakaoState = evaluate(detectKakaoLoginState);
        continue;
      }
    }

    wait(1000);
    lastTistoryState = evaluate(detectTistoryState);
    lastKakaoState = evaluate(detectKakaoLoginState);
  }

  return {
    started: false,
    skipped: false,
    reason: 'qr-login-not-reachable',
    lastTistoryState,
    lastKakaoState
  };
}

function refreshKakaoQrImage(options) {
  const kakaoState = evaluate(detectKakaoLoginState);
  if (!kakaoState?.onQrPage) {
    return null;
  }
  evaluate(ensureKakaoStaySignedIn);
  const refreshed = evaluate(refreshKakaoQr);
  if (!refreshed?.clicked) {
    return null;
  }
  wait(1200);
  const qrCapture = evaluate(captureKakaoQrData);
  if (!qrCapture?.ok) {
    return null;
  }
  return {
    qrImagePath: writeDataUrlFile(options.qrImagePath, qrCapture.dataUrl),
    qrState: qrCapture,
    kakaoState: evaluate(detectKakaoLoginState)
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const editorUrl = buildEditorUrl(options.blogUrl);

  if (!editorUrl) {
    throw new Error('TISTORY_BLOG_URL 또는 --blog-url 가 필요하다.');
  }

  if (!options.dryRun && (!options.title || !options.body)) {
    throw new Error('초안 작성에는 title 과 body 가 모두 필요하다.');
  }

  const heroImageDataUrl = options.heroImage ? toDataUrl(options.heroImage) : '';
  const bodyImageDataUrls = collectBodyImageDataUrls(options.body);
  ensureBrowserStarted({ headed: options.headed });
  navigate(editorUrl);

  const initialSnapshot = snapshot({ interactive: true, maxNodes: 30 });
  const initialState = evaluate(detectTistoryState);

  if (options.dryRun) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      editorUrl,
      initialState,
      snapshot: initialSnapshot,
      category: options.category,
      heroImage: options.heroImage || null,
      heroImageIncluded: Boolean(heroImageDataUrl),
      bodyImageCount: Object.keys(bodyImageDataUrls).length,
      qrImagePath: path.resolve(options.qrImagePath),
      qrEmailTo: options.qrEmailTo || null,
      qrEmailOnRefresh: options.qrEmailOnRefresh,
      qrEmailConfigured: hasQrEmailDelivery(options)
    }, null, 2));
    return;
  }

  let state = initialState;
  let deadline = Date.now() + options.waitForLoginMs;
  let redirectedBack = false;
  let qrLogin = null;
  let lastQrRefreshAt = 0;
  let lastQrEmailSignature = '';

  const maybeNotifyQrEmail = async (phase, payload) => {
    const signature = `${phase}:${payload?.qrState?.dataUrl?.slice(-64) || payload?.qrImagePath || ''}`;
    if (!signature || signature === lastQrEmailSignature) {
      return null;
    }
    lastQrEmailSignature = signature;
    return notifyQrEmail(options, payload.qrImagePath, phase, payload.qrState);
  };

  if (state.loginRequired) {
    qrLogin = ensureKakaoQrReady(options);
    if (qrLogin?.started) {
      console.log(`로그인이 필요하다. QR 코드를 저장했다: ${qrLogin.qrImagePath}`);
      if (hasQrEmailDelivery(options)) {
        await maybeNotifyQrEmail('initial', qrLogin);
      }
    } else if (!options.headed) {
      throw new Error(`QR 로그인 준비에 실패했다. 상태: ${JSON.stringify(qrLogin, null, 2)}`);
    } else {
      console.log('로그인이 필요하다. QR 로그인 준비에 실패해서 headed 브라우저에서 수동 로그인을 기다린다.');
    }
  }

  if (state.loginRequired) {
    deadline = Date.now() + options.waitForLoginMs;
  }

  while (!state.ready && Date.now() < deadline) {
    wait(2000);
    state = evaluate(detectTistoryState);

    if (state.loginRequired) {
      const recoveredQr = ensureKakaoQrReady({
        ...options,
        waitForLoginMs: Math.min(options.waitForLoginMs, 15000)
      });
      if (recoveredQr?.started) {
        qrLogin = recoveredQr;
        if (hasQrEmailDelivery(options)) {
          await maybeNotifyQrEmail('initial', recoveredQr);
        }
      }

      const kakaoState = evaluate(detectKakaoLoginState);
      if (kakaoState?.onQrPage && Number.isFinite(kakaoState.timeLeftSeconds) && kakaoState.timeLeftSeconds <= 15 && (Date.now() - lastQrRefreshAt) > 10000) {
        const refreshedQr = refreshKakaoQrImage(options);
        if (refreshedQr?.qrImagePath) {
          qrLogin = {
            started: true,
            method: 'kakao-qr',
            ...refreshedQr
          };
          lastQrRefreshAt = Date.now();
          console.log(`QR 코드를 갱신했다: ${refreshedQr.qrImagePath}`);
          if (hasQrEmailDelivery(options)) {
            await maybeNotifyQrEmail('refresh', qrLogin);
          }
        }
      }
    }

    if (!state.loginRequired && !state.ready && !redirectedBack) {
      navigate(editorUrl);
      redirectedBack = true;
      wait(1000);
      state = evaluate(detectTistoryState);
    }

    if (state.ready) break;
  }

  if (!state.ready) {
    throw new Error(`에디터를 찾지 못했다. 상태: ${JSON.stringify({ state, qrLogin }, null, 2)}`);
  }

  let fillResult = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    fillResult = evaluate(fillTistoryPost, {
      title: options.title,
      body: options.body,
      description: options.description,
      tags: options.tags,
      category: options.category,
      heroImageDataUrl,
      heroImageAlt: options.title,
      bodyImageDataUrls
    });
    if (fillResult?.ok) break;
    if (fillResult?.reason !== 'editor-not-ready') {
      throw new Error(`본문 채우기에 실패했다. 결과: ${JSON.stringify(fillResult, null, 2)}`);
    }
    wait(1500);
    state = evaluate(detectTistoryState);
    if (!state?.ready) {
      navigate(editorUrl);
      wait(1200);
    }
  }

  if (!fillResult?.ok) {
    throw new Error(`본문 채우기에 실패했다. 결과: ${JSON.stringify(fillResult, null, 2)}`);
  }

  let publishResult = null;
  if (options.publish) {
    wait(800);
    publishResult = evaluate(clickPublishButtons);
    wait(1200);
    publishResult = evaluate(clickPublishButtons);
  }

  console.log(JSON.stringify({
    mode: options.publish ? 'publish' : 'draft',
    editorUrl,
    finalState: evaluate(detectTistoryState),
    fillResult,
    publishResult,
    qrLogin
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
