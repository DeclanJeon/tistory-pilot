import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { ensureDataPaths } from '../../src/core/runtime/paths.mjs';
import { BlogService } from '../../src/server/blog-service.mjs';

test('blog service persists multiple blogs under an account registry', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-blog-service-'));
  const config = createRuntimeConfig({ cwd: tempRoot, env: { PUBLISH_WORKBENCH_DATA_ROOT: 'data' } });
  const paths = await ensureDataPaths(config);
  const service = new BlogService({ paths });

  await service.saveBlog({ accountName: 'kakao-main', blogUrl: 'https://a.tistory.com', blogTitle: 'A' });
  const blogs = await service.saveBlog({ accountName: 'kakao-main', blogUrl: 'https://b.tistory.com', blogTitle: 'B' });
  assert.deepEqual(blogs.map(blog => blog.blogUrl), ['https://a.tistory.com', 'https://b.tistory.com']);
});
