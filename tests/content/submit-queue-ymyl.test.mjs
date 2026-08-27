import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { qaQueuePost, movePost } from '../../scripts/schedule/submit-queue.mjs';
// 발행 직전 QA(submit-queue.mjs qaQueuePost)의 키워드 게이트 계약:
// 선택 단계와 동일하게 안전 유형(공식 절차·서류·문의처·수수료·경험기록) YMYL 키워드는
// 허용하고, disabled·YMYL 거부 패턴·위험 유형만 keyword-* 실패로 차단한다.

test('발행 게이트: 안전 유형 YMYL(보험금 청구 절차)은 keyword-ymyl로 차단되지 않는다', async () => {
  const report = await qaQueuePost({
    id: 'life-28',
    title: '보험금 청구 절차 총정리',
    bodyHtml: '<p>보험금 청구 절차를 단계별로 정리한다.</p>',
    category: '생활·정보',
    contentType: 'procedure'
  });
  assert.ok(
    !report.failures.some(f => f.startsWith('keyword-ymyl')),
    `keyword-ymyl 차단됨: ${report.failures.join(', ')}`
  );
});

test('발행 게이트: disabled 키워드는 keyword-disabled로 차단', async () => {
  const report = await qaQueuePost({
    id: 'invest-09',
    title: '소상공인 대출 지원금',
    bodyHtml: '<p>내용</p>',
    category: '투자·재테크'
  });
  assert.ok(report.failures.includes('keyword-disabled:invest-09'));
});

test('발행 게이트: YMYL 거부 패턴 제목은 keyword-ymyl로 차단', async () => {
  const report = await qaQueuePost({
    id: 'life-28',
    title: '가장 좋은 보험 청구 방법',
    bodyHtml: '<p>본문</p>',
    category: '생활·정보',
    contentType: 'procedure'
  });
  assert.ok(
    report.failures.some(f => f.startsWith('keyword-ymyl')),
    `keyword-ymyl 미차단: ${report.failures.join(', ')}`
  );
});

test('발행 게이트: 안전 유형이 아닌 금융 키워드(추천·비교형)는 keyword-ymyl로 차단', async () => {
  const report = await qaQueuePost({
    id: 'invest-01',
    title: 'ISA 추천 2026',
    bodyHtml: '<p>본문</p>',
    category: '투자·재테크'
  });
  assert.ok(
    report.failures.some(f => f.startsWith('keyword-ymyl')),
    `keyword-ymyl 미차단: ${report.failures.join(', ')}`
  );
});

test('queue bookkeeping moves one post and preserves remaining posts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'submit-queue-move-'));
  const queueDir = path.join(root, 'queue');
  const submittedDir = path.join(root, 'submitted');
  await fs.mkdir(queueDir, { recursive: true });
  const posts = [
    { id: 'post-a', title: 'A', publishAt: '2026-06-22T07:00:00+09:00' },
    { id: 'post-b', title: 'B', publishAt: '2026-06-22T09:00:00+09:00' }
  ];
  await fs.writeFile(path.join(queueDir, '2026-06-22.json'), JSON.stringify({ posts }), 'utf8');

  assert.equal(await movePost(queueDir, submittedDir, '2026-06-22.json', posts[0]), true);
  const remaining = JSON.parse(await fs.readFile(path.join(queueDir, '2026-06-22.json'), 'utf8'));
  assert.deepEqual(remaining.posts, [posts[1]]);
  const submitted = await fs.readdir(submittedDir);
  assert.equal(submitted.length, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(submittedDir, submitted[0]), 'utf8')).posts, [posts[0]]);
});
