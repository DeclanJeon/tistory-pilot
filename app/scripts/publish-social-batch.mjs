#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { loadProjectEnv } from './lib/load-env.mjs';

loadProjectEnv();

function parseArgs(argv) {
  const options = {
    manifest: process.env.TISTORY_BATCH_MANIFEST || 'content/social-batch/manifest.json',
    blogUrl: process.env.TISTORY_BLOG_URL || 'https://acstory.tistory.com',
    category: process.env.TISTORY_BATCH_CATEGORY || '시사',
    headless: process.env.TISTORY_HEADED === '1' ? false : true,
    waitForLoginMs: Number(process.env.TISTORY_WAIT_FOR_LOGIN_MS || 900000),
    qrImagePath: process.env.TISTORY_QR_IMAGE_PATH || 'tmp/kakao-tistory-qr.png',
    startAt: 0,
    dryRun: false
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
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function readManifest(filePath) {
  const resolved = path.resolve(filePath);
  const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(data) || !data.length) {
    throw new Error(`배치 manifest 가 비어 있다: ${resolved}`);
  }
  return { resolved, posts: data };
}

function buildArgs(post, options) {
  const args = ['scripts/tistory-post.mjs'];
  if (!options.dryRun) args.push('--publish');
  if (options.dryRun) args.push('--dry-run');
  args.push(options.headless ? '--headless' : '--headed');
  args.push('--blog-url', options.blogUrl);
  args.push('--title', post.title);
  args.push('--description', post.description || '');
  args.push('--body-file', post.bodyFile);
  args.push('--tags', post.tags || '');
  args.push('--category', post.category || options.category);
  args.push('--qr-image-path', options.qrImagePath);
  args.push('--wait-for-login-ms', String(options.waitForLoginMs));
  if (post.heroImage) {
    args.push('--hero-image', post.heroImage);
  }
  return args;
}

async function ensureCategory(options) {
  if (options.dryRun) {
    return;
  }

  const args = [
    'scripts/tistory-category.mjs',
    '--blog-url', options.blogUrl,
    '--category', options.category,
    '--qr-image-path', options.qrImagePath,
    '--wait-for-login-ms', String(options.waitForLoginMs),
    options.headless ? '--headless' : '--headed'
  ];

  console.log(`\n[category] ${options.category}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        TISTORY_BLOG_URL: options.blogUrl,
        TISTORY_POST_CATEGORY: options.category,
        TISTORY_QR_IMAGE_PATH: options.qrImagePath,
        TISTORY_WAIT_FOR_LOGIN_MS: String(options.waitForLoginMs),
        TISTORY_HEADED: options.headless ? '0' : '1'
      }
    });
    child.on('error', reject);
    child.on('exit', code => {
      if ((code ?? 0) === 0) {
        resolve();
        return;
      }
      reject(new Error(`카테고리 보장 실패: ${options.category} (exit ${code})`));
    });
  });
}

async function runPost(post, index, total, options) {
  const args = buildArgs(post, options);
  console.log(`\n[${index + 1}/${total}] ${post.title}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        TISTORY_BLOG_URL: options.blogUrl,
        TISTORY_QR_IMAGE_PATH: options.qrImagePath,
        TISTORY_WAIT_FOR_LOGIN_MS: String(options.waitForLoginMs)
      }
    });
    child.on('error', reject);
    child.on('exit', code => {
      if ((code ?? 0) === 0) {
        resolve();
        return;
      }
      reject(new Error(`배치 발행 실패: ${post.title} (exit ${code})`));
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { resolved, posts } = readManifest(options.manifest);
  console.log(JSON.stringify({
    manifest: resolved,
    blogUrl: options.blogUrl,
    category: options.category,
    headless: options.headless,
    dryRun: options.dryRun,
    waitForLoginMs: options.waitForLoginMs,
    qrImagePath: path.resolve(options.qrImagePath),
    total: posts.length,
    startAt: options.startAt
  }, null, 2));

  await ensureCategory(options);

  for (let index = options.startAt; index < posts.length; index += 1) {
    await runPost(posts[index], index, posts.length, options);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
