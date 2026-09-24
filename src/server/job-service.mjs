import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileArtifactStore } from '../core/artifacts/file-artifact-store.mjs';
import { FileJobStore } from '../core/jobs/file-job-store.mjs';
import { getTemplateCatalog } from '../core/templates/catalog.mjs';
import { generateDraftFromMarkdown } from '../core/templates/draft-generator.mjs';
import { stagePublishPayload } from '../core/tistory/staged-payload-service.mjs';


function jobId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function artifactId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function analyzeMarkdownSource(markdown, options = {}) {
  return generateDraftFromMarkdown({
    markdown,
    templateId: options.templateId || '',
    description: options.description || ''
  });
}

export class JobService {
  constructor({ config, paths, now = () => new Date().toISOString() }) {
    this.config = config;
    this.paths = paths;
    this.now = now;
    this.jobStore = new FileJobStore({ paths, now });
    this.artifactStore = new FileArtifactStore({ paths, now });
  }

  async listJobs() {
    return this.jobStore.list();
  }

  async getJob(jobIdValue) {
    return this.jobStore.get(jobIdValue);
  }

  async readJobEvents(jobIdValue) {
    try {
      const raw = await fs.readFile(path.join(this.paths.eventsDir, `${jobIdValue}.jsonl`), 'utf8');
      return raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async resolveJobArtifacts(jobIdValue, artifactRefs = []) {
    const events = await this.readJobEvents(jobIdValue);
    const eventArtifactRefs = events
      .filter(event => event.type === 'qr.ready' || event.type === 'qr.refreshed')
      .map(event => event.detail?.artifactRef)
      .filter(Boolean);
    const mergedRefs = [...new Set([...artifactRefs, ...eventArtifactRefs])];
    return this.resolveArtifacts(mergedRefs);
  }

  async resolveArtifacts(artifactRefs = []) {
    const results = [];
    for (const artifactRef of artifactRefs) {
      let record;
      try {
        record = await this.artifactStore.get(artifactRef);
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
      const raw = await fs.readFile(record.contentPath, 'utf8');
      results.push({
        artifactId: artifactRef,
        kind: record.metadata?.kind || record.kind,
        value: record.extension === '.json' ? JSON.parse(raw) : raw
      });
    }
    return results;
  }

  async createSourceImportJob({ createdBy, blogUrl, links }) {
    const jobIdValue = jobId('source-import');
    const linksRecord = await this.artifactStore.putText({
      artifactId: artifactId('source-links'),
      text: links.join('\n'),
      metadata: { kind: 'source-links', jobId: jobIdValue }
    });
    return this.jobStore.create({
      jobId: jobIdValue,
      type: 'source_import',
      state: 'queued',
      blogUrl,
      createdBy,
      artifactRefs: [linksRecord.artifactId]
    });
  }

  async createPublishJob({
    createdBy,
    blogUrl,
    title,
    body,
    description,
    tags,
    category = '',
    heroImagePath = '',
    templateId = '',
    sourceBundle = null,
    imageProvenance = null,
    runId = null,
    idempotencyKey = null,
    notBefore = null,
    maxAttempts = 1
  }) {
    const stableJobId = idempotencyKey
      ? `publish-post-${crypto.createHash('sha256').update(String(idempotencyKey)).digest('hex').slice(0, 32)}`
      : null;
    if (stableJobId) {
      try {
        return await this.jobStore.get(stableJobId);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    const jobIdValue = stableJobId || jobId('publish-post');
    const staged = await stagePublishPayload({
      artifactStore: this.artifactStore,
      jobId: jobIdValue,
      blogUrl,
      title,
      body,
      description,
      tags,
      category,
      heroImagePath,
      templateId,
      sourceBundle,
      imageProvenance
    });
    const stagedRecord = await this.artifactStore.putJson({
      artifactId: artifactId('staged-publish-payload'),
      value: staged,
      metadata: { kind: 'staged-publish-payload', jobId: jobIdValue }
    });
    try {
      return await this.jobStore.create({
        jobId: jobIdValue,
        type: 'publish_post',
        state: 'queued',
        blogUrl,
        createdBy,
        artifactRefs: [stagedRecord.artifactId],
        runId,
        idempotencyKey,
        notBefore,
        maxAttempts
      });
    } catch (error) {
      if (stableJobId && /Job already exists/.test(error?.message || '')) {
        return this.jobStore.get(stableJobId);
      }
      throw error;
    }
  }

  async createCategoryEnsureJob({ createdBy, blogUrl, category }) {
    const jobIdValue = jobId('category-ensure');
    const payloadRecord = await this.artifactStore.putJson({
      artifactId: artifactId('category-request'),
      value: { category },
      metadata: { kind: 'category-request', jobId: jobIdValue }
    });
    return this.jobStore.create({
      jobId: jobIdValue,
      type: 'category_ensure',
      state: 'queued',
      blogUrl,
      createdBy,
      artifactRefs: [payloadRecord.artifactId]
    });
  }

  getTemplateCatalog() {
    return getTemplateCatalog();
  }
}
