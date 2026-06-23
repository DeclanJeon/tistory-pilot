import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { JobService, analyzeMarkdownSource } from '../../src/server/job-service.mjs';

test('markdown analysis returns template and estimated posts', () => {
  const draft = analyzeMarkdownSource('# 제목\n\n문단 하나\n\n## 섹션\n\n문단 둘');
  assert.equal(typeof draft.templateId, 'string');
  assert.equal(draft.analysis.estimatedPosts.recommendedPosts >= 1, true);
});

test('job service creates source import and publish jobs with artifact refs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-job-service-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const service = new JobService({ config, paths, now: () => '2026-06-22T00:00:00.000Z' });

  const importJob = await service.createSourceImportJob({ createdBy: 'tester', blogUrl: 'https://acstory.tistory.com', links: ['https://example.com/a'] });
  assert.equal(importJob.type, 'source_import');
  assert.equal(importJob.artifactRefs.length, 1);

  const publishJob = await service.createPublishJob({
    createdBy: 'tester',
    blogUrl: 'https://acstory.tistory.com',
    title: '제목',
    body: '본문',
    description: '',
    tags: '',
    category: 'IT·테크'
  });
  assert.equal(publishJob.type, 'publish_post');
  assert.equal(publishJob.artifactRefs.length, 1);
});

test('job service resolves QR artifacts referenced only by job events', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-job-service-qr-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const service = new JobService({ config, paths, now: () => '2026-06-22T00:00:00.000Z' });

  const job = await service.createCategoryEnsureJob({
    createdBy: 'tester',
    blogUrl: 'https://acstory.tistory.com',
    category: 'IT·테크'
  });
  await service.artifactStore.putText({
    artifactId: 'qr-image-test',
    text: 'data:image/png;base64,abc',
    metadata: { kind: 'qr-image', jobId: job.jobId }
  });
  await service.jobStore.appendEvent(job.jobId, {
    type: 'qr.ready',
    detail: { artifactRef: 'qr-image-test' }
  });

  const artifacts = await service.resolveJobArtifacts(job.jobId, job.artifactRefs);
  assert.deepEqual(artifacts.map(artifact => artifact.kind), ['category-request', 'qr-image']);
});
