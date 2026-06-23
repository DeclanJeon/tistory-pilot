import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';

test('file artifact store persists artifact content and metadata under the data root', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-artifact-store-'));
  const config = createRuntimeConfig({
    cwd: tempRoot,
    env: {
      PUBLISH_WORKBENCH_DATA_ROOT: 'data'
    }
  });
  const paths = await ensureDataPaths(config);
  const store = new FileArtifactStore({
    paths,
    now: () => '2026-06-22T00:00:00.000Z'
  });

  const record = await store.putJson({
    artifactId: 'artifact-1',
    value: { hello: 'world' },
    metadata: { kind: 'source-bundle', expiresAt: '2026-06-23T00:00:00.000Z' }
  });
  assert.equal(record.kind, 'source-bundle');

  const loaded = await store.get('artifact-1');
  assert.equal(loaded.expiresAt, '2026-06-23T00:00:00.000Z');

  const payload = await fs.readFile(path.join(paths.artifactContentDir, 'artifact-1.json'), 'utf8');
  assert.match(payload, /"hello": "world"/);

  await store.delete('artifact-1');
  await assert.rejects(() => fs.readFile(path.join(paths.artifactMetaDir, 'artifact-1.json'), 'utf8'));
});
