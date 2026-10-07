import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { movePostToDirectory } from '../../scripts/schedule/submit-queue.mjs';

test('moving one post preserves other posts in the source queue', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tistory-queue-'));
  const queue = path.join(root, 'queue');
  const submitted = path.join(root, 'submitted');
  await fs.mkdir(queue, { recursive: true });
  const filename = '2026-09-14.json';
  await fs.writeFile(path.join(queue, filename), JSON.stringify({
    runId: 'run-test',
    posts: [{ id: 'first', title: 'First' }, { id: 'second', title: 'Second' }]
  }));

  assert.equal(await movePostToDirectory(queue, submitted, filename, { id: 'first' }), true);
  const remaining = JSON.parse(await fs.readFile(path.join(queue, filename), 'utf8'));
  assert.deepEqual(remaining.posts.map(post => post.id), ['second']);
  const submittedFiles = await fs.readdir(submitted);
  assert.equal(submittedFiles.length, 1);
  const moved = JSON.parse(await fs.readFile(path.join(submitted, submittedFiles[0]), 'utf8'));
  assert.deepEqual(moved.posts.map(post => post.id), ['first']);

  assert.equal(await movePostToDirectory(queue, submitted, filename, { id: 'second' }), true);
  const emptied = JSON.parse(await fs.readFile(path.join(queue, filename), 'utf8'));
  assert.deepEqual(emptied.posts, []);
  assert.equal((await fs.readdir(submitted)).length, 2);
});
