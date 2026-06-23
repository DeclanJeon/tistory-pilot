import fs from 'node:fs/promises';
import path from 'node:path';
import { FileArtifactStore } from '../core/artifacts/file-artifact-store.mjs';
import { FileJobStore } from '../core/jobs/file-job-store.mjs';
import { computeQrArtifactExpiry, computeStagedArtifactExpiry } from '../core/artifacts/retention.mjs';

function getLatestQrLoginConfirmedAt(events) {
  return events
    .filter(event => event.type === 'qr.login-confirmed' && event.detail?.confirmedAt)
    .map(event => event.detail.confirmedAt)
    .sort()
    .at(-1) || null;
}

const STAGED_ARTIFACT_KINDS = new Set([
  'staged-publish-payload',
  'publish-title',
  'publish-body',
  'description',
  'tags',
  'category',
  'hero-image-path',
  'source-bundle'
]);



export async function reapExpiredArtifacts({ config, paths, now = () => new Date().toISOString() }) {
  const artifactStore = new FileArtifactStore({ paths, now });
  const jobStore = new FileJobStore({ paths, now });
  const entries = await fs.readdir(paths.artifactMetaDir, { withFileTypes: true });
  const removed = [];
  const currentTime = new Date(now()).getTime();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const artifactId = entry.name.replace(/\.json$/, '');
    const record = await artifactStore.get(artifactId);
    let expiresAt = record.expiresAt || null;

    if (record.metadata?.kind === 'qr-image' && record.metadata?.jobId) {
      const job = await jobStore.get(record.metadata.jobId);
      const events = await jobStore.readEvents(record.metadata.jobId);
      expiresAt = computeQrArtifactExpiry({
        createdAt: record.createdAt,
        loginCompletedAt: getLatestQrLoginConfirmedAt(events),
        failedAt: ['failed', 'cancelled', 'timed_out'].includes(job.state) ? job.updatedAt : null,
        retention: config.retention
      });
    } else if (!expiresAt && STAGED_ARTIFACT_KINDS.has(String(record.metadata?.kind || '')) && record.metadata?.jobId) {
      const job = await jobStore.get(record.metadata.jobId);
      expiresAt = computeStagedArtifactExpiry({ updatedAt: job.updatedAt, state: job.state, retention: config.retention });
    }

    if (!expiresAt) continue;
    if (new Date(expiresAt).getTime() > currentTime) continue;

    await artifactStore.delete(artifactId);
    removed.push({ artifactId, kind: record.metadata?.kind || record.kind, expiredAt: expiresAt });
  }

  return removed;
}

export async function clearExpiredQrFiles({ config, paths, now = () => new Date().toISOString() }) {
  const jobStore = new FileJobStore({ paths, now });
  const entries = await fs.readdir(paths.qrDir, { withFileTypes: true });
  const removed = [];
  const currentTime = new Date(now()).getTime();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(paths.qrDir, entry.name);
    const stat = await fs.stat(filePath);
    const jobId = entry.name.replace(path.extname(entry.name), '');
    let expiresAt = new Date(stat.mtimeMs + config.retention.qrTtlMs).toISOString();

    try {
      const job = await jobStore.get(jobId);
      const events = await jobStore.readEvents(jobId);
      expiresAt = computeQrArtifactExpiry({
        createdAt: new Date(stat.mtimeMs).toISOString(),
        loginCompletedAt: getLatestQrLoginConfirmedAt(events),
        failedAt: ['failed', 'cancelled', 'timed_out'].includes(job.state) ? job.updatedAt : null,
        retention: config.retention
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    if (new Date(expiresAt).getTime() > currentTime) continue;
    await fs.rm(filePath, { force: true });
    removed.push(filePath);
  }
  return removed;
}
