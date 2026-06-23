import fs from 'node:fs/promises';
import path from 'node:path';
import { createJobEvent, createJobMetadata, validateJobMetadata } from './contracts.mjs';
import { appendJsonLine, readJsonFile, writeJsonFileAtomic } from '../runtime/file-store.mjs';

export class FileJobStore {
  constructor({ paths, now = () => new Date().toISOString() }) {
    this.paths = paths;
    this.now = now;
  }

  jobPath(jobId) {
    return path.join(this.paths.jobsDir, `${jobId}.json`);
  }

  eventPath(jobId) {
    return path.join(this.paths.eventsDir, `${jobId}.jsonl`);
  }

  async create(input) {
    const job = createJobMetadata(input);
    await fs.access(this.jobPath(job.jobId)).then(
      () => {
        throw new Error(`Job already exists: ${job.jobId}`);
      },
      error => {
        if (error?.code !== 'ENOENT') throw error;
      }
    );
    await writeJsonFileAtomic(this.jobPath(job.jobId), job);
    await this.appendEvent(job.jobId, {
      type: 'job.created',
      detail: { state: job.state, type: job.type }
    });
    return job;
  }

  async get(jobId) {
    return validateJobMetadata(await readJsonFile(this.jobPath(jobId)));
  }

  async list() {
    const entries = await fs.readdir(this.paths.jobsDir, { withFileTypes: true });
    const jobs = await Promise.all(
      entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
        .map(entry => this.get(entry.name.replace(/\.json$/, '')))
    );
    return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listByState(state) {
    const jobs = await this.list();
    return jobs.filter(job => job.state === state);
  }

  async readEvents(jobId) {
    try {
      const raw = await fs.readFile(this.eventPath(jobId), 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async update(jobId, updater) {
    const current = await this.get(jobId);
    const nextValue = typeof updater === 'function' ? updater(current) : updater;
    const next = validateJobMetadata({
      ...current,
      ...nextValue,
      updatedAt: this.now()
    });
    await writeJsonFileAtomic(this.jobPath(jobId), next);
    return next;
  }

  async appendEvent(jobId, input) {
    const event = createJobEvent({
      jobId,
      at: this.now(),
      ...input
    });
    await appendJsonLine(this.eventPath(jobId), event);
    return event;
  }
}
