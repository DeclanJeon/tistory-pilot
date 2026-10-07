#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  ensureBrowserStarted,
  evaluate,
  navigate,
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
    blogUrl: process.env.TISTORY_BLOG_URL || 'https://acstory.tistory.com',
    category: process.env.TISTORY_POST_CATEGORY || process.env.TISTORY_BATCH_CATEGORY || '시사',
    headed: process.env.TISTORY_HEADED === '1',
    qrImagePath: process.env.TISTORY_QR_IMAGE_PATH || 'tmp/kakao-tistory-qr.png',
    waitForLoginMs: Number(process.env.TISTORY_WAIT_FOR_LOGIN_MS || 300000),
    qrEmailTo: process.env.TISTORY_QR_EMAIL_TO || '',
    qrEmailOnRefresh: ['1', 'true', 'yes', 'on'].includes(String(process.env.TISTORY_QR_EMAIL_ON_REFRESH || '').toLowerCase()),
    qrEmailSubjectPrefix: process.env.TISTORY_QR_EMAIL_SUBJECT_PREFIX || '[Tistory QR]',
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--blog-url' && next) {
      options.blogUrl = next;
      i += 1;
    } else if (arg === '--category' && next) {
      options.category = next;
      i += 1;
    } else if (arg === '--headless') {
      options.headed = false;
    } else if (arg === '--headed') {
      options.headed = true;
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
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function normalizeBlogUrl(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  const url = new URL(value.startsWith('http') ? value : `https://${value}`);
  return `${url.protocol}//${url.host}`;
}

function buildCategoryUrl(blogUrl) {
  const normalized = normalizeBlogUrl(blogUrl);
  return normalized ? `${normalized}/manage/category` : '';
}

function resolveOutputPath(filePath) {
  return path.resolve(String(filePath || 'tmp/kakao-tistory-qr.png'));
}

function writeDataUrlFile(filePath, dataUrl) {
  const resolved = resolveOutputPath(filePath);
  const payload = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, Buffer.from(payload, 'base64'));
  return resolved;
}

async function notifyQrEmail(options, filePath, phase, qrState) {
  const result = await sendQrEmailIfConfigured({
    options,
    filePath,
    phase,
    qrState,
    context: 'tistory-category'
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

function detectAdminState() {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const bodyText = normalize(document.body?.innerText || '');
  const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], label'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .map(element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || ''))
    .filter(Boolean);
  const categoryTexts = Array.from(document.querySelectorAll('li, td, th, span, strong, em, button, a, label, div'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .map(element => normalize(element.innerText || element.textContent || ''))
    .filter(text => text && text.length <= 120)
    .filter(text => !/^(저장|등록|추가|삭제|편집|수정|공개|비공개|검색|전체|보기|관리|설정|확인|취소)$/i.test(text));
  const loginRequired = /(^|\.)accounts\.kakao\.com$/i.test(location.host)
    || location.pathname.includes('/auth/login')
    || bodyText.includes('카카오계정으로 로그인')
    || buttons.some(text => text.includes('카카오계정으로 로그인'));
  return {
    url: location.href,
    title: document.title,
    host: location.host,
    loginRequired,
    onKakaoHost: /(^|\.)accounts\.kakao\.com$/i.test(location.host),
    onQrPage: location.pathname.includes('/qr_login'),
    bodyPreview: bodyText.slice(0, 240),
    buttons: buttons.filter(text => /(카테고리|category|로그인|QR|저장|등록|추가|삭제|편집|수정)/i.test(text)).slice(0, 40),
    categoryTexts: Array.from(new Set(categoryTexts)).slice(0, 120),
    categoryTextCount: categoryTexts.length,
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

function ensureCategoryExists(payload) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => normalize(element.innerText || element.textContent || element.getAttribute('aria-label') || '');
  const fieldDescriptor = element => ({
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    className: normalize(element.className || '').slice(0, 120) || null,
    name: element.getAttribute('name'),
    placeholder: element.getAttribute('placeholder')
  });
  const setNativeValue = (element, value) => {
    const own = Object.getOwnPropertyDescriptor(element, 'value');
    const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
    const setter = own?.set || proto?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const categoryPresent = label => {
    const target = normalize(label || '');
    if (!target) return false;
    return textNodes.some(element => {
      const text = textOf(element);
      return text === target || (text && text !== target && text.includes(target));
    });
  };
  const requested = normalize(payload?.category || '');
  if (!requested) {
    return { ok: false, reason: 'missing-category' };
  }

  const clickable = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"], label, div, span'))
    .filter(element => element instanceof HTMLElement && visible(element));
  const textNodes = Array.from(document.querySelectorAll('li, td, th, span, strong, em, button, a, label, div'))
    .filter(element => element instanceof HTMLElement && visible(element));
  if (categoryPresent(requested)) {
    const matched = textNodes.find(element => {
      const text = textOf(element);
      return text === requested || (text && text !== requested && text.includes(requested));
    });
    return {
      ok: true,
      requested,
      existed: true,
      matchedText: matched ? textOf(matched) : requested,
      created: false
    };
  }

  const creationTriggers = [
    '카테고리 추가',
    '새 카테고리',
    '카테고리 만들기',
    '카테고리 등록',
    '추가',
    '등록'
  ];
  const trigger = clickable.find(element => textOf(element) === '카테고리 추가')
    || clickable.find(element => textOf(element).includes('카테고리 추가'))
    || clickable.find(element => creationTriggers.some(label => textOf(element) === label))
    || clickable.find(element => creationTriggers.some(label => textOf(element).includes(label)));
  if (trigger) {
    trigger.click();
    const inputs = Array.from(document.querySelectorAll('input, textarea'))
      .filter(element => element instanceof HTMLElement && visible(element))
      .filter(element => element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement);
    const input = inputs.find(element => /tf_blog|카테고리|category|name|이름/i.test([
      element.getAttribute('name'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.id,
      element.className,
      element.getAttribute('title')
    ].map(normalize).join(' ')))
      || inputs.find(element => {
        const type = (element.getAttribute('type') || '').toLowerCase();
        const placeholder = normalize(element.getAttribute('placeholder') || '');
        const value = normalize(element.value || '');
        return /^(text|)$/.test(type) && !/검색/.test(placeholder) && value === '';
      })
      || null;
    if (!input) {
      return {
        ok: false,
        requested,
        created: false,
        action: 'opened-create-ui',
        trigger: fieldDescriptor(trigger)
      };
    }
    setNativeValue(input, requested);
    const refreshedClickable = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"], label, div, span'))
      .filter(element => element instanceof HTMLElement && visible(element));
    const saveButtons = refreshedClickable.filter(element => /(등록|추가|만들기|생성|확인|저장)/i.test(textOf(element)));
    const save = saveButtons.find(element => /^확인$/.test(textOf(element)))
      || saveButtons.find(element => /등록|추가|만들기|생성/.test(textOf(element)))
      || saveButtons.find(element => /^저장$/.test(textOf(element)))
      || null;
    if (!save) {
      return {
        ok: false,
        requested,
        created: false,
        action: 'filled-input-no-save',
        input: fieldDescriptor(input)
      };
    }
    save.click();
    const finalSaveButton = Array.from(document.querySelectorAll('button'))
      .filter(element => element instanceof HTMLButtonElement && visible(element))
      .find(element => /변경사항 저장/.test(textOf(element)) && !element.disabled);
    if (finalSaveButton) {
      finalSaveButton.click();
    }
    return {
      ok: true,
      requested,
      existed: false,
      created: true,
      input: fieldDescriptor(input),
      saveLabel: textOf(save),
      finalSaveLabel: finalSaveButton ? textOf(finalSaveButton) : null
    };
  }

  return {
    ok: false,
    requested,
    created: false,
    reason: 'category-ui-not-found',
    buttons: clickable.map(textOf).filter(Boolean).slice(0, 30)
  };
}
function pageHasCategory(payload) {
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const requested = normalize(payload?.category || '');
  if (!requested) return false;
  return Array.from(document.querySelectorAll('li, td, th, span, strong, em, button, a, label, div'))
    .filter(element => element instanceof HTMLElement && visible(element))
    .some(element => {
      const text = normalize(element.innerText || element.textContent || '');
      return text === requested || (text && text !== requested && text.includes(requested));
    });
}

function ensureKakaoQrReady(options) {
  const deadline = Date.now() + Math.min(options.waitForLoginMs, 30000);
  let lastAdminState = evaluate(detectAdminState);
  let lastKakaoState = evaluate(detectKakaoLoginState);

  while (Date.now() < deadline) {
    if (!lastAdminState?.loginRequired) {
      return {
        started: false,
        skipped: true,
        reason: 'already-authenticated',
        state: lastAdminState
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
        lastAdminState = evaluate(detectAdminState);
        lastKakaoState = evaluate(detectKakaoLoginState);
        continue;
      }
    }

    if (lastAdminState?.url?.includes('/auth/login')) {
      const clickedLogin = evaluate(clickTistoryKakaoLogin);
      if (clickedLogin?.clicked) {
        wait(1500);
        lastAdminState = evaluate(detectAdminState);
        lastKakaoState = evaluate(detectKakaoLoginState);
        continue;
      }
    }

    wait(1000);
    lastAdminState = evaluate(detectAdminState);
    lastKakaoState = evaluate(detectKakaoLoginState);
  }

  return {
    started: false,
    skipped: false,
    reason: 'qr-login-not-reachable',
    lastAdminState,
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

async function ensureCategoryFlow(options, categoryUrl) {
  let state = evaluate(detectAdminState);
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

  while (state.loginRequired && Date.now() < deadline) {
    wait(2000);
    state = evaluate(detectAdminState);

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
      continue;
    }

    if (!redirectedBack) {
      navigate(categoryUrl);
      redirectedBack = true;
      wait(1200);
      state = evaluate(detectAdminState);
    }
  }

  if (state.loginRequired) {
    throw new Error(`카테고리 관리 페이지에 로그인하지 못했다. 상태: ${JSON.stringify({ state, qrLogin }, null, 2)}`);
  }

  let ensureResult = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    ensureResult = evaluate(ensureCategoryExists, { category: options.category });
    wait(1200);
    state = evaluate(detectAdminState);
    const matched = state?.categoryTexts?.includes(options.category)
      || state?.categoryTexts?.some(text => String(text || '').includes(options.category))
      || String(state?.bodyPreview || '').includes(options.category)
      || evaluate(pageHasCategory, { category: options.category });
    if (matched) {
      return { state, qrLogin, ensureResult, verified: true, attempts: attempt + 1 };
    }
    if (ensureResult?.existed) {
      return { state, qrLogin, ensureResult, verified: true, attempts: attempt + 1 };
    }
    if (ensureResult?.created && attempt < 5) {
      wait(2000);
      state = evaluate(detectAdminState);
      const delayedMatch = state?.categoryTexts?.includes(options.category)
        || state?.categoryTexts?.some(text => String(text || '').includes(options.category))
        || String(state?.bodyPreview || '').includes(options.category)
        || evaluate(pageHasCategory, { category: options.category });
      if (delayedMatch) {
        return { state, qrLogin, ensureResult, verified: true, attempts: attempt + 1 };
      }
    }
    if (ensureResult?.action === 'opened-create-ui') {
      wait(1000);
      continue;
    }
  }

  return { state, qrLogin, ensureResult, verified: false, attempts: 6 };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const categoryUrl = buildCategoryUrl(options.blogUrl);
  if (!categoryUrl) {
    throw new Error('TISTORY_BLOG_URL 또는 --blog-url 가 필요하다.');
  }
  if (!options.category) {
    throw new Error('--category 가 필요하다.');
  }

  ensureBrowserStarted({ headed: options.headed });
  navigate(categoryUrl);
  const initialState = evaluate(detectAdminState);

  if (options.dryRun) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      categoryUrl,
      category: options.category,
      initialState,
      qrImagePath: path.resolve(options.qrImagePath),
      qrEmailTo: options.qrEmailTo || null,
      qrEmailOnRefresh: options.qrEmailOnRefresh,
      qrEmailConfigured: hasQrEmailDelivery(options)
    }, null, 2));
    return;
  }

  const result = await ensureCategoryFlow(options, categoryUrl);
  if (!result.verified) {
    throw new Error(`카테고리 보장에 실패했다. 상태: ${JSON.stringify(result, null, 2)}`);
  }

  console.log(JSON.stringify({
    mode: 'ensure-category',
    categoryUrl,
    category: options.category,
    verified: result.verified,
    attempts: result.attempts,
    finalState: result.state,
    ensureResult: result.ensureResult,
    qrLogin: result.qrLogin
  }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
