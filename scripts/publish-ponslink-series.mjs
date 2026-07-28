#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DEFAULT_TISTORY_QR_IMAGE_PATH } from './lib/qr-path.mjs';
import { loadProjectEnv } from './lib/load-env.mjs';
import { browserStatus, ensureBrowserStarted, stopBrowser } from './lib/agbrowse-cli.mjs';
import { createAgbrowseAutomation } from '../src/worker/agbrowse-automation.mjs';

loadProjectEnv();

function parseArgs(argv) {
  const options = {
    manifest: process.env.TISTORY_PONSLINK_MANIFEST || 'content/ponslink-series/publish-manifest.json',
    blogUrl: process.env.TISTORY_BLOG_URL || 'https://acstory.tistory.com',
    category: process.env.TISTORY_PONSLINK_CATEGORY || process.env.TISTORY_POST_CATEGORY || '',
    headless: process.env.TISTORY_HEADED === '1' ? false : true,
    waitForLoginMs: Number(process.env.TISTORY_WAIT_FOR_LOGIN_MS || 900000),
    qrImagePath: process.env.TISTORY_QR_IMAGE_PATH || DEFAULT_TISTORY_QR_IMAGE_PATH,
    startAt: 0,
    count: null,
    dryRun: false,
    privateFallback: true,
    visibility: String(process.env.TISTORY_POST_VISIBILITY || 'public').trim().toLowerCase(),
    restartEvery: Number(process.env.TISTORY_BROWSER_RESTART_EVERY || 2),
    checkpointFile: process.env.TISTORY_PUBLISH_CHECKPOINT || ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--manifest' && next) {
      options.manifest = next;
      i += 1;
    } else if (arg === '--blog-url' && next) {
      options.blogUrl = next;
      i += 1;
    } else if (arg === '--category' && next) {
      options.category = next;
      i += 1;
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg === '--headed') {
      options.headless = false;
    } else if (arg === '--wait-for-login-ms' && next) {
      options.waitForLoginMs = Number(next);
      i += 1;
    } else if (arg === '--qr-image-path' && next) {
      options.qrImagePath = next;
      i += 1;
    } else if (arg === '--start-at' && next) {
      options.startAt = Math.max(0, Number.parseInt(next, 10) || 0);
      i += 1;
    } else if (arg === '--count' && next) {
      const parsed = Number.parseInt(next, 10);
      options.count = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      i += 1;
    } else if (arg === '--visibility' && next) {
      options.visibility = String(next).trim().toLowerCase();
      i += 1;
    } else if (arg === '--restart-every' && next) {
      const parsed = Number.parseInt(next, 10);
      options.restartEvery = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      i += 1;
    } else if (arg === '--checkpoint-file' && next) {
      options.checkpointFile = next;
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-private-fallback') {
      options.privateFallback = false;
    }
  }

  return options;
}

function normalizeVisibility(value) {
  return String(value || 'public').trim().toLowerCase() === 'private' ? 'private' : 'public';
}

function defaultCheckpointFile(manifestPath) {
  const manifestResolved = path.resolve(manifestPath);
  const stem = path.basename(manifestResolved, path.extname(manifestResolved));
  return path.join(path.dirname(manifestResolved), 'publish-results', `${stem}.checkpoint.jsonl`);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendCheckpoint(filePath, entry) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  ensureParentDir(resolved);
  fs.appendFileSync(resolved, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
}

function readManifest(filePath) {
  const resolved = path.resolve(filePath);
  const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!data || !Array.isArray(data.posts) || !data.posts.length) {
    throw new Error(`PonsLink publish manifest 가 비어 있다: ${resolved}`);
  }
  return {
    resolved,
    seriesTitle: data.seriesTitle || 'PonsLink가 만들어진 시간',
    category: data.category || '개발 회고',
    posts: data.posts
  };
}

function slicePosts(posts, options) {
  const start = Math.min(options.startAt, posts.length);
  const end = options.count == null ? posts.length : Math.min(posts.length, start + options.count);
  return {
    start,
    end,
    posts: posts.slice(start, end)
  };
}

function resolveOptionalPath(filePath) {
  if (!filePath) return '';
  return path.resolve(filePath);
}

function isPoisonedSessionError(error) {
  const message = String(error?.message || error || '');
  return /ERR_NAME_NOT_RESOLVED|chrome-error:\/\/chromewebdata|connectOverCDP|Target page, context or browser has been closed|page\.goto:|Navigation timeout|Timeout .* exceeded/i.test(message);
}

async function probeOrigin(blogUrl) {
  const url = new URL(blogUrl);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  return { ok: response.ok, status: response.status, url: url.toString() };
}

function recycleBrowserSession(options, reason) {
  console.log(`브라우저 세션 재시작: ${reason}`);
  stopBrowser();
  ensureBrowserStarted({ headed: !options.headless });
}

async function ensureBrowserHealthy(automation, options) {
  const currentStatus = browserStatus();
  if (!currentStatus.running) {
    ensureBrowserStarted({ headed: !options.headless });
  }
  const originProbe = await probeOrigin(options.blogUrl);
  if (!originProbe.ok) {
    throw new Error(`티스토리 원본 응답이 비정상이다: ${JSON.stringify(originProbe)}`);
  }
  let editorProbe = await automation.probeEditor({ blogUrl: options.blogUrl, headed: !options.headless });
  if (editorProbe.ok) return editorProbe;
  recycleBrowserSession(options, `editor-probe-failed:${editorProbe.currentUrl || editorProbe.error || 'unknown'}`);
  editorProbe = await automation.probeEditor({ blogUrl: options.blogUrl, headed: !options.headless });
  if (!editorProbe.ok) {
    throw new Error(`브라우저 세션 health check 실패: ${JSON.stringify(editorProbe)}`);
  }
  return editorProbe;
}

async function ensureCategory(automation, options) {
  if (options.dryRun) return;
  console.log(`\n[category] ${options.category}`);
  const result = await automation.ensureCategory({
    blogUrl: options.blogUrl,
    category: options.category,
    qrImagePath: options.qrImagePath,
    waitForLoginMs: options.waitForLoginMs,
    headed: !options.headless,
    onQr: payload => {
      if (payload?.qrImagePath) {
        console.log(`카테고리 로그인 QR 저장: ${payload.qrImagePath}`);
      }
    },
    onQrResolved: payload => {
      console.log(`카테고리 로그인 확인: ${payload.confirmedAt || 'confirmed'}`);
    }
  });
  console.log(JSON.stringify(result, null, 2));
}

function buildPublishArgs(post, options) {
  const requestedVisibility = normalizeVisibility(options.visibility);
  const resolvedBodyFile = path.resolve(post.bodyFile);
  const body = fs.readFileSync(resolvedBodyFile, 'utf8');
  return {
    blogUrl: options.blogUrl,
    title: post.title,
    description: post.description || '',
    body,
    tags: post.tags || '',
    category: options.category || post.category || '개발 회고',
    heroImagePath: resolveOptionalPath(post.heroImage),
    representativeImagePath: requestedVisibility === 'public' ? resolveOptionalPath(post.representativeImagePath) : '',
    homeTopic: requestedVisibility === 'public' ? (post.homeTopic || '') : '',
    schedule: requestedVisibility === 'public' ? (post.schedule || null) : null,
    visibility: requestedVisibility,
    qrImagePath: options.qrImagePath,
    waitForLoginMs: options.waitForLoginMs,
    headed: !options.headless,
    publish: true,
    onQr: payload => {
      if (payload?.qrImagePath) {
        console.log(`로그인 QR 저장: ${payload.qrImagePath}`);
      }
    },
    onQrResolved: payload => {
      console.log(`로그인 확인: ${payload.confirmedAt || 'confirmed'}`);
    }
  };
}

async function publishWithRecovery(automation, publishArgs, options, context) {
  try {
    return await automation.publishPost(publishArgs);
  } catch (error) {
    if (!isPoisonedSessionError(error)) throw error;
    recycleBrowserSession(options, `poisoned-session:${context}`);
    await ensureBrowserHealthy(automation, options);
    return automation.publishPost(publishArgs);
  }
}

async function runPost(automation, post, index, total, options) {
  console.log(`\n[${index + 1}/${total}] ${post.title}`);
  await ensureBrowserHealthy(automation, options);
  const publishArgs = buildPublishArgs(post, options);
  try {
    const result = await publishWithRecovery(automation, publishArgs, options, `post-${post.order}`);
    console.log(JSON.stringify(result, null, 2));
    return {
      status: publishArgs.visibility === 'private' ? 'private-direct' : 'public',
      result
    };
  } catch (error) {
    if (publishArgs.visibility !== 'public' || !options.privateFallback) throw error;
    console.log('공개 발행 실패. 비공개 발행으로 재시도한다.');
    const result = await publishWithRecovery(automation, {
      ...publishArgs,
      visibility: 'private',
      schedule: null,
      homeTopic: '',
      representativeImagePath: ''
    }, options, `private-fallback-${post.order}`);
    console.log(JSON.stringify({ ...result, fallbackFromPublic: true }, null, 2));
    return {
      status: 'private-fallback',
      result: { ...result, fallbackFromPublic: true }
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.visibility = normalizeVisibility(options.visibility);
  const manifest = readManifest(options.manifest);
  const category = options.category || manifest.category || '개발 회고';
  const sliced = slicePosts(manifest.posts, options);
  const checkpointFile = options.checkpointFile || defaultCheckpointFile(options.manifest);

  console.log(JSON.stringify({
    manifest: manifest.resolved,
    seriesTitle: manifest.seriesTitle,
    blogUrl: options.blogUrl,
    category,
    headless: options.headless,
    dryRun: options.dryRun,
    privateFallback: options.privateFallback,
    visibility: options.visibility,
    restartEvery: options.restartEvery,
    waitForLoginMs: options.waitForLoginMs,
    qrImagePath: path.resolve(options.qrImagePath),
    checkpointFile: path.resolve(checkpointFile),
    total: manifest.posts.length,
    startAt: options.startAt,
    count: options.count,
    selected: sliced.posts.length,
    selectedOrders: sliced.posts.map(post => post.order)
  }, null, 2));

  if (options.dryRun) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      posts: sliced.posts.map(post => ({
        order: post.order,
        title: post.title,
        bodyFile: path.resolve(post.bodyFile),
        category: category || post.category || '개발 회고',
        visibility: options.visibility,
        homeTopic: options.visibility === 'public' ? (post.homeTopic || '') : '',
        representativeImagePath: options.visibility === 'public' ? (resolveOptionalPath(post.representativeImagePath) || null) : null,
        schedule: options.visibility === 'public' ? (post.schedule || null) : null
      }))
    }, null, 2));
    return;
  }

  const automation = createAgbrowseAutomation();
  await ensureCategory(automation, { ...options, category });

  for (let offset = 0; offset < sliced.posts.length; offset += 1) {
    if (options.restartEvery > 0 && offset > 0 && offset % options.restartEvery === 0) {
      recycleBrowserSession(options, `batch-interval-${options.restartEvery}`);
    }
    const absoluteIndex = sliced.start + offset;
    const post = sliced.posts[offset];
    try {
      const outcome = await runPost(automation, post, absoluteIndex, manifest.posts.length, { ...options, category });
      appendCheckpoint(checkpointFile, {
        order: post.order,
        title: post.title,
        status: outcome.status,
        visibility: options.visibility,
        fallbackFromPublic: outcome.status === 'private-fallback',
        publishResult: outcome.result?.publishResult || null
      });
    } catch (error) {
      const status = isPoisonedSessionError(error) ? 'failed-browser' : 'failed-publish';
      appendCheckpoint(checkpointFile, {
        order: post.order,
        title: post.title,
        status,
        visibility: options.visibility,
        error: String(error?.message || error || '')
      });
      throw error;
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
