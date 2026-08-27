#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_TISTORY_QR_IMAGE_PATH } from './lib/qr-path.mjs';
import { loadProjectEnv } from './lib/load-env.mjs';
import { createAgbrowseAutomation } from '../src/worker/agbrowse-automation.mjs';

loadProjectEnv();

function parseArgs(argv) {
  const options = {
    manifest: 'content/ponswarp-retrospective/publish-results/repair-manifest-01-30.json',
    headless: false,
    startAt: 1,
    count: Infinity,
    qrImagePath: process.env.TISTORY_QR_IMAGE_PATH || DEFAULT_TISTORY_QR_IMAGE_PATH,
    waitForLoginMs: Number(process.env.TISTORY_WAIT_FOR_LOGIN_MS || 15 * 60 * 1000),
    blogUrl: process.env.TISTORY_BLOG_URL || 'https://acstory.tistory.com',
    dryRun: false,
    skipMetadata: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest' && argv[i + 1]) options.manifest = argv[++i];
    else if (arg === '--start-at' && argv[i + 1]) options.startAt = Number(argv[++i]) || options.startAt;
    else if (arg === '--count' && argv[i + 1]) options.count = Number(argv[++i]) || options.count;
    else if (arg === '--headless') options.headless = true;
    else if (arg === '--headed') options.headless = false;
    else if (arg === '--qr-image' && argv[i + 1]) options.qrImagePath = argv[++i];
    else if (arg === '--blog-url' && argv[i + 1]) options.blogUrl = argv[++i];
    else if (arg === '--wait-for-login-ms' && argv[i + 1]) options.waitForLoginMs = Number(argv[++i]) || options.waitForLoginMs;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--full-metadata') options.skipMetadata = false;
  }

  return options;
}

function readManifest(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function selectPosts(posts, options) {
  const startIndex = Math.max(0, options.startAt - 1);
  return posts.slice(startIndex, Number.isFinite(options.count) ? startIndex + options.count : undefined);
}

function extractPostId(url) {
  const match = String(url || '').match(/\/(\d+)(?:$|[?#])/);
  return match ? match[1] : '';
}

function readBody(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = readManifest(options.manifest);
  const posts = selectPosts(Array.isArray(manifest.posts) ? manifest.posts : [], options);
  if (!posts.length) {
    throw new Error('수정할 글이 없다.');
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      manifest: options.manifest,
      total: posts.length,
      posts: posts.map(post => ({
        order: post.order,
        url: post.url,
        postId: extractPostId(post.url),
        desiredTitle: post.desiredTitle,
        bodyFile: post.bodyFile
      }))
    }, null, 2));
    return;
  }

  const automation = createAgbrowseAutomation();
  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    const postId = extractPostId(post.url);
    if (!postId) {
      throw new Error(`postId를 추출하지 못했다: ${post.url}`);
    }
    const title = String(post.desiredTitle || '').trim();
    const body = readBody(post.bodyFile);
    console.log(`수정 시작 (${index + 1}/${posts.length}) #${postId} ${title}`);
    let result = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        result = await automation.updatePost({
          blogUrl: options.blogUrl,
          postId,
          title,
          body,
          description: '',
          category: post.category,
          tags: post.tags,
          homeTopic: post.homeTopic,
          representativeImagePath: post.representativeImagePath,
          skipMetadata: options.skipMetadata,
          qrImagePath: options.qrImagePath,
          waitForLoginMs: options.waitForLoginMs,
          headed: !options.headless,
          onQr: payload => {
            if (payload?.qrImagePath) {
              console.log(`로그인 QR 저장: ${payload.qrImagePath}`);
            }
          },
          onQrResolved: payload => {
            console.log(`로그인 확인: ${payload.confirmedAt || 'confirmed'}`);
          }
        });
        break;
      } catch (error) {
        lastError = error;
        console.error(`수정 재시도 필요 (#${postId}, attempt ${attempt}/3): ${error?.message || error}`);
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    if (!result) throw lastError;
    console.log(JSON.stringify({ order: post.order, postId, url: post.url, result }, null, 2));
  }
}

main().catch(error => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
