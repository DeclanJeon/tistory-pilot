import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadTopicReservations } from '../../scripts/lib/topic-reservations.mjs';
import { isAlreadyPublished } from '../../scripts/lib/published-posts.mjs';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { stagePublishPayload } from '../../src/core/tistory/staged-payload-service.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'topic-reservations-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('valid draft and queued sibling reserve their topic without reserving failed or fallback drafts', async t => {
  const root = await fixture(t);
  const generatedDir = path.join(root, 'generated', '2026-10-08');
  const queueDir = path.join(root, 'queue');
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.mkdir(queueDir);
  await fs.writeFile(path.join(generatedDir, 'valid.meta.json'), JSON.stringify({ id: 'old', keyword: 'WebRTC 보안 점검', status: 'qa_passed' }));
  await fs.writeFile(path.join(generatedDir, 'failed.meta.json'), JSON.stringify({ id: 'failed', keyword: '분산 스토리지 복구', status: 'qa_failed' }));
  await fs.writeFile(path.join(generatedDir, 'template.meta.json'), JSON.stringify({ id: 'template', keyword: '그래프 데이터베이스', status: 'generated', usingTemplate: true }));
  await fs.writeFile(path.join(queueDir, 'queue.json'), JSON.stringify({ posts: [{ id: 'queued', keyword: '메일 첨부파일 암호화' }] }));
  const ledger = await loadTopicReservations({ projectRoot: root, generatedDir: path.dirname(generatedDir), queueDir });
  assert.equal(isAlreadyPublished({ id: 'new', keyword: 'WebRTC 보안 점검' }, { ledger }).matched, true);
  assert.equal(isAlreadyPublished({ id: 'newer', keyword: '메일 첨부파일 암호화' }, { ledger }).matched, true);
  assert.equal(isAlreadyPublished({ id: 'retry', keyword: '분산 스토리지 복구' }, { ledger }).matched, false);
  assert.equal(isAlreadyPublished({ id: 'real', keyword: '그래프 데이터베이스' }, { ledger }).matched, false);
});

test('active staged publication reserves a rewritten news topic, while failed job permits retry', async t => {
  const root = await fixture(t);
  const config = createRuntimeConfig({ cwd: root, env: {} });
  const paths = await ensureDataPaths(config);
  const artifactStore = new FileArtifactStore({ paths });
  const jobStore = new FileJobStore({ paths });
  const staged = await stagePublishPayload({ artifactStore, jobId: 'pending', blogUrl: 'https://blog.example', title: '기사 원제', body: '원고', keywordId: 'news-pending', keyword: '기사 원제', sourceBundle: [{ url: 'https://news.example/article?idxno=5' }] });
  const record = await artifactStore.putJson({ artifactId: 'staged-pending', value: staged });
  await jobStore.create({ jobId: 'pending', type: 'publish_post', blogUrl: 'https://blog.example', createdBy: 'test', artifactRefs: [record.artifactId] });
  const candidate = { id: 'news-reworded', keyword: '완전히 새로 쓴 제목', news: { articles: [{ url: 'https://news.example/article?idxno=5' }] } };
  let ledger = await loadTopicReservations({ projectRoot: root });
  assert.equal(isAlreadyPublished(candidate, { ledger }).rule, 'news-source');
  await jobStore.update('pending', job => ({ ...job, state: 'failed' }));
  ledger = await loadTopicReservations({ projectRoot: root });
  assert.equal(isAlreadyPublished(candidate, { ledger }).matched, false);
});
