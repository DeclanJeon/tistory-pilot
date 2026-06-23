import { DOMParser } from 'linkedom';
import { chromium } from 'playwright-core';
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

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function looksLikeHtml(value) {
  return /<!doctype html|<html\b|<body\b|<[a-z][\s\S]*>/i.test(String(value || ''));
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizeResolvedSrc(src, bodyImageDataUrls = {}) {
  const resolved = String(src || '').trim();
  if (!resolved) return '';
  if (/^https?:/i.test(resolved) || /^data:/i.test(resolved)) return resolved;
  return String(bodyImageDataUrls?.[resolved] || '').trim();
}

function removeNodes(root, selector) {
  for (const element of root.querySelectorAll(selector)) {
    element.remove();
  }
}

function unwrapElement(element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  element.remove();
}

function sanitizeHtmlDocumentBody(input) {
  const document = new DOMParser().parseFromString(String(input.body || ''), 'text/html');
  const root = document.querySelector('article.post, main article, article, main, body');
  if (!root) return '';

  removeNodes(root, 'script, style, noscript, iframe, nav, aside, footer, template, form');
  removeNodes(root, '.related, .footer, .share, .adsbygoogle');
  removeNodes(root, '.eyebrow, .meta');

  for (const section of root.querySelectorAll('section')) {
    const heading = normalizeSpace(section.querySelector('h1, h2, h3')?.textContent || '');
    if (/^함께 읽을 글$/i.test(heading)) {
      section.remove();
      continue;
    }
    if (/^파일명:/i.test(normalizeSpace(section.textContent || ''))) {
      section.remove();
    }
  }

  for (const element of root.querySelectorAll('p, div, li')) {
    if (/^파일명:/i.test(normalizeSpace(element.textContent || ''))) {
      element.remove();
    }
  }

  for (const heading of root.querySelectorAll('h1')) {
    heading.remove();
  }

  const allowedTags = new Set(['A', 'BLOCKQUOTE', 'BR', 'CODE', 'EM', 'FIGCAPTION', 'FIGURE', 'H2', 'H3', 'HR', 'IMG', 'LI', 'OL', 'P', 'PRE', 'STRONG', 'UL']);
  const unwrapTags = new Set(['ARTICLE', 'BODY', 'DIV', 'HEADER', 'MAIN', 'SECTION', 'SPAN']);

  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (!allowedTags.has(element.tagName) && unwrapTags.has(element.tagName)) {
      unwrapElement(element);
      continue;
    }
    if (!allowedTags.has(element.tagName) && !unwrapTags.has(element.tagName)) {
      unwrapElement(element);
      continue;
    }

    const attrs = Array.from(element.attributes).map(attribute => ({ name: attribute.name, value: attribute.value }));
    for (const attribute of attrs) {
      element.removeAttribute(attribute.name);
    }

    if (element.tagName === 'A') {
      const href = String(attrs.find(attribute => attribute.name === 'href')?.value || '').trim();
      if (/^https?:/i.test(href) || /^mailto:/i.test(href)) {
        element.setAttribute('href', href);
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      } else {
        unwrapElement(element);
      }
      continue;
    }

    if (element.tagName === 'IMG') {
      const rawSrc = attrs.find(attribute => attribute.name === 'src')?.value || '';
      const rawAlt = attrs.find(attribute => attribute.name === 'alt')?.value || '';
      const resolvedSrc = sanitizeResolvedSrc(rawSrc, input.bodyImageDataUrls);
      if (!resolvedSrc) {
        element.remove();
        continue;
      }
      element.setAttribute('src', resolvedSrc);
      element.setAttribute('alt', normalizeSpace(rawAlt || input.title || 'image'));
      continue;
    }
  }

  for (const figure of root.querySelectorAll('figure')) {
    if (!figure.querySelector('img')) figure.remove();
  }

  return root.innerHTML
    .replace(/<!--[^]*?-->/g, '')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export function buildTistoryBodyHtml(input) {
  if (looksLikeHtml(input.body)) {
    const sanitized = sanitizeHtmlDocumentBody(input);
    if (sanitized) return sanitized;
    const fallback = [];
    if (input.heroImageDataUrl) fallback.push(`<p><img src="${input.heroImageDataUrl}" alt="${escapeHtml(input.heroImageAlt || input.title || 'hero image')}" style="max-width:100%;height:auto;" /></p>`);
    if (input.description) fallback.push(`<p>${escapeHtml(input.description)}</p>`);
    return fallback.join('') || '<p><br></p>';
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
}

async function fillTistoryPostOnPage(page, payload) {
  const titleField = page.locator('#post-title-inp');
  if (!await titleField.count()) return { ok: false, reason: 'title-field-not-found' };
  await titleField.click();
  await titleField.fill(String(payload.title || ''));
  await titleField.blur().catch(() => {});
  const result = await page.evaluate(({ title, bodyHtml }) => {
    const editor = window.tinymce?.activeEditor;
    const titleFieldInner = document.getElementById('post-title-inp');
    if (!titleFieldInner || !editor || typeof editor.setContent !== 'function') {
      return { ok: false, reason: 'editor-not-ready' };
    }
    editor.focus();
    editor.setContent(bodyHtml || '<p><br></p>');
    editor.fire('input');
    editor.fire('change');
    editor.save?.();
    return {
      ok: true,
      titleLength: String(title || '').length,
      bodyLength: (bodyHtml || '').length,
      titleClassName: titleFieldInner.className || '',
      bodyTextLength: String(editor.getContent?.({ format: 'text' }) || '').trim().length,
      bodyHtmlLength: String(editor.getContent?.() || '').length
    };
  }, {
    title: payload.title,
    bodyHtml: payload.bodyHtml
  });
  return result;
}

async function selectCategoryOnPage(page, requested) {
  const normalized = String(requested || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return { ok: true, skipped: true };
  const button = page.locator('#category-btn');
  if (!await button.count()) return { ok: false, reason: 'category-button-not-found', requested: normalized };
  await button.click();
  await page.waitForTimeout(300);
  const result = await page.evaluate(requestedValue => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const requestedNormalized = normalize(requestedValue);
    const options = Array.from(document.querySelectorAll('#category-list [id^="category-item-"]')).filter(visible);
    const exact = options.find(option => normalize(option.innerText || option.textContent || '') === requestedNormalized);
    const partial = options.find(option => normalize(option.innerText || option.textContent || '').includes(requestedNormalized));
    const target = exact || partial;
    if (!target) {
      return {
        ok: false,
        reason: 'category-option-not-found',
        requested: requestedNormalized,
        available: options.map(option => normalize(option.innerText || option.textContent || '')).filter(Boolean).slice(0, 40)
      };
    }
    target.click();
    const buttonInner = document.getElementById('category-btn');
    return {
      ok: true,
      requested: requestedNormalized,
      selectedText: normalize(target.innerText || target.textContent || ''),
      buttonText: normalize(buttonInner?.innerText || buttonInner?.textContent || '')
    };
  }, normalized);
  await page.waitForTimeout(250);
  return result;
}

async function setTagsOnPage(page, tags) {
  const values = Array.isArray(tags)
    ? tags.map(tag => String(tag || '').trim()).filter(Boolean)
    : String(tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
  if (!values.length) return { ok: true, skipped: true, added: [] };
  const input = page.locator('#tagText');
  if (!await input.count()) return { ok: false, reason: 'tag-input-not-found', requested: values };
  const added = [];
  for (const tag of values) {
    await input.click();
    await input.fill(tag);
    await input.press('Enter');
    added.push(tag);
    await page.waitForTimeout(120);
  }
  return { ok: true, added };
}

async function openPublishLayerOnPage(page) {
  const button = page.locator('#publish-layer-btn');
  if (!await button.count()) return { ok: false, reason: 'publish-layer-button-not-found' };
  await button.click();
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => ({
    ok: Boolean(document.getElementById('publish-btn')),
    modalOpen: Boolean(document.getElementById('publish-btn')),
    publishText: String(document.getElementById('publish-btn')?.innerText || '').trim() || null,
    cancelText: String(document.getElementById('unpublish-btn')?.innerText || '').trim() || null,
    layerText: String(document.querySelector('.ReactModal__Content')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400)
  }));
  return result;
}

async function confirmPublishOnPage(page) {
  const button = page.locator('#publish-btn');
  if (!await button.count()) return { ok: false, reason: 'publish-confirm-button-not-found' };
  const text = (await button.innerText().catch(() => '')).trim();
  await button.click();
  let modalClosed = false;
  try {
    await page.waitForFunction(() => !document.getElementById('publish-btn'), null, { timeout: 15000 });
    modalClosed = true;
  } catch {
    modalClosed = false;
  }
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    modalOpenAfter: Boolean(document.getElementById('publish-btn')),
    publishTextAfter: String(document.getElementById('publish-btn')?.innerText || '').trim() || null,
    bodyPreview: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400)
  }));
  return {
    ok: modalClosed || !state.modalOpenAfter,
    clicked: [{ target: 'publish-btn', text }],
    modalClosed,
    ...state
  };
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

function getCdpUrl() {
  return `http://127.0.0.1:${process.env.CDP_PORT || '9222'}`;
}

async function connectManagedPage() {
  const browser = await chromium.connectOverCDP(getCdpUrl(), { timeout: 30000 });
  let context = browser.contexts()[0] || null;
  if (!context) context = await browser.newContext();
  let page = context.pages().find(candidate => candidate.url() && candidate.url() !== 'about:blank') || context.pages()[0] || null;
  if (!page) page = await context.newPage();
  return { browser, page };
}

async function evalOnPage(page, pageFunction, payload) {
  if (typeof payload === 'undefined') return page.evaluate(pageFunction);
  return page.evaluate(pageFunction, payload);
}

async function ensureKakaoQrReadyOnPage(page, options) {
  const deadline = Date.now() + Math.min(options.waitForLoginMs, 30000);
  let lastTistoryState = await evalOnPage(page, detectTistoryState);
  let lastKakaoState = await evalOnPage(page, detectKakaoLoginState);
  while (Date.now() < deadline) {
    if (lastTistoryState?.ready) return { started: false, skipped: true, reason: 'already-authenticated', state: lastTistoryState };
    if (lastKakaoState?.onQrPage) {
      await evalOnPage(page, ensureKakaoStaySignedIn);
      const qrCapture = await evalOnPage(page, captureKakaoQrData);
      if (qrCapture?.ok) {
        const qrImagePath = writeDataUrlFile(options.qrImagePath, qrCapture.dataUrl);
        return { started: true, method: 'kakao-qr', qrImagePath, qrState: qrCapture, kakaoState: lastKakaoState };
      }
    }
    if (lastKakaoState?.onKakaoHost) {
      await evalOnPage(page, ensureKakaoStaySignedIn);
      const openedQr = await evalOnPage(page, openKakaoQrLogin);
      if (openedQr?.clicked || openedQr?.alreadyOnQrPage) {
        await page.waitForTimeout(1500);
        lastTistoryState = await evalOnPage(page, detectTistoryState);
        lastKakaoState = await evalOnPage(page, detectKakaoLoginState);
        continue;
      }
    }
    if (lastTistoryState?.authKind === 'tistory-login') {
      const clickedLogin = await evalOnPage(page, clickTistoryKakaoLogin);
      if (clickedLogin?.clicked) {
        await page.waitForTimeout(1500);
        lastTistoryState = await evalOnPage(page, detectTistoryState);
        lastKakaoState = await evalOnPage(page, detectKakaoLoginState);
        continue;
      }
    }
    await page.waitForTimeout(1000);
    lastTistoryState = await evalOnPage(page, detectTistoryState);
    lastKakaoState = await evalOnPage(page, detectKakaoLoginState);
  }
  return { started: false, skipped: false, reason: 'qr-login-not-reachable', lastTistoryState, lastKakaoState };
}

async function refreshKakaoQrImageOnPage(page, options) {
  const kakaoState = await evalOnPage(page, detectKakaoLoginState);
  if (!kakaoState?.onQrPage) return null;
  await evalOnPage(page, ensureKakaoStaySignedIn);
  const refreshed = await evalOnPage(page, refreshKakaoQr);
  if (!refreshed?.clicked) return null;
  await page.waitForTimeout(1200);
  const qrCapture = await evalOnPage(page, captureKakaoQrData);
  if (!qrCapture?.ok) return null;
  return { qrImagePath: writeDataUrlFile(options.qrImagePath, qrCapture.dataUrl), qrState: qrCapture, kakaoState: await evalOnPage(page, detectKakaoLoginState) };
}

async function openEditorAndDetectOnPage(page, editorUrl) {
  await page.goto(editorUrl, { waitUntil: 'commit', timeout: 15000 });
  const deadline = Date.now() + 30000;
  let state = await evalOnPage(page, detectTistoryState);
  while ((!state?.ready && state?.url !== 'about:blank') && Date.now() < deadline) {
    await page.waitForTimeout(1500);
    state = await evalOnPage(page, detectTistoryState);
    if (state?.loginRequired) break;
  }
  return state;
}

async function reopenEditorIfBlankOnPage(page, editorUrl, state) {
  if (state?.url && state.url !== 'about:blank') return state;
  return openEditorAndDetectOnPage(page, editorUrl);
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
      const { browser, page } = await connectManagedPage();
      try {
        let state = await openEditorAndDetectOnPage(page, editorUrl);
        const deadline = Date.now() + options.waitForLoginMs;
        let qrLogin = null;
        let lastQrRefreshAt = 0;
        let qrResolvedAt = null;

        if (state.loginRequired) {
          qrLogin = await ensureKakaoQrReadyOnPage(page, options);
          if (qrLogin?.started) {
            qrLogin.phase = 'initial';
            if (qrHook) await qrHook(qrLogin);
            if (qrEmailConfig) await maybeSendQrEmail(qrEmailConfig, options, qrLogin);
            lastQrRefreshAt = Date.now();
          }
        }

        while (!state.ready && Date.now() < deadline) {
          await page.waitForTimeout(2000);
          state = await reopenEditorIfBlankOnPage(page, editorUrl, await evalOnPage(page, detectTistoryState));
          if (state.loginRequired) {
            const kakaoState = await evalOnPage(page, detectKakaoLoginState);
            if (kakaoState?.onQrPage && Number.isFinite(kakaoState.timeLeftSeconds) && kakaoState.timeLeftSeconds <= 15 && (Date.now() - lastQrRefreshAt) > 10000) {
              const refreshedQr = await refreshKakaoQrImageOnPage(page, options);
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
          state = await openEditorAndDetectOnPage(page, editorUrl);
        }
        if (!state.ready) throw new Error(`에디터를 찾지 못했다: ${JSON.stringify({ state, qrLogin: summarizeQrLogin(qrLogin) })}`);

const bodyHtml = buildTistoryBodyHtml({
  title: options.title,
  body: options.body,
  description: options.description,
  heroImageDataUrl,
  heroImageAlt: options.title,
  bodyImageDataUrls
});
let fillResult = null;
for (let attempt = 0; attempt < 6; attempt += 1) {
  fillResult = await fillTistoryPostOnPage(page, {
    title: options.title,
    bodyHtml
  });
  if (fillResult?.ok && fillResult.bodyTextLength > 0) break;
  await page.waitForTimeout(1500);
  state = await openEditorAndDetectOnPage(page, editorUrl);
}
if (!fillResult?.ok) throw new Error(`본문 채우기에 실패했다: ${JSON.stringify(fillResult)}`);
const categoryResult = await selectCategoryOnPage(page, options.category);
if (!categoryResult?.ok) throw new Error(`카테고리를 선택하지 못했다: ${JSON.stringify(categoryResult)}`);
const tagResult = await setTagsOnPage(page, options.tags);
if (!tagResult?.ok) throw new Error(`태그를 입력하지 못했다: ${JSON.stringify(tagResult)}`);
let publishResult = null;
if (options.publish !== false) {
  let publishLayerResult = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    publishLayerResult = await openPublishLayerOnPage(page);
    if (publishLayerResult?.modalOpen) break;
    await page.waitForTimeout(800);
    fillResult = await fillTistoryPostOnPage(page, {
      title: options.title,
      bodyHtml
    });
  }
  if (!publishLayerResult?.modalOpen) {
    throw new Error(`발행 레이어를 열지 못했다: ${JSON.stringify(publishLayerResult)}`);
  }
  publishResult = {
    ...publishLayerResult,
    ...(await confirmPublishOnPage(page))
  };
  if (!publishResult?.ok) {
    throw new Error(`발행 확인에 실패했다: ${JSON.stringify(publishResult)}`);
  }
}
return {
  mode: options.publish === false ? 'draft' : 'publish',
  editorUrl,
  finalState: await evalOnPage(page, detectTistoryState),
  fillResult,
  categoryResult,
  tagResult,
  publishResult,
  qrLogin: summarizeQrLogin(qrLogin),
  qrImagePath: resolveOutputPath(options.qrImagePath)
};
      } finally {
        await browser.close().catch(() => {});
      }
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
