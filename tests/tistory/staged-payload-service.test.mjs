import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { resolveStagedPublishPayload, stagePublishPayload } from '../../src/core/tistory/staged-payload-service.mjs';

test('staged publish payload uses artifact references instead of inline env payloads', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-stage-payload-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const artifactStore = new FileArtifactStore({ paths, now: () => '2026-06-22T00:00:00.000Z' });

  const staged = await stagePublishPayload({
    artifactStore,
    jobId: 'job-42',
    blogUrl: 'https://acstory.tistory.com',
    title: '제목',
    body: '본문',
    description: '설명',
    tags: 'a,b',
    category: 'IT·테크',
    heroImagePath: '/tmp/hero.png',
    sourceBundle: { sourceCount: 1 }
  });

  assert.match(staged.titleRef, /^job-42-title-/);
  assert.match(staged.bodyRef, /^job-42-body-/);
  assert.equal(typeof staged.sourceBundleRef, 'string');

  const resolved = await resolveStagedPublishPayload({ artifactStore, payload: staged });
  assert.equal(resolved.title, '제목');
  assert.equal(resolved.body, '본문');
  assert.equal(resolved.category, 'IT·테크');
  assert.deepEqual(resolved.sourceBundle, { sourceCount: 1 });
});
