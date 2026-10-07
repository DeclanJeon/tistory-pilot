import {
  ensureBrowserStarted,
  evaluate,
  navigate,
  stopBrowser,
  wait
} from '../../scripts/lib/agbrowse-cli.mjs';
import { sendQrEmail } from '../core/qr/email-service.mjs';
import {
  buildCategoryUrl,
  buildEditorUrl,
  collectBodyImageDataUrls,
  resolveOutputPath,
  toDataUrl,
  writeDataUrlFile
} from '../core/tistory/helpers.mjs';

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
    text: normalize(element.textContent || '').slice(0, 80) || null,
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
  const frameFields = Array.from(document.querySelectorAll('iframe')).slice(0, 4).flatMap(frame => {
    if (!(frame instanceof HTMLIFrameElement)) return [];
    const doc = frame.contentDocument;
    if (!doc) return [];
    return Array.from(doc.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror, body[contenteditable="true"]')).slice(0, 24);
  });
  const fields = [
    ...Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror')).slice(0, 48),
    ...frameFields
  ].filter(element => visible(element) && textLike(element));
  const titleCandidates = fields.map(element => ({ element, score: scoreTitle(element) })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(entry => ({ score: entry.score, ...summarize(entry.element) }));
  const bodyCandidates = fields.map(element => ({ element, score: scoreBody(element) })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map(entry => ({ score: entry.score, ...summarize(entry.element) }));
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]')).slice(0, 120).filter(element => element instanceof HTMLElement && visible(element)).map(element => normalize(element.getAttribute('aria-label') || element.textContent || '')).filter(Boolean);
  const bodyText = normalize(document.body?.textContent || '').slice(0, 4000);
  const onKakaoHost = /(^|\.)accounts\.kakao\.com$/i.test(location.host);
  const authKind = onKakaoHost ? (location.pathname.includes('/qr_login') ? 'kakao-qr' : 'kakao-login') : (location.pathname.includes('/auth/login') ? 'tistory-login' : 'editor');
  const loginRequired = authKind === 'kakao-login' || authKind === 'kakao-qr' || location.pathname.includes('/auth/login') || bodyText.includes('카카오계정으로 로그인') || buttons.some(text => text.includes('카카오계정으로 로그인'));
  return {
    url: location.href,
    title: document.title,
    host: location.host,
    authKind,
    loginRequired,
    ready: titleCandidates.length > 0 && bodyCandidates.length > 0,
    titleCandidates,
    bodyCandidates,
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
  const qrCanvas = Array.from(document.querySelectorAll('canvas')).find(element => element instanceof HTMLCanvasElement && visible(element));
  const timeLeftText = normalize(document.body?.innerText || '').match(/\b(\d{2}:\d{2})\b/)?.[1] || '';
  const [minutes, seconds] = timeLeftText.split(':').map(value => Number.parseInt(value, 10));
  const timeLeftSeconds = Number.isFinite(minutes) && Number.isFinite(seconds) ? (minutes * 60) + seconds : null;
  return {
    url: location.href,
    title: document.title,
    host: location.host,
    onKakaoHost: /(^|\.)accounts\.kakao\.com$/i.test(location.host),
    onQrPage: location.pathname.includes('/qr_login'),
    hasQrCanvas: Boolean(qrCanvas),
    timeLeftText,
    timeLeftSeconds
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
  const target = Array.from(document.querySelectorAll('a, button, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .find(element => /카카오계정으로 로그인/i.test(normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '')));
  if (!target) return { clicked: false };
  target.click();
  return { clicked: true };
}

function openKakaoQrLogin() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  if (location.pathname.includes('/qr_login')) return { clicked: false, alreadyOnQrPage: true };
  const target = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .find(element => /(log in with qr code|qr코드 로그인|qr 코드 로그인|qr login)/i.test(normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '')));
  if (!target) return { clicked: false };
  target.click();
  return { clicked: true };
}

function ensureKakaoStaySignedIn() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const checkbox = Array.from(document.querySelectorAll('input[type="checkbox"]'))
    .find(element => element instanceof HTMLInputElement && /Stay Logged In|로그인 상태 유지/i.test(normalize(element.closest('label, div, li')?.textContent || element.getAttribute('aria-label') || '')));
  if (!(checkbox instanceof HTMLInputElement)) {
    return { found: false };
  }
  if (!checkbox.checked) checkbox.click();
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
  if (!target) return { clicked: false };
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
  const qrCanvas = Array.from(document.querySelectorAll('canvas')).find(element => element instanceof HTMLCanvasElement && visible(element));
  if (!(qrCanvas instanceof HTMLCanvasElement)) return { ok: false, reason: 'qr-canvas-not-found' };
  const timeLeftText = normalize(document.body?.innerText || '').match(/\b(\d{2}:\d{2})\b/)?.[1] || '';
  const [minutes, seconds] = timeLeftText.split(':').map(value => Number.parseInt(value, 10));
  const timeLeftSeconds = Number.isFinite(minutes) && Number.isFinite(seconds) ? (minutes * 60) + seconds : null;
  return {
    ok: true,
    dataUrl: qrCanvas.toDataURL('image/png'),
    timeLeftText,
    timeLeftSeconds,
    width: qrCanvas.width,
    height: qrCanvas.height
  };
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
  const escapeHtml = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const looksLikeHtml = value => /<!doctype html|<html\b|<body\b|<[a-z][\s\S]*>/i.test(String(value || ''));
  const buildBodyHtml = input => {
    if (looksLikeHtml(input.body)) {
      const blocks = [];
      if (input.heroImageDataUrl) blocks.push(`<p><img src="${input.heroImageDataUrl}" alt="${escapeHtml(input.heroImageAlt || input.title || 'hero image')}" style="max-width:100%;height:auto;" /></p>`);
      if (input.description) blocks.push(`<p><strong>${escapeHtml(input.description)}</strong></p>`);
      blocks.push(String(input.body || '').trim());
      return blocks.join('') || '<p><br></p>';
    }

    const blocks = [];
    if (input.heroImageDataUrl) blocks.push(`<p><img src="${input.heroImageDataUrl}" alt="${escapeHtml(input.heroImageAlt || input.title || 'hero image')}" style="max-width:100%;height:auto;" /></p>`);
    if (input.description) blocks.push(`<p><strong>${escapeHtml(input.description)}</strong></p>`);
    for (const part of String(input.body || '').split(/\n\n+/)) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const imageMatch = trimmed.match(/^!\[(.*?)\]\(([^\s)]+)\)$/i);
      if (imageMatch) {
        const [, alt, src] = imageMatch;
        const resolvedSrc = /^https?:/i.test(src) || /^data:/i.test(src) ? src : (input.bodyImageDataUrls?.[src] || src);
        blocks.push(`<p><img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(alt || input.title || 'source image')}" style="max-width:100%;height:auto;" /></p>`);
        continue;
      }
      const headingMatch = trimmed.match(/^(#{2,3})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(3, headingMatch[1].length);
        blocks.push(`<h${level}>${escapeHtml(headingMatch[2].trim())}</h${level}>`);
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
      element.dispatchEvent(new InputCtor('input', { bubbles: true, cancelable: true, data: plainText, inputType: 'insertText' }));
      element.dispatchEvent(new EventCtor('change', { bubbles: true }));
    }
  };
  const pickBest = (elements, scorer, exclude = new Set()) => elements.map(element => ({ element, score: exclude.has(element) ? -1 : scorer(element) })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score)[0]?.element || null;
  const scoreTitle = element => {
    const haystack = [element.getAttribute('name'), element.getAttribute('placeholder'), element.getAttribute('aria-label'), element.id, element.className, element.getAttribute('data-placeholder'), element.getAttribute('title')].map(normalize).join(' ');
    let score = 0;
    if (/제목|title|headline/i.test(haystack)) score += 10;
    if (element.matches('input[type="text"], input:not([type]), textarea')) score += 3;
    return score;
  };
  const scoreBody = element => {
    const haystack = [element.getAttribute('name'), element.getAttribute('placeholder'), element.getAttribute('aria-label'), element.id, element.className, element.getAttribute('data-placeholder'), element.getAttribute('title')].map(normalize).join(' ');
    let score = 0;
    if (element.classList.contains('ProseMirror')) score += 10;
    if (element.isContentEditable) score += 4;
    if (/본문|내용|content|editor|article|write|story|post|markdown|html/i.test(haystack)) score += 6;
    return score;
  };
  const fields = [
    ...Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror')),
    ...Array.from(document.querySelectorAll('iframe')).flatMap(frame => {
      if (!(frame instanceof HTMLIFrameElement)) return [];
      const doc = frame.contentDocument;
      if (!doc) return [];
      return Array.from(doc.querySelectorAll('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], .ProseMirror, body[contenteditable="true"]'));
    })
  ].filter(element => visible(element));
  const titleField = pickBest(fields, scoreTitle);
  const bodyField = pickBest(fields, scoreBody, new Set(titleField ? [titleField] : []));
  if (!titleField || !bodyField) return { ok: false, reason: 'editor-not-ready' };
  if (titleField instanceof HTMLInputElement || titleField instanceof HTMLTextAreaElement) setNativeValue(titleField, payload.title);
  else setContentEditable(titleField, payload.title, `<p>${escapeHtml(payload.title)}</p>`);
  if (bodyField instanceof HTMLInputElement || bodyField instanceof HTMLTextAreaElement) setNativeValue(bodyField, [payload.description, payload.body].filter(Boolean).join('\n\n'));
  else setContentEditable(bodyField, [payload.description, payload.body].filter(Boolean).join('\n\n'), buildBodyHtml(payload));
  return { ok: true, titleLength: payload.title.length, bodyLength: payload.body.length };
}

function clickPublishButtons() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '');
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter(element => element instanceof HTMLElement && visible(element));
  const clicked = [];
  for (const word of ['공개 발행', '발행', '공개', '완료']) {
    const button = buttons.find(element => textOf(element) === word) || buttons.find(element => textOf(element).includes(word));
    if (button) {
      button.click();
      clicked.push({ target: word, text: textOf(button) });
      break;
    }
  }
  return { clicked, url: location.href, title: document.title };
}

function detectAdminState() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const bodyText = normalize(document.body?.innerText || '');
  return {
    url: location.href,
    loginRequired: /카카오계정으로 로그인|로그인/.test(bodyText),
    categoryTexts: Array.from(document.querySelectorAll('li, td, th, span, strong, em, button, a, label, div')).filter(element => element instanceof HTMLElement && visible(element)).map(element => normalize(element.innerText || element.textContent || '')).filter(Boolean).slice(0, 100),
    bodyPreview: bodyText.slice(0, 240)
  };
}

function ensureCategoryExists(payload) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '');
  const requested = normalize(payload?.category || '');
  if (!requested) return { ok: false, reason: 'missing-category' };
  const textNodes = Array.from(document.querySelectorAll('li, td, th, span, strong, em, button, a, label, div')).filter(element => element instanceof HTMLElement && visible(element));
  const matched = textNodes.find(element => {
    const text = textOf(element);
    return text === requested || (text && text.includes(requested));
  });
  if (matched) return { ok: true, requested, existed: true, created: false };
  return { ok: false, requested, created: false, reason: 'category-ui-not-found' };
}

async function maybeSendQrEmail(config, options, qrLogin) {
  if (!options.qrEmailRecipient) return null;
  return sendQrEmail({
    config,
    blogUrl: options.blogUrl,
    recipient: options.qrEmailRecipient,
    filePath: qrLogin.qrImagePath,
    phase: qrLogin.phase || 'initial',
    qrState: qrLogin.qrState,
    context: options.context || 'tistory'
  });
}

function summarizeQrLogin(qrLogin) {
  if (!qrLogin) return null;
  return {
    started: Boolean(qrLogin.started),
    method: qrLogin.method || null,
    phase: qrLogin.phase || null,
    qrImagePath: qrLogin.qrImagePath ? resolveOutputPath(qrLogin.qrImagePath) : null,
    timeLeftSeconds: qrLogin.qrState?.timeLeftSeconds || null,
    confirmedAt: qrLogin.confirmedAt || null
  };
}



function ensureKakaoQrReady(options) {
  const deadline = Date.now() + Math.min(options.waitForLoginMs, 30000);
  let lastTistoryState = evaluate(detectTistoryState);
  let lastKakaoState = evaluate(detectKakaoLoginState);
  while (Date.now() < deadline) {
    if (lastTistoryState?.ready) return { started: false, skipped: true, reason: 'already-authenticated', state: lastTistoryState };
    if (lastKakaoState?.onQrPage) {
      evaluate(ensureKakaoStaySignedIn);
      const qrCapture = evaluate(captureKakaoQrData);
      if (qrCapture?.ok) {
        const qrImagePath = writeDataUrlFile(options.qrImagePath, qrCapture.dataUrl);
        return { started: true, method: 'kakao-qr', qrImagePath, qrState: qrCapture, kakaoState: lastKakaoState };
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
  return { started: false, skipped: false, reason: 'qr-login-not-reachable', lastTistoryState, lastKakaoState };
}

function refreshKakaoQrImage(options) {
  const kakaoState = evaluate(detectKakaoLoginState);
  if (!kakaoState?.onQrPage) return null;
  evaluate(ensureKakaoStaySignedIn);
  const refreshed = evaluate(refreshKakaoQr);
  if (!refreshed?.clicked) return null;
  wait(1200);
  const qrCapture = evaluate(captureKakaoQrData);
  if (!qrCapture?.ok) return null;
  return { qrImagePath: writeDataUrlFile(options.qrImagePath, qrCapture.dataUrl), qrState: qrCapture, kakaoState: evaluate(detectKakaoLoginState) };
}

function openEditorAndDetect(editorUrl, options) {
  let recovered = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    navigate(editorUrl, { waitUntil: 'commit', timeoutMs: 15000 });
    wait(2500);
    const state = evaluate(detectTistoryState);
    if (state?.url && state.url !== 'about:blank') {
      return state;
    }
    if (!recovered) {
      stopBrowser();
      ensureBrowserStarted({ headed: options.headed });
      recovered = true;
    }
  }
  return evaluate(detectTistoryState);
}

function reopenEditorIfBlank(editorUrl, state, options) {
  if (state?.url && state.url !== 'about:blank') return state;
  return openEditorAndDetect(editorUrl, options);
}

export function createAgbrowseAutomation({ qrEmailConfig = null, onQr = null } = {}) {
  return {
    async publishPost(options) {
      const qrHook = options.onQr || onQr;
      const qrResolvedHook = options.onQrResolved || null;
      const editorUrl = buildEditorUrl(options.blogUrl);
      if (!editorUrl) throw new Error('blogUrl is required.');
      const heroImageDataUrl = options.heroImagePath ? toDataUrl(options.heroImagePath) : '';
      const bodyImageDataUrls = collectBodyImageDataUrls(options.body || '');
      ensureBrowserStarted({ headed: options.headed });
      let state = openEditorAndDetect(editorUrl, options);
      const deadline = Date.now() + options.waitForLoginMs;
      let qrLogin = null;
      let lastQrRefreshAt = 0;
      let qrResolvedAt = null;

      if (state.loginRequired) {
        qrLogin = ensureKakaoQrReady(options);
        if (qrLogin?.started) {
          qrLogin.phase = 'initial';
          if (qrHook) await qrHook(qrLogin);
          if (qrEmailConfig) await maybeSendQrEmail(qrEmailConfig, options, qrLogin);
          lastQrRefreshAt = Date.now();
        }
      }

      while (!state.ready && Date.now() < deadline) {
        wait(2000);
        state = reopenEditorIfBlank(editorUrl, evaluate(detectTistoryState), options);
        if (state.loginRequired) {
          const kakaoState = evaluate(detectKakaoLoginState);
          if (kakaoState?.onQrPage && Number.isFinite(kakaoState.timeLeftSeconds) && kakaoState.timeLeftSeconds <= 15 && (Date.now() - lastQrRefreshAt) > 10000) {
            const refreshedQr = refreshKakaoQrImage(options);
            if (refreshedQr?.qrImagePath) {
              qrLogin = { started: true, method: 'kakao-qr', phase: 'refresh', ...refreshedQr };
              lastQrRefreshAt = Date.now();
              if (qrHook) await qrHook(qrLogin);
              if (qrEmailConfig) await maybeSendQrEmail(qrEmailConfig, options, qrLogin);
            }
          }
          continue;
        }
        if (!qrResolvedAt && qrLogin?.started) {
          qrResolvedAt = new Date().toISOString();
          qrLogin.confirmedAt = qrResolvedAt;
          if (qrResolvedHook) {
            await qrResolvedHook({ confirmedAt: qrResolvedAt, method: qrLogin.method || 'kakao-qr' });
          }
        }
        if (state.ready) break;
        state = openEditorAndDetect(editorUrl, options);
      }
      if (!state.ready) throw new Error(`에디터를 찾지 못했다: ${JSON.stringify({ state, qrLogin: summarizeQrLogin(qrLogin) })}`);


      const fillResult = evaluate(fillTistoryPost, {
        title: options.title,
        body: options.body,
        description: options.description,
        heroImageDataUrl,
        heroImageAlt: options.title,
        bodyImageDataUrls
      });
      if (!fillResult?.ok) throw new Error(`본문 채우기에 실패했다: ${JSON.stringify(fillResult)}`);
      let publishResult = null;
      if (options.publish !== false) {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          wait(900);
          publishResult = evaluate(clickPublishButtons);
          if (!publishResult?.clicked?.length) break;
        }
      }
      return {
        mode: options.publish === false ? 'draft' : 'publish',
        editorUrl,
        finalState: evaluate(detectTistoryState),
        fillResult,
        publishResult,
        qrLogin: summarizeQrLogin(qrLogin),
        qrImagePath: resolveOutputPath(options.qrImagePath)
      };

    },

    async ensureCategory(options) {
      const qrHook = options.onQr || onQr;
      const qrResolvedHook = options.onQrResolved || null;
      const categoryUrl = buildCategoryUrl(options.blogUrl);
      if (!categoryUrl) throw new Error('blogUrl is required.');
      ensureBrowserStarted({ headed: options.headed });
      navigate(categoryUrl);
      let state = evaluate(detectAdminState);
      let qrLogin = null;
      let qrResolvedAt = null;
      if (state.loginRequired) {
        qrLogin = ensureKakaoQrReady(options);
        if (qrLogin?.started) {
          qrLogin.phase = 'initial';
          if (qrHook) await qrHook(qrLogin);
          if (qrEmailConfig) await maybeSendQrEmail(qrEmailConfig, options, qrLogin);
        }
      }
      const deadline = Date.now() + options.waitForLoginMs;
      while (state.loginRequired && Date.now() < deadline) {
        wait(2000);
        state = evaluate(detectAdminState);
        if (!state.loginRequired) {
          if (!qrResolvedAt && qrLogin?.started) {
            qrResolvedAt = new Date().toISOString();
            qrLogin.confirmedAt = qrResolvedAt;
            if (qrResolvedHook) {
              await qrResolvedHook({ confirmedAt: qrResolvedAt, method: qrLogin.method || 'kakao-qr' });
            }
          }
          navigate(categoryUrl);
          wait(1200);
          state = evaluate(detectAdminState);
          break;
        }
      }
      if (state.loginRequired) {
        throw new Error(`카테고리 화면 로그인 해제 실패: ${JSON.stringify({ state, qrLogin: summarizeQrLogin(qrLogin) })}`);
      }
      const ensureResult = evaluate(ensureCategoryExists, { category: options.category });
      const finalState = evaluate(detectAdminState);
      if (!ensureResult?.ok) {
        throw new Error(`카테고리 보장 실패: ${JSON.stringify({ ensureResult, finalState, qrLogin: summarizeQrLogin(qrLogin) })}`);
      }
      return {
        categoryUrl,
        category: options.category,
        finalState,
        ensureResult,
        qrLogin: summarizeQrLogin(qrLogin),
        qrImagePath: resolveOutputPath(options.qrImagePath)
      };
    }
  };
}
