#!/usr/bin/env node
/**
 * Repair truncated Tistory posts with full staged HTML bodies.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createAgbrowseAutomation } from '../src/worker/agbrowse-automation.mjs';

const ROOT = process.env.PUBLISH_WORKBENCH_DATA_ROOT || '/srv/publish-workbench/data';
const APP = process.env.PUBLISH_WORKBENCH_APP || '/srv/publish-workbench/app';
const arts = path.join(ROOT, 'artifacts/content');
const jobsDir = path.join(ROOT, 'jobs');

const jobIds = [
  'publish-post-1785213523362-20621893',
  'publish-post-1785213523398-9d27f936',
  'publish-post-1785213523424-f447363e',
  'publish-post-1785213523440-a62e8887',
  'publish-post-1785213523454-a77ac066',
  'publish-post-1785213523496-61db7bee',
  'publish-post-1785213523513-d93719c4',
  'publish-post-1785213523534-4618ec25'
];

const titleToPostId = {
  'ChatGPT 활용법 모음 – 업무와 일상에서 바로 써먹는 실전 팁 12가지': '932',
  'Claude AI vs ChatGPT 완전 비교 분석 2025 – 어떤 AI를 선택해야 할까': '933',
  '해외주식 배당금 세금 완벽 가이드: 원천징수에서 신고까지 정리했습니다': '934',
  '근로장려금 신청 자격 완벽 가이드 - 2024년 조건과 금액 한눈에 보기': '935',
  '부동산 DSR 계산 완전 가이드 — 대출 가능 금액 산정 공식과 실전 예시': '936',
  '소상공인 대출 지원금 2024 완벽 가이드: 정책자금부터 창업 자금까지': '937',
  '주식 세금 계산 완벽 가이드: 양도소득세·배당세 공식과 실제 예시': '938',
  '청약저축 소득공제 완벽 정리: 한도, 조건, 신청 방법 총정리': '939'
};

async function loadJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}
async function loadText(p) {
  return fs.readFile(p, 'utf8');
}
function plainLen(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
}

async function resolveJobPayload(jobId) {
  const job = await loadJson(path.join(jobsDir, `${jobId}.json`));
  const stagedRef = (job.artifactRefs || []).find(r => String(r).startsWith('staged-publish-payload-'));
  if (!stagedRef) throw new Error(`no staged ref ${jobId}`);
  const staged = await loadJson(path.join(arts, `${stagedRef}.json`));
  const title = (await loadText(path.join(arts, `${staged.titleRef}.txt`))).replace(/\n$/, '');
  const body = (await loadText(path.join(arts, `${staged.bodyRef}.txt`))).replace(/\n$/, '');
  const category = staged.categoryRef
    ? (await loadText(path.join(arts, `${staged.categoryRef}.txt`))).replace(/\n$/, '')
    : '';
  const tags = staged.tagsRef
    ? (await loadText(path.join(arts, `${staged.tagsRef}.txt`))).replace(/\n$/, '')
    : '';
  const description = staged.descriptionRef
    ? (await loadText(path.join(arts, `${staged.descriptionRef}.txt`))).replace(/\n$/, '')
    : '';
  return {
    jobId,
    title,
    body,
    category,
    tags,
    description,
    postId: titleToPostId[title] || null,
    plain: plainLen(body)
  };
}

const automation = createAgbrowseAutomation();
const items = [];
for (const jobId of jobIds) {
  const item = await resolveJobPayload(jobId);
  items.push(item);
  console.log('READY', item.postId, item.plain, item.title.slice(0, 48));
}

let ok = 0;
let fail = 0;
for (const item of items) {
  if (!item.postId) {
    console.error('SKIP no postId', item.title);
    fail += 1;
    continue;
  }
  if (item.plain < 1500) {
    console.error('SKIP short staged body', item.title, item.plain);
    fail += 1;
    continue;
  }
  console.log(`\n=== UPDATE ${item.postId} ${item.title}`);
  try {
    const result = await automation.updatePost({
      blogUrl: 'https://acstory.tistory.com',
      postId: String(item.postId),
      title: item.title,
      body: item.body,
      description: item.description || '',
      tags: item.tags || '',
      category: item.category || '경제상식',
      publish: true,
      skipMetadata: true,
      headed: true,
      waitForLoginMs: 600000,
      qrImagePath: path.join(ROOT, `qr/repair-${item.postId}.png`)
    });
    console.log('OK', item.postId, JSON.stringify({
      mode: result?.mode,
      bodyHtmlLength: result?.verification?.bodyHtmlLength || result?.fillResult?.bodyHtmlLength,
      bodyTextLength: result?.verification?.bodyTextLength || result?.fillResult?.bodyTextLength,
      publishOk: result?.publishResult?.ok
    }));
    ok += 1;
  } catch (error) {
    console.error('FAIL', item.postId, error instanceof Error ? error.message : String(error));
    fail += 1;
  }
}

console.log('DONE ok', ok, 'fail', fail);
if (fail) process.exit(2);
