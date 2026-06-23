import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { importAndAnalyzeSources } from '../core/source/import-service.mjs';
import { resolveStagedPublishPayload, stagePublishPayload } from '../core/tistory/staged-payload-service.mjs';

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createWorkerHandlers({ artifactStore, config, automation, now = () => new Date() }) {

  return {
    async source_import({ job }) {
      const sourceUrlsArtifactId = job.artifactRefs[0];
      if (!sourceUrlsArtifactId) {
        throw new Error('source_import job requires a source URL artifact reference.');
      }
      const sourceUrlsRecord = await artifactStore.get(sourceUrlsArtifactId);
      const sourceUrls = await fs.readFile(sourceUrlsRecord.contentPath, 'utf8');
      const outputDir = `${config.dataRoot}/imports/${job.jobId}`;
      const prepared = await importAndAnalyzeSources(sourceUrls, {
        outputDir,
        downloadHero: true,
        imageLimit: 4,
        maxParagraphs: 12,
        imageEvery: 3
      });


      const analysisRecord = await artifactStore.putJson({
        artifactId: randomId('source-analysis'),
        value: prepared.analysis,
        metadata: { kind: 'source-analysis' }
      });
      const bundleRecord = await artifactStore.putJson({
        artifactId: randomId('source-bundle'),
        value: prepared.source,
        metadata: { kind: 'source-bundle' }
      });
      const bodyRecord = await artifactStore.putText({
        artifactId: randomId('source-body'),
        text: prepared.bodyText,
        metadata: { kind: 'source-body' }
      });
      await fs.rm(outputDir, { recursive: true, force: true });
      return {
        artifactRefs: [analysisRecord.artifactId, bundleRecord.artifactId, bodyRecord.artifactId],
        result: {
          analysisRef: analysisRecord.artifactId,
          sourceBundleRef: bundleRecord.artifactId,
          bodyRef: bodyRecord.artifactId
        }
      };
    },

    async draft_prepare({ job }) {
      const requestRef = job.artifactRefs[0];
      if (!requestRef) {
        throw new Error('draft_prepare job requires a draft request artifact ref.');
      }
      const requestRecord = await artifactStore.get(requestRef);
      const draftRequest = await fs.readFile(requestRecord.contentPath, 'utf8').then(JSON.parse);
      const staged = await stagePublishPayload({ artifactStore, jobId: job.jobId, ...draftRequest });
      const stagedRecord = await artifactStore.putJson({
        artifactId: randomId('staged-publish-payload'),
        value: staged,
        metadata: { kind: 'staged-publish-payload', jobId: job.jobId }
      });
      return {
        artifactRefs: [stagedRecord.artifactId],
        result: { stagedPayloadRef: stagedRecord.artifactId }
      };
    },

    async publish_post({ job, emitEvent }) {
      const stagedRef = job.artifactRefs[0];
      if (!stagedRef) {
        throw new Error('publish_post job requires a staged payload artifact ref.');
      }
      const stagedRecord = await artifactStore.get(stagedRef);
      const stagedPayload = await fs.readFile(stagedRecord.contentPath, 'utf8').then(JSON.parse);
      const resolved = await resolveStagedPublishPayload({ artifactStore, payload: stagedPayload });
      if (!automation?.publishPost) {
        throw new Error('publish_post automation is not configured.');
      }
      const result = await automation.publishPost({
        ...resolved,
        qrImagePath: `${config.dataRoot}/qr/${job.jobId}.png`,
        waitForLoginMs: 900000,
        headed: !config.worker.browserHeadless,
        onQr: async qrLogin => {
          const qrRecord = await artifactStore.putText({
            artifactId: randomId('qr-image'),
            text: qrLogin.qrState?.dataUrl || '',
            metadata: { kind: 'qr-image', jobId: job.jobId, expiresAt: new Date(now().getTime() + config.retention.qrTtlMs).toISOString() }
          });

          await emitEvent?.({
            type: qrLogin.phase === 'refresh' ? 'qr.refreshed' : 'qr.ready',
            detail: {
              artifactRef: qrRecord.artifactId,
              timeLeftSeconds: qrLogin.qrState?.timeLeftSeconds || null
            }
          });

        },
        onQrResolved: async payload => {
          await emitEvent?.({
            type: 'qr.login-confirmed',
            detail: payload
          });
        }
      });

      const resultRecord = await artifactStore.putJson({
        artifactId: randomId('publish-result'),
        value: result,
        metadata: { kind: 'publish-result', jobId: job.jobId }
      });
      return { artifactRefs: [resultRecord.artifactId], result };
    },

    async category_ensure({ job, emitEvent }) {
      if (!automation?.ensureCategory) {
        throw new Error('category_ensure automation is not configured.');
      }
      const payloadRef = job.artifactRefs[0];
      if (!payloadRef) {
        throw new Error('category_ensure job requires a category request artifact ref.');
      }
      const payloadRecord = await artifactStore.get(payloadRef);
      const payload = await fs.readFile(payloadRecord.contentPath, 'utf8').then(JSON.parse);
      const result = await automation.ensureCategory({
        blogUrl: job.blogUrl,
        category: payload?.category || '',
        qrImagePath: `${config.dataRoot}/qr/${job.jobId}.png`,
        waitForLoginMs: 900000,
        headed: !config.worker.browserHeadless,
        onQr: async qrLogin => {
          const qrRecord = await artifactStore.putText({
            artifactId: randomId('qr-image'),
            text: qrLogin.qrState?.dataUrl || '',
            metadata: { kind: 'qr-image', jobId: job.jobId, expiresAt: new Date(now().getTime() + config.retention.qrTtlMs).toISOString() }
          });
          await emitEvent?.({
            type: qrLogin.phase === 'refresh' ? 'qr.refreshed' : 'qr.ready',
            detail: {
              artifactRef: qrRecord.artifactId,
              timeLeftSeconds: qrLogin.qrState?.timeLeftSeconds || null
            }
          });
        },
        onQrResolved: async payload => {
          await emitEvent?.({
            type: 'qr.login-confirmed',
            detail: payload
          });
        }
      });
      const resultRecord = await artifactStore.putJson({
        artifactId: randomId('category-result'),
        value: result,
        metadata: { kind: 'category-result', jobId: job.jobId }
      });
      return { artifactRefs: [resultRecord.artifactId], result };
    }
  };
}
