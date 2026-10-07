import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRuntimeConfig } from '../../src/core/runtime/config.mjs';
import { resolveDataPaths } from '../../src/core/runtime/paths.mjs';
import { FileJobStore } from '../../src/core/jobs/file-job-store.mjs';
import { FileArtifactStore } from '../../src/core/artifacts/file-artifact-store.mjs';

async function entries(directory) {
  if (!directory) return [];
  try { return await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

/** Valid drafts and pending jobs reserve topics, but never become published history. */
export async function loadTopicReservations({ projectRoot, generatedDir = null, queueDir = null } = {}) {
  const topics = [];
  if (generatedDir) {
    queueDir ||= process.env.SCHEDULED_QUEUE_DIR
      || (existsSync('/srv/publish-workbench/scheduled/queue')
        ? '/srv/publish-workbench/scheduled/queue'
        : path.join(projectRoot, 'scheduled', 'queue'));
    const visit = async directory => {
      for (const entry of await entries(directory)) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(filename);
        else if (entry.name.endsWith('.meta.json')) {
          const meta = JSON.parse(await fs.readFile(filename, 'utf8'));
          if (['generated', 'qa_passed'].includes(meta.status) && !meta.usingTemplate) topics.push(meta);
        }
      }
    };
    await visit(generatedDir);
  }
  for (const entry of await entries(queueDir)) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const queue = JSON.parse(await fs.readFile(path.join(queueDir, entry.name), 'utf8'));
      if (!Array.isArray(queue.posts)) throw new Error(`Invalid topic queue: ${entry.name}`);
      topics.push(...queue.posts);
    }
  }
  const config = createRuntimeConfig({ cwd: projectRoot, env: process.env });
  const paths = resolveDataPaths(config);
  if ((await entries(paths.jobsDir)).length) {
    const jobs = new FileJobStore({ paths });
    const artifacts = new FileArtifactStore({ paths });
    for (const job of await jobs.list()) {
      if (job.type !== 'publish_post' || ['succeeded', 'failed', 'canceled', 'cancelled'].includes(job.state)) continue;
      const stagedRecord = await artifacts.get(job.artifactRefs[0]);
      const staged = JSON.parse(await fs.readFile(stagedRecord.contentPath, 'utf8'));
      const content = async ref => ref ? fs.readFile((await artifacts.get(ref)).contentPath, 'utf8') : '';
      const bundle = await content(staged.sourceBundleRef);
      const sourceBundle = bundle ? JSON.parse(bundle) : null;
      topics.push({ id: staged.keywordId || sourceBundle?.id || '', keyword: staged.keyword || sourceBundle?.keyword || '', title: await content(staged.titleRef), contentTrack: staged.contentTrack, evidencePath: staged.evidencePath, sourceBundle, blogUrl: job.blogUrl, pendingJobId: job.jobId });
    }
  }
  return topics;
}
