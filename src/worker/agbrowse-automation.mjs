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
  buildManagePostUrl,
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
  const buildNavigateUrl = input => {
    const nextUrl = new URL(String(input || location.href), location.href);
    nextUrl.pathname = '/qr_login/';
    nextUrl.searchParams.set('append_stay_signed_in', 'false');
    nextUrl.searchParams.set('lang', 'en');
    nextUrl.searchParams.set('showHeader', 'false');
    nextUrl.searchParams.set('stay_signed_in', 'false');
    nextUrl.hash = 'main';
    return nextUrl.toString();
  };
  if (location.pathname.includes('/qr_login')) return { clicked: false, alreadyOnQrPage: true, url: location.href };
  const target = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .find(element => /(log in with qr code|qr코드 로그인|qr 코드 로그인|qr login)/i.test(normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '')));
  const navigateUrl = target instanceof HTMLAnchorElement && target.href
    ? target.href
    : buildNavigateUrl(location.href);
  if (!target) return { clicked: false, reason: 'qr-login-button-not-found', navigateUrl, url: location.href };
  target.click();
  return { clicked: true, navigateUrl, url: location.href };
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

function detectKakaoQrExpired() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const bodyText = normalize(document.body?.innerText || '');
  return /(login time expired|만료되었|다시 시작해 주세요|try again from the beginning)/i.test(bodyText);
}

function restartKakaoQrLogin() {
  // 만료 화면의 "Confirm / 다시 시작" 버튼을 눌러 QR 로그인 플로우를 새로 시작한다.
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const target = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .find(element => /(confirm|다시 시작|처음부터 다시|try again)/i.test(normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '')));
  if (!target) return { clicked: false };
  target.click();
  return { clicked: true, text: normalize(target.innerText || target.textContent || '') };
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

function isReadyTistoryHtml(value) {
  const html = String(value || '');
  if (!looksLikeHtml(html)) return false;
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const pCount = (html.match(/<p\b/gi) || []).length;
  const hCount = (html.match(/<h[1-3]\b/gi) || []).length;
  // Already-authored HTML posts should not be aggressively sanitized.
  return plain.length >= 800 && (pCount >= 4 || hCount >= 3 || /font-size\s*:\s*16px/i.test(html));
}

export function buildTistoryBodyHtml(input) {
  const rawBody = String(input.body || '');
  // Full HTML posts from generate-post should pass through with light cleanup only.
  if (isReadyTistoryHtml(rawBody)) {
    return rawBody
      .replace(/<!doctype html>/ig, '')
      .replace(/<\/?html[^>]*>/ig, '')
      .replace(/<\/?head[^>]*>[\s\S]*?<\/head>/ig, '')
      .replace(/<\/?body[^>]*>/ig, '')
      .trim();
  }
  if (looksLikeHtml(rawBody)) {
    const sanitized = sanitizeHtmlDocumentBody(input);
    if (sanitized) return sanitized;
    if (rawBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length >= 400) {
      return rawBody.trim();
    }
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
  const normalizedTitle = String(payload.title || '');
await titleField.click({ clickCount: 3 });
await page.keyboard.press('Backspace').catch(() => {});
await page.keyboard.type(normalizedTitle, { delay: 10 });
await titleField.evaluate((element, value) => {
  if (!(element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement)) return;
  const proto = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Process' }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}, normalizedTitle);
  await titleField.blur().catch(() => {});
  const result = await page.evaluate(({ title, bodyHtml }) => {
    const editor = window.tinymce?.activeEditor;
    const titleFieldInner = document.getElementById('post-title-inp');
    if (!titleFieldInner || !editor || typeof editor.setContent !== 'function') {
      return { ok: false, reason: 'editor-not-ready' };
    }
    const contentHtml = bodyHtml || '<p><br></p>';
    editor.focus();
    editor.undoManager?.clear?.();
    // Prefer html format; some Tistory skins drop nested styled blocks with raw.
    try {
      editor.setContent(contentHtml, { format: 'html' });
    } catch {
      editor.setContent(contentHtml);
    }
    // Ensure underlying textarea keeps full HTML for submit payloads.
    try {
      const textarea = editor.getElement?.();
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.value = contentHtml;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } catch {}
    editor.setDirty?.(true);
    editor.nodeChanged?.();
    editor.fire('input');
    editor.fire('change');
    editor.fire('keyup');
    editor.save?.();
    window.tinymce?.triggerSave?.();
    const form = document.querySelector('form');
    if (form instanceof HTMLFormElement) {
      form.dispatchEvent(new Event('change', { bubbles: true }));
      form.dispatchEvent(new Event('input', { bubbles: true }));
    }
    for (const selector of ['textarea[name="content"]', 'textarea[name="editor"]', 'textarea#editor-tistory', 'input[name="title"]']) {
      const field = document.querySelector(selector);
      if (field instanceof HTMLTextAreaElement) {
        if (selector !== 'input[name="title"]' && contentHtml) field.value = contentHtml;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (field instanceof HTMLInputElement) {
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return {
      ok: true,
      titleLength: String(title || '').length,
      bodyLength: (bodyHtml || '').length,
      titleClassName: titleFieldInner.className || '',
      titleValue: titleFieldInner.value || null,
      isDirty: typeof editor.isDirty === 'function' ? editor.isDirty() : null,
      bodyTextLength: String(editor.getContent?.({ format: 'text' }) || '').trim().length,
      bodyHtmlLength: String(editor.getContent?.() || '').length
    };
  }, {
    title: payload.title,
    bodyHtml: payload.bodyHtml
  });
  await page.keyboard.press('Control+S').catch(() => {});
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
  const directButton = page.locator('#publish-layer-btn');
  if (await directButton.count()) {
    await directButton.click();
  } else {
    const clicked = await page.evaluate(() => {
      const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
      const visible = element => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const target = Array.from(document.querySelectorAll('button, a, [role="button"]'))
        .filter(visible)
        .find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '') === '완료');
      if (!target) return false;
      target.click();
      return true;
    });
    if (!clicked) return { ok: false, reason: 'publish-layer-button-not-found' };
  }
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

async function confirmPublishOnPage(page, expectedText = null) {
  const button = page.locator('#publish-btn');
  if (!await button.count()) return { ok: false, reason: 'publish-confirm-button-not-found' };
  const targetText = String(expectedText || '').trim();
  if (targetText) {
    await page.waitForFunction(
      expected => String(document.getElementById('publish-btn')?.innerText || '').replace(/\s+/g, ' ').trim() === expected,
      targetText,
      { timeout: 8000 }
    ).catch(() => {});
  }
  const text = (await button.innerText().catch(() => '')).trim();
  await page.evaluate(() => document.getElementById('publish-btn')?.click());
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
    expectedText: targetText || null,
    modalClosed,
    ...state
  };
}

async function selectHomeTopicOnPage(page, requestedTopic) {
  const requested = String(requestedTopic || '').replace(/\s+/g, ' ').trim();
  if (!requested) return { ok: true, skipped: true, requested: '' };
  const opener = page.locator('#home_subject button.select_btn').first();
  if (!await opener.count()) return { ok: false, requested, reason: 'home-topic-opener-not-found' };
  await opener.click();
  await page.waitForTimeout(600);
  const selected = await page.evaluate((topic) => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const candidates = Array.from(document.querySelectorAll('#home_subject .mce-menu-item, .mce-menu-item, .mce-text'))
      .filter(element => element instanceof HTMLElement && visible(element))
      .map(element => ({ element, text: normalize(element.innerText || element.textContent || '') }))
      .filter(entry => entry.text && entry.text.length <= 40);
    const match = candidates.find(entry => entry.text === topic)
      || candidates.find(entry => entry.text.endsWith(topic))
      || candidates.find(entry => entry.text.includes(topic));
    if (!match) return null;
    const clickable = match.element.closest('.mce-menu-item') || match.element;
    clickable.click();
    return match.text;
  }, requested);
  await page.waitForTimeout(500);
  return selected ? { ok: true, requested, selectedText: selected } : { ok: false, requested, reason: 'home-topic-not-found' };
}

async function selectVisibilityOnPage(page, requestedVisibility) {
  const requested = String(requestedVisibility || 'public').trim();
  if (requested === 'public') return { ok: true, requested, skipped: true };
  const selected = await page.evaluate((visibility) => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const label = visibility === 'private' ? '비공개' : visibility;
    const candidates = Array.from(document.querySelectorAll('button, a, label, span, div'))
      .filter(element => element instanceof HTMLElement && visible(element))
      .map(element => ({ element, text: normalize(element.innerText || element.textContent || '') }))
      .filter(entry => entry.text === label);
    const match = candidates[candidates.length - 1];
    if (!match) return null;
    (match.element.closest('label') || match.element).click();
    return match.text;
  }, requested);
  await page.waitForTimeout(500);
  if (!selected) return { ok: false, requested, reason: 'visibility-option-not-found' };
  if (requested === 'private') {
    const publishButton = page.locator('#publish-btn');
    let publishText = (await publishButton.innerText().catch(() => '')).trim();
    if (publishText !== '비공개 저장') {
      await page.waitForFunction(
        () => String(document.getElementById('publish-btn')?.innerText || '').replace(/\s+/g, ' ').trim() === '비공개 저장',
        null,
        { timeout: 5000 }
      ).catch(() => {});
      publishText = (await publishButton.innerText().catch(() => '')).trim();
    }
    return publishText === '비공개 저장'
      ? { ok: true, requested, selectedText: selected, publishButtonText: publishText }
      : { ok: false, requested, selectedText: selected, publishButtonText: publishText, reason: 'private-publish-button-not-ready' };
  }
  return { ok: true, requested, selectedText: selected };
}
async function setRepresentativeImageOnPage(page, imagePath) {
  if (!imagePath) return { ok: true, skipped: true, imagePath: null };
  const input = page.locator('input[type="file"]').first();
  if (!await input.count()) return { ok: false, reason: 'representative-image-input-not-found', imagePath };
await input.setInputFiles(imagePath);
  await page.waitForTimeout(1500);
  try {
    await page.waitForFunction(
      () => !String(document.body?.innerText || '').includes('업로드 중입니다.'),
      null,
      { timeout: 120000 }
    );
  } catch {}
  const state = await page.evaluate(() => {
    const modalText = String(document.querySelector('.ReactModal__Content')?.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      hasDeleteAction: modalText.includes('삭제'),
      modalText: modalText.slice(0, 400)
    };
  });
  return {
    ok: state.hasDeleteAction,
    imagePath,
    ...state
  };
}

async function setPublishScheduleOnPage(page, schedule) {
  if (!schedule?.date) return { ok: true, skipped: true };
  const requestedDate = String(schedule.date).trim();
  const requestedHour = schedule.hour == null ? null : String(schedule.hour).padStart(2, '0');
  const requestedMinute = schedule.minute == null ? null : String(schedule.minute).padStart(2, '0');
  const reserveButton = page.getByRole('button', { name: '예약' });
  if (!await reserveButton.count()) return { ok: false, reason: 'reserve-button-not-found', requestedDate };
  await reserveButton.click();
  await page.waitForTimeout(500);
  const dateButton = page.locator('.btn_reserve').first();
  if (!await dateButton.count()) return { ok: false, reason: 'schedule-date-button-not-found', requestedDate };
  const currentDateText = (await dateButton.innerText().catch(() => '')).trim();
  if (currentDateText !== requestedDate) {
    await dateButton.click();
    await page.waitForTimeout(500);
    const targetDay = String(Number(requestedDate.split('-').pop()));
    const selected = await page.evaluate((dayText) => {
      const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
      const visible = element => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const candidates = Array.from(document.querySelectorAll('button, a, td, span, div'))
        .filter(element => element instanceof HTMLElement && visible(element))
        .map(element => ({ element, text: normalize(element.innerText || element.textContent || '') }))
        .filter(entry => entry.text === dayText);
      const match = candidates[candidates.length - 1];
      if (!match) return null;
      match.element.click();
      return match.text;
    }, targetDay);
    if (!selected) return { ok: false, reason: 'schedule-date-not-found', requestedDate, currentDateText };
    await page.waitForTimeout(500);
  }
if (requestedHour !== null) {
  const hourInput = page.locator('#dateHour');
  if (!await hourInput.count()) return { ok: false, reason: 'schedule-hour-input-not-found', requestedDate };
  await hourInput.click({ clickCount: 3 });
  await hourInput.fill(requestedHour);
  await hourInput.press('Tab').catch(() => {});
}
if (requestedMinute !== null) {
  const minuteInput = page.locator('#dateMinute');
  if (!await minuteInput.count()) return { ok: false, reason: 'schedule-minute-input-not-found', requestedDate };
  await minuteInput.click({ clickCount: 3 });
  await minuteInput.fill(requestedMinute);
  await minuteInput.press('Tab').catch(() => {});
}
  await page.waitForTimeout(500);
  const finalDateText = (await dateButton.innerText().catch(() => '')).trim();
  const finalHour = await page.locator('#dateHour').inputValue().catch(() => '');
  const finalMinute = await page.locator('#dateMinute').inputValue().catch(() => '');
  return {
    ok: finalDateText === requestedDate && (requestedHour == null || finalHour === requestedHour) && (requestedMinute == null || finalMinute === requestedMinute),
    requestedDate,
    selectedDate: finalDateText,
    hour: finalHour,
    minute: finalMinute
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
  const recipient = options.qrEmailRecipient || (config.allowedRecipients || [])[0] || '';
  if (!recipient) {
    console.error('[qr-email] no recipient configured, skipping');
    return null;
  }
  try {
    const result = await sendQrEmail({
      config,
      blogUrl: options.blogUrl,
      recipient,
      filePath: qrLogin.qrImagePath,
      phase: qrLogin.phase || 'initial',
      qrState: qrLogin.qrState,
      context: options.context || 'tistory'
    });
    if (result?.sent) {
      console.log(`[qr-email] sent to ${recipient} messageId=${result.messageId}`);
    } else {
      console.error(`[qr-email] not sent: ${result?.reason || 'unknown'}`);
    }
    return result;
  } catch (error) {
    console.error(`[qr-email] error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
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
  const page = await context.newPage();
  return { browser, page };
}

async function evalOnPage(page, pageFunction, payload, { retries = 2, retryDelayMs = 800 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (typeof payload === 'undefined') return await page.evaluate(pageFunction);
      return await page.evaluate(pageFunction, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isNavigationError = /execution context was destroyed|navigation.*interrupted|target closed|frame.*detached/i.test(message);
      if (isNavigationError && attempt < retries) {
        await page.waitForTimeout(retryDelayMs).catch(() => {});
        continue;
      }
      throw error;
    }
  }
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
      if (openedQr?.navigateUrl && !openedQr?.alreadyOnQrPage) {
        await page.goto(openedQr.navigateUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(error => {
          const msg = error instanceof Error ? error.message : String(error);
          if (/ERR_ABORTED|ERR_NAME_NOT_RESOLVED|net::/i.test(msg)) return;
          throw error;
        });
      }
      if (openedQr?.clicked || openedQr?.alreadyOnQrPage || openedQr?.navigateUrl) {
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

async function restartKakaoQrOnPage(page, options) {
  // QR 만료 화면에서 로그인 플로우를 새로 시작하고 새 QR을 캡처한다.
  const kakaoState = await evalOnPage(page, detectKakaoLoginState);
  if (!kakaoState?.onKakaoHost) return null;
  const restarted = await evalOnPage(page, restartKakaoQrLogin);
  if (!restarted?.clicked) return null;
  await page.waitForTimeout(3000);
  const qrCapture = await evalOnPage(page, captureKakaoQrData);
  if (!qrCapture?.ok) return null;
  return { qrImagePath: writeDataUrlFile(options.qrImagePath, qrCapture.dataUrl), qrState: qrCapture, kakaoState: await evalOnPage(page, detectKakaoLoginState) };
}

function detectKakaoTwoStepVerification() {
  // Kakao 로그인 후 2단계 인증(KakaoTalk 확인) 화면 여부
  const bodyText = String(document.body?.innerText || '').replace(/\s+/g, ' ');
  return /(2-step verification|two.step verification|2단계 인증|본인확인|confirm your login|kakaotalk message|메시지.*전송)/i.test(bodyText);
}

function fillKakaoPasswordLogin(loginId, loginPwd) {
  // Kakao 로그인 폼(accounts.kakao.com/login)에 아이디/비밀번호를 입력하고 제출한다.
  const emailInput = document.querySelector('#loginId')
    || document.querySelector('input[name="loginId"]')
    || document.querySelector('input[type="email"]');
  const pwdInput = document.querySelector('#loginPwd')
    || document.querySelector('input[name="loginPwd"]')
    || document.querySelector('input[type="password"]');
  if (!(emailInput instanceof HTMLInputElement) || !(pwdInput instanceof HTMLInputElement)) {
    return { ok: false, reason: 'login-form-not-found', url: location.href };
  }
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(emailInput, loginId);
  emailInput.dispatchEvent(new Event('input', { bubbles: true }));
  emailInput.dispatchEvent(new Event('change', { bubbles: true }));
  setter.call(pwdInput, loginPwd);
  pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
  pwdInput.dispatchEvent(new Event('change', { bubbles: true }));
  // 로그인 상태 유지
  const stayBox = document.querySelector('input[name="stay_signed_in"], input[type="checkbox"]');
  if (stayBox instanceof HTMLInputElement && !stayBox.checked) stayBox.click();
  const submit = document.querySelector('button[type="submit"]') || document.querySelector('.btn_g.highlight');
  if (submit instanceof HTMLElement) {
    submit.click();
    return { ok: true, submitted: true };
  }
  return { ok: true, submitted: false };
}

async function attemptKakaoPasswordLoginOnPage(page, kakaoLogin) {
  // Kakao 아이디/비밀번호 로그인을 시도한다. 성공 시 에디터로 리다이렉트되고,
  // 실패(캡차 등) 시 기존 QR 플로우로 폴백한다.
  if (!kakaoLogin?.email || !kakaoLogin?.password) return { attempted: false };
  let state = await evalOnPage(page, detectTistoryState);
  // Tistory 로그인 페이지(Spa)의 "카카오계정으로 로그인" 버튼이 렌더링될 때까지 대기 후 클릭.
  if (state.authKind === 'tistory-login') {
    let clicked = false;
    const clickDeadline = Date.now() + 15000;
    while (Date.now() < clickDeadline && !clicked) {
      const result = await evalOnPage(page, clickTistoryKakaoLogin);
      clicked = Boolean(result?.clicked);
      if (!clicked) await page.waitForTimeout(1000);
    }
    if (!clicked) {
      console.error(`[kakao-login] 카카오 로그인 버튼을 찾지 못함 (authKind=${state.authKind})`);
      return { attempted: true, ok: false, reason: 'kakao-login-button-not-found', state };
    }
    // accounts.kakao.com 호스트로 이동할 때까지 대기.
    const navDeadline = Date.now() + 20000;
    while (Date.now() < navDeadline) {
      const kakaoState = await evalOnPage(page, detectKakaoLoginState);
      if (kakaoState?.onKakaoHost) break;
      await page.waitForTimeout(1000);
    }
  }
  const kakaoState = await evalOnPage(page, detectKakaoLoginState);
  if (!kakaoState?.onKakaoHost) {
    console.error(`[kakao-login] Kakao 호스트로 이동하지 않음 (url=${state?.url})`);
    return { attempted: true, ok: false, reason: 'not-on-kakao-host', state };
  }
  // 로그인 폼(#loginId/#loginPwd)이 나타날 때까지 대기 후 입력/제출.
  const formDeadline = Date.now() + 15000;
  let filled = null;
  while (Date.now() < formDeadline) {
    filled = await evalOnPage(page, fillKakaoPasswordLogin, { loginId: kakaoLogin.email, loginPwd: kakaoLogin.password });
    if (filled?.ok) break;
    await page.waitForTimeout(1000);
  }
  if (!filled?.ok) {
    console.error(`[kakao-login] 로그인 폼 입력 실패: ${filled?.reason || 'unknown'}`);
    return { attempted: true, ok: false, reason: filled?.reason || 'login-form-not-found', state };
  }
  console.error(`[kakao-login] 자격증명 제출 완료 (submitted=${filled.submitted})`);
  return { attempted: true, ok: true, submitted: filled.submitted, state };
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

export function createAgbrowseAutomation({ qrEmailConfig = null, kakaoLoginConfig = null, onQr = null } = {}) {
  return {
    async publishPost(options) {
      const qrHook = options.onQr || onQr;
      const qrResolvedHook = options.onQrResolved || null;
      const kakaoLogin = options.kakaoLogin || kakaoLoginConfig || null;
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

        // Kakao 아이디/비밀번호 로그인 우선 시도 (QR보다 우선, IP 플래그 우회)
        if (state.loginRequired && kakaoLogin?.email) {
          const attempt = await attemptKakaoPasswordLoginOnPage(page, kakaoLogin);
          if (attempt.attempted && attempt.ok) {
            // 제출 후 대기: 2단계 인증(KakaoTalk 확인, ~5분 카운트다운)까지 감안해 최대 7분 기다린다.
            const loginDeadline = Date.now() + 420000;
            let twoStepSeen = false;
            while (Date.now() < loginDeadline) {
              await page.waitForTimeout(3000);
              state = await evalOnPage(page, detectTistoryState);
              if (state.ready) break;
              const twoStep = await evalOnPage(page, detectKakaoTwoStepVerification);
              if (twoStep && !twoStepSeen) {
                twoStepSeen = true;
                console.error('[kakao-login] 2단계 인증 대기 중 — KakaoTalk 앱에서 로그인 확인 필요');
              }
            }
          }
        }

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
            const qrExpired = await evalOnPage(page, detectKakaoQrExpired);
            const refreshCooledDown = (Date.now() - lastQrRefreshAt) > 10000;
            if (kakaoState?.onQrPage && Number.isFinite(kakaoState.timeLeftSeconds) && kakaoState.timeLeftSeconds <= 15 && refreshCooledDown) {
              const refreshedQr = await refreshKakaoQrImageOnPage(page, options);
              if (refreshedQr?.qrImagePath) {
                qrLogin = { started: true, method: 'kakao-qr', phase: 'refresh', ...refreshedQr };
                lastQrRefreshAt = Date.now();
                if (qrHook) await qrHook(qrLogin);
                if (qrEmailConfig) await maybeSendQrEmail(qrEmailConfig, options, qrLogin);
              }
            } else if (qrExpired && refreshCooledDown) {
              const restartedQr = await restartKakaoQrOnPage(page, options);
              if (restartedQr?.qrImagePath) {
                qrLogin = { started: true, method: 'kakao-qr', phase: 'refresh', ...restartedQr };
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
const minimumFillChars = Math.max(400, Math.min(1500, Math.floor(String(bodyHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length * 0.5)));
let fillResult = null;
for (let attempt = 0; attempt < 6; attempt += 1) {
  fillResult = await fillTistoryPostOnPage(page, {
    title: options.title,
    bodyHtml
  });
  if (fillResult?.ok && Number(fillResult.bodyTextLength || 0) >= minimumFillChars) break;
  await page.waitForTimeout(1500);
  state = await openEditorAndDetectOnPage(page, editorUrl);
}
if (!fillResult?.ok) throw new Error(`본문 채우기에 실패했다: ${JSON.stringify(fillResult)}`);
if (Number(fillResult.bodyTextLength || 0) < minimumFillChars) {
  throw new Error(`본문이 너무 짧게 입력되었다: ${JSON.stringify({ minimumFillChars, fillResult, bodyHtmlLength: String(bodyHtml || '').length })}`);
}
const categoryResult = await selectCategoryOnPage(page, options.category);
if (!categoryResult?.ok) throw new Error(`카테고리를 선택하지 못했다: ${JSON.stringify(categoryResult)}`);
const tagResult = await setTagsOnPage(page, options.tags);
if (!tagResult?.ok) throw new Error(`태그를 입력하지 못했다: ${JSON.stringify(tagResult)}`);
await page.waitForFunction(
  () => !String(document.body?.innerText || '').includes('업로드 중입니다.'),
  null,
  { timeout: 120000 }
).catch(() => {});
let publishResult = null;
let scheduleResult = { ok: true, skipped: true };
let homeTopicResult = { ok: true, skipped: true };
let representativeImageResult = { ok: true, skipped: true };
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
const requestedVisibility = String(options.visibility || 'public').trim();
  const visibilityResult = await selectVisibilityOnPage(page, requestedVisibility);
  if (!visibilityResult?.ok) {
    throw new Error(`공개범위 선택에 실패했다: ${JSON.stringify(visibilityResult)}`);
  }
  if (requestedVisibility === 'public') {
    scheduleResult = await setPublishScheduleOnPage(page, options.schedule || null);
    if (!scheduleResult?.ok) {
      throw new Error(`예약 발행 설정에 실패했다: ${JSON.stringify(scheduleResult)}`);
    }
    homeTopicResult = await selectHomeTopicOnPage(page, options.homeTopic || '');
    if (!homeTopicResult?.ok) {
      throw new Error(`홈주제 선택에 실패했다: ${JSON.stringify(homeTopicResult)}`);
    }
    representativeImageResult = await setRepresentativeImageOnPage(page, options.representativeImagePath || '');
    if (!representativeImageResult?.ok) {
      throw new Error(`대표이미지 설정에 실패했다: ${JSON.stringify(representativeImageResult)}`);
    }
    await page.waitForFunction(
      () => !String(document.body?.innerText || '').includes('업로드 중입니다.'),
      null,
      { timeout: 120000 }
    ).catch(() => {});
  } else {
    scheduleResult = { ok: true, skipped: true, reason: 'private-visibility' };
    homeTopicResult = { ok: true, skipped: true, reason: 'private-visibility' };
    representativeImageResult = { ok: true, skipped: true, reason: 'private-visibility' };
  }
  publishResult = {
    ...publishLayerResult,
    visibilityResult,
    scheduleResult,
    homeTopicResult,
    representativeImageResult,
    ...(await confirmPublishOnPage(page, requestedVisibility === 'private' ? '비공개 저장' : '공개 발행'))
  };
  if (!publishResult?.ok) {
    await page.waitForTimeout(1500);
    publishResult = {
      ...publishResult,
      retry: await confirmPublishOnPage(page, requestedVisibility === 'private' ? '비공개 저장' : '공개 발행')
    };
    if (!publishResult?.retry?.ok) {
      throw new Error(`발행 확인에 실패했다: ${JSON.stringify(publishResult)}`);
    }
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
  scheduleResult,
  homeTopicResult,
  representativeImageResult,
  qrLogin: summarizeQrLogin(qrLogin),
  qrImagePath: resolveOutputPath(options.qrImagePath)
};
      } finally {
        await page.close({ runBeforeUnload: false }).catch(() => {});
        await browser.close().catch(() => {});
      }
    },

    async updatePost(options) {
      const qrHook = options.onQr || onQr;
      const qrResolvedHook = options.onQrResolved || null;
      const kakaoLogin = options.kakaoLogin || kakaoLoginConfig || null;
      const postId = String(options.postId || '').trim();
      const editorUrl = buildManagePostUrl(options.blogUrl, postId);
      if (!editorUrl) throw new Error('blogUrl and postId are required.');
      const bodySource = String(options.body || '');
      const bodyImageDataUrls = collectBodyImageDataUrls(bodySource);
      ensureBrowserStarted({ headed: options.headed });
      const { browser, page } = await connectManagedPage();
      let postRequestCapture = null;
      let postResponseCapture = null;
      let attachUploadPending = 0;
      let lastAttachUploadAt = 0;
      const requestLog = [];
      const captureRequest = request => {
        if (request.method() !== 'POST') return;
        const requestEntry = {
          url: request.url(),
          method: request.method()
        };
        if (request.url().includes('/manage/')) {
          requestLog.push(requestEntry);
          if (requestLog.length > 10) requestLog.shift();
        }
        if (request.url().includes('/manage/post/attach.json')) {
          attachUploadPending += 1;
          lastAttachUploadAt = Date.now();
          return;
        }
        if (!request.url().includes('/manage/post.json')) return;
        const raw = request.postData() || '';
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }
        const content = typeof parsed?.content === 'string' ? parsed.content : '';
        postRequestCapture = {
          ...requestEntry,
          title: typeof parsed?.title === 'string' ? parsed.title : null,
          contentLength: content.length,
          excerpt: content.slice(0, 160),
          visibility: parsed?.visibility ?? null,
          status: parsed?.postType ?? parsed?.status ?? null,
          tag: typeof parsed?.tag === 'string' ? parsed.tag : null
        };
      };
      const captureResponse = async response => {
        if (response.url().includes('/manage/post/attach.json')) {
          attachUploadPending = Math.max(0, attachUploadPending - 1);
          lastAttachUploadAt = Date.now();
          return;
        }
        if (!response.url().includes('/manage/post.json')) return;
        let text = '';
        try {
          text = await response.text();
        } catch {
          text = '';
        }
        postResponseCapture = {
          url: response.url(),
          status: response.status(),
          ok: response.ok(),
          bodyPreview: String(text || '').slice(0, 240)
        };
      };
      page.on('request', captureRequest);
      page.on('response', captureResponse);
      try {
        let state = await openEditorAndDetectOnPage(page, editorUrl);
        const deadline = Date.now() + options.waitForLoginMs;
        let qrLogin = null;
        let lastQrRefreshAt = 0;
        let qrResolvedAt = null;

        // Kakao 아이디/비밀번호 로그인 우선 시도 (QR보다 우선, IP 플래그 우회)
        if (state.loginRequired && kakaoLogin?.email) {
          const attempt = await attemptKakaoPasswordLoginOnPage(page, kakaoLogin);
          if (attempt.attempted && attempt.ok) {
            // 제출 후 대기: 2단계 인증(KakaoTalk 확인, ~5분 카운트다운)까지 감안해 최대 7분 기다린다.
            const loginDeadline = Date.now() + 420000;
            let twoStepSeen = false;
            while (Date.now() < loginDeadline) {
              await page.waitForTimeout(3000);
              state = await evalOnPage(page, detectTistoryState);
              if (state.ready) break;
              const twoStep = await evalOnPage(page, detectKakaoTwoStepVerification);
              if (twoStep && !twoStepSeen) {
                twoStepSeen = true;
                console.error('[kakao-login] 2단계 인증 대기 중 — KakaoTalk 앱에서 로그인 확인 필요');
              }
            }
          }
        }

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
            const qrExpired = await evalOnPage(page, detectKakaoQrExpired);
            const refreshCooledDown = (Date.now() - lastQrRefreshAt) > 10000;
            if (kakaoState?.onQrPage && Number.isFinite(kakaoState.timeLeftSeconds) && kakaoState.timeLeftSeconds <= 15 && refreshCooledDown) {
              const refreshedQr = await refreshKakaoQrImageOnPage(page, options);
              if (refreshedQr?.qrImagePath) {
                qrLogin = { started: true, method: 'kakao-qr', phase: 'refresh', ...refreshedQr };
                lastQrRefreshAt = Date.now();
                if (qrHook) await qrHook(qrLogin);
                if (qrEmailConfig) await maybeSendQrEmail(qrEmailConfig, options, qrLogin);
              }
            } else if (qrExpired && refreshCooledDown) {
              const restartedQr = await restartKakaoQrOnPage(page, options);
              if (restartedQr?.qrImagePath) {
                qrLogin = { started: true, method: 'kakao-qr', phase: 'refresh', ...restartedQr };
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
        if (!state.ready) throw new Error(`수정 에디터를 찾지 못했다: ${JSON.stringify({ state, qrLogin: summarizeQrLogin(qrLogin) })}`);

const bodyHtml = looksLikeHtml(bodySource)
  ? bodySource
  : buildTistoryBodyHtml({
      title: options.title,
      body: bodySource,
      description: options.description,
      heroImageDataUrl: '',
      heroImageAlt: options.title,
      bodyImageDataUrls
    });

if (options.skipMetadata) {
  const minimumContentLength = Math.max(500, Math.floor(bodyHtml.length * 0.6));
  await page.click('#post-title-inp', { clickCount: 3 });
  await page.keyboard.press('Backspace').catch(() => {});
  await page.keyboard.type(options.title, { delay: 1 });
  await page.evaluate(contentHtml => {
    window.tinymce?.activeEditor?.setContent(contentHtml);
    window.tinymce?.activeEditor?.fire('change');
    window.tinymce?.triggerSave?.();
  }, bodyHtml);
  await page.waitForTimeout(1000);
  const quickPublishOpened = await page.evaluate(() => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const completeButton = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter(visible)
      .find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '') === '완료');
    completeButton?.click();
    return Boolean(completeButton);
  });
  if (!quickPublishOpened) {
    throw new Error('수정 발행 레이어를 열지 못했다: quick-complete-button-not-found');
  }
  await page.waitForFunction(() => document.body.innerText.includes('공개 발행'), { timeout: 15000 });
  const publishResult = await page.evaluate(() => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const publishButton = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter(visible)
      .find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '') === '공개 발행');
    publishButton?.click();
    return {
      ok: Boolean(publishButton),
      clicked: publishButton ? [{ target: 'publish-btn', text: normalize(publishButton.innerText || publishButton.textContent || '') }] : []
    };
  });
  if (!publishResult?.ok) {
    throw new Error(`수정 발행 확인에 실패했다: ${JSON.stringify(publishResult)}`);
  }
  await page.waitForTimeout(2500);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.tinymce?.activeEditor, { timeout: 30000 });
  const verification = await page.evaluate(() => ({
    titleValue: document.querySelector('#post-title-inp')?.value || null,
    bodyTextLength: (window.tinymce?.activeEditor?.getContent({ format: 'text' }) || '').trim().length,
    bodyHtmlLength: (window.tinymce?.activeEditor?.getContent() || '').length
  }));
  if (verification.titleValue !== options.title) {
    throw new Error(`수정 후 제목 검증에 실패했다: ${JSON.stringify({ expected: options.title, verification, requestLog, postRequestCapture, postResponseCapture })}`);
  }
  if (verification.bodyHtmlLength < minimumContentLength) {
    throw new Error(`수정 후 본문 검증에 실패했다: ${JSON.stringify({ minimumContentLength, verification, requestLog, postRequestCapture, postResponseCapture })}`);
  }
  return {
    mode: 'update',
    postId,
    editorUrl,
    finalState: await evalOnPage(page, detectTistoryState),
    verification,
    fillResult: { ok: true, note: 'quick-repair-path' },
    categoryResult: { ok: true, skipped: true },
    tagResult: { ok: true, skipped: true },
    homeTopicResult: { ok: true, skipped: true },
    representativeImageResult: { ok: true, skipped: true, note: 'repair-skip-metadata' },
    publishResult,
    postRequestCapture,
    postResponseCapture,
    qrLogin: summarizeQrLogin(qrLogin),
    qrImagePath: resolveOutputPath(options.qrImagePath)
  };
}
let fillResult = null;
let editorFillCheck = null;
for (let attempt = 0; attempt < 6; attempt += 1) {
  fillResult = await fillTistoryPostOnPage(page, {
    title: options.title,
    bodyHtml
  });
  if (fillResult?.ok) {
    await page.waitForTimeout(1000);
    editorFillCheck = await page.evaluate(() => ({
      titleValue: document.querySelector('#post-title-inp')?.value || null,
      bodyTextLength: (window.tinymce?.activeEditor?.getContent({ format: 'text' }) || '').trim().length,
      bodyHtmlLength: (window.tinymce?.activeEditor?.getContent() || '').length
    }));
    if (editorFillCheck.bodyHtmlLength > 500) break;
  }
  await page.waitForTimeout(1500);
  state = await openEditorAndDetectOnPage(page, editorUrl);
}
if (!fillResult?.ok) throw new Error(`수정 본문 채우기에 실패했다: ${JSON.stringify(fillResult)}`);

const minimumContentLength = Math.max(500, Math.floor(bodyHtml.length * 0.6));
if (options.skipMetadata) {
  await page.click('#post-title-inp', { clickCount: 3 });
  await page.keyboard.press('Backspace').catch(() => {});
  await page.keyboard.type(options.title, { delay: 1 });
  await page.evaluate(contentHtml => {
    window.tinymce?.activeEditor?.setContent(contentHtml);
    window.tinymce?.activeEditor?.fire('change');
    window.tinymce?.triggerSave?.();
  }, bodyHtml);
  await page.waitForTimeout(1000);
  const quickPublishOpened = await page.evaluate(() => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const completeButton = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter(visible)
      .find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '') === '완료');
    completeButton?.click();
    return Boolean(completeButton);
  });
  if (!quickPublishOpened) {
    throw new Error('수정 발행 레이어를 열지 못했다: quick-complete-button-not-found');
  }
  await page.waitForFunction(() => document.body.innerText.includes('공개 발행'), { timeout: 15000 });
  const publishResult = await page.evaluate(() => {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const publishButton = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      .filter(visible)
      .find(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '') === '공개 발행');
    publishButton?.click();
    return {
      ok: Boolean(publishButton),
      clicked: publishButton ? [{ target: 'publish-btn', text: normalize(publishButton.innerText || publishButton.textContent || '') }] : []
    };
  });
  if (!publishResult?.ok) {
    throw new Error(`수정 발행 확인에 실패했다: ${JSON.stringify(publishResult)}`);
  }
  await page.waitForTimeout(2500);
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.tinymce?.activeEditor, { timeout: 30000 });
  const verification = await page.evaluate(() => ({
    titleValue: document.querySelector('#post-title-inp')?.value || null,
    bodyTextLength: (window.tinymce?.activeEditor?.getContent({ format: 'text' }) || '').trim().length,
    bodyHtmlLength: (window.tinymce?.activeEditor?.getContent() || '').length
  }));
  if (verification.titleValue !== options.title) {
    throw new Error(`수정 후 제목 검증에 실패했다: ${JSON.stringify({ expected: options.title, verification, requestLog, postRequestCapture, postResponseCapture })}`);
  }
  if (verification.bodyHtmlLength < minimumContentLength) {
    throw new Error(`수정 후 본문 검증에 실패했다: ${JSON.stringify({ minimumContentLength, verification, requestLog, postRequestCapture, postResponseCapture })}`);
  }
  return {
    mode: 'update',
    postId,
    editorUrl,
    finalState: await evalOnPage(page, detectTistoryState),
    verification,
    fillResult,
    categoryResult: { ok: true, skipped: true },
    tagResult: { ok: true, skipped: true },
    homeTopicResult: { ok: true, skipped: true },
    representativeImageResult: { ok: true, skipped: true, note: 'repair-skip-metadata' },
    publishResult,
    postRequestCapture,
    postResponseCapture,
    qrLogin: summarizeQrLogin(qrLogin),
    qrImagePath: resolveOutputPath(options.qrImagePath)
  };
}

const categoryResult = await selectCategoryOnPage(page, options.category);
if (!categoryResult?.ok) throw new Error(`수정 카테고리를 선택하지 못했다: ${JSON.stringify(categoryResult)}`);
const tagResult = await setTagsOnPage(page, options.tags);
if (!tagResult?.ok) throw new Error(`수정 태그를 입력하지 못했다: ${JSON.stringify(tagResult)}`);
await page.waitForTimeout(8000);
if (bodyHtml.includes('data:image')) {
  const uploadsDeadline = Date.now() + 90000;
  while (Date.now() < uploadsDeadline) {
    if (attachUploadPending <= 0 && (lastAttachUploadAt === 0 || (Date.now() - lastAttachUploadAt) > 3000)) break;
    await page.waitForTimeout(1000);
  }
}

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
  throw new Error(`수정 발행 레이어를 열지 못했다: ${JSON.stringify(publishLayerResult)}`);
}

const homeTopicResult = await selectHomeTopicOnPage(page, options.homeTopic || '');
if (!homeTopicResult?.ok) {
  throw new Error(`수정 홈주제 선택에 실패했다: ${JSON.stringify(homeTopicResult)}`);
}
let representativeImageResult = await setRepresentativeImageOnPage(page, options.representativeImagePath || '');
if (!representativeImageResult?.ok && representativeImageResult?.reason === 'representative-image-input-not-found') {
  representativeImageResult = {
    ...representativeImageResult,
    ok: true,
    skipped: true,
    note: 'repair-update-no-representative-image-input'
  };
}
if (!representativeImageResult?.ok) {
  throw new Error(`수정 대표이미지 설정에 실패했다: ${JSON.stringify(representativeImageResult)}`);
}

let publishResult = {
  ...publishLayerResult,
  homeTopicResult,
  representativeImageResult,
  ...(await confirmPublishOnPage(page, '공개 발행'))
};
if (!publishResult?.ok) {
  await page.waitForTimeout(1500);
  publishResult = {
    ...publishResult,
    retry: await confirmPublishOnPage(page, '공개 발행')
  };
  if (!publishResult?.retry?.ok) {
    throw new Error(`수정 발행 확인에 실패했다: ${JSON.stringify(publishResult)}`);
  }
}

await page.waitForTimeout(2000);
await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
const verification = await page.evaluate(() => ({
  titleValue: document.querySelector('#post-title-inp')?.value || null,
  bodyTextLength: (window.tinymce?.activeEditor?.getContent({ format: 'text' }) || '').trim().length,
  bodyHtmlLength: (window.tinymce?.activeEditor?.getContent() || '').length
}));
if (verification.titleValue !== options.title) {
  throw new Error(`수정 후 제목 검증에 실패했다: ${JSON.stringify({ expected: options.title, verification, requestLog, postRequestCapture, postResponseCapture })}`);
}
if (verification.bodyHtmlLength < minimumContentLength) {
  throw new Error(`수정 후 본문 검증에 실패했다: ${JSON.stringify({ minimumContentLength, verification, requestLog, postRequestCapture, postResponseCapture })}`);
}

        return {
          mode: 'update',
          postId,
          editorUrl,
          finalState: await evalOnPage(page, detectTistoryState),
          verification,
          fillResult,
          categoryResult,
          tagResult,
          homeTopicResult,
          representativeImageResult,
          publishResult,
          postRequestCapture,
          postResponseCapture,
          qrLogin: summarizeQrLogin(qrLogin),
          qrImagePath: resolveOutputPath(options.qrImagePath)
        };
      } finally {
        page.off('request', captureRequest);
        page.off('response', captureResponse);
        await page.close({ runBeforeUnload: false }).catch(() => {});
        await browser.close().catch(() => {});
      }
    },
    async probeEditor(options) {
      const editorUrl = buildEditorUrl(options.blogUrl);
      if (!editorUrl) throw new Error('blogUrl is required.');
      ensureBrowserStarted({ headed: options.headed });
      const { browser, page } = await connectManagedPage();
      try {
        await page.goto(editorUrl, { waitUntil: 'commit', timeout: 15000 });
        await page.waitForTimeout(1200);
        const currentUrl = page.url();
        const title = await page.title().catch(() => '');
        const state = currentUrl.startsWith('chrome-error://') || currentUrl === 'about:blank'
          ? null
          : await evalOnPage(page, detectTistoryState).catch(() => null);
        return {
          ok: currentUrl !== 'about:blank' && !currentUrl.startsWith('chrome-error://'),
          editorUrl,
          currentUrl,
          title,
          state
        };
      } catch (error) {
        return {
          ok: false,
          editorUrl,
          error: String(error?.message || error || '')
        };
      } finally {
        await page.close({ runBeforeUnload: false }).catch(() => {});
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
