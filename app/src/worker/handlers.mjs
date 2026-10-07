import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { importAndAnalyzeSources } from '../core/source/import-service.mjs';
import { resolveStagedPublishPayload, stagePublishPayload } from '../core/tistory/staged-payload-service.mjs';
import { notifyPublishResult } from '../../scripts/lib/discord-notify.mjs';
import { recordPublishFeedback } from '../../scripts/content/market-research.mjs';
import { appendPublishedLedger, isAlreadyPublished, loadPublishedLedger } from '../../scripts/lib/published-posts.mjs';
import { verifyCreativeEvidence } from '../../scripts/content/ai-video/evidence.mjs';

function randomId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// 성공 결과의 공개 permalink만 선택한다. 관리자 URL(/manage/*)은 절대 통과시키지 않는다.
function isPublicPostUrl(candidate, blogUrl) {
  const value = String(candidate || '').trim();
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    const host = url.host.toLowerCase();
    const path = url.pathname;
    if (!/^\/entry\/[^/?#]+$/i.test(path) && !/^\/\d{1,12}$/.test(path)) return false;
    const blogHost = String(blogUrl || '').trim()
      ? new URL(blogUrl.startsWith('http') ? blogUrl : `https://${blogUrl}`).host.toLowerCase()
      : '';
    if (blogHost) return host === blogHost;
    return host === 'tistory.com' || host.endsWith('.tistory.com');
  } catch {
    return false;
  }
}

function normalizeLedgerBlogUrl(value) {
  return String(value || '').trim().toLowerCase().replace(/\/+$/, '');
}

// 워커 중복 검사는 해당 블로그의 원장만 대상으로 한다.
// blogUrl이 없는 레거시 항목은 어느 블로그든 충돌할 수 있으므로 허용한다.
function ledgerForBlog(entries, blogUrl) {
  const target = normalizeLedgerBlogUrl(blogUrl);
  return (entries || []).filter(entry => {
    const entryBlog = normalizeLedgerBlogUrl(entry?.blogUrl);
    return !entryBlog || (target && entryBlog === target);
  });
}

// automation 결과에서 실제 글 permalink를 고른다. postUrl/permalink는 automation이
// 이미 /manage/*를 걸러낸 공개 URL만 넣지만, 방어적으로 한 번 더 검증한다.
export function resolvePublishPostUrl(result, { blogUrl = '' } = {}) {
  if (!result || typeof result !== 'object') return '';
  for (const candidate of [
    result.postUrl,
    result.permalink,
    result.publishedPost?.postUrl,
    result.publishResult?.postUrl,
    result.url
  ]) {
    if (isPublicPostUrl(candidate, blogUrl)) return String(candidate).trim();
  }
  return '';
}

export function createWorkerHandlers({ artifactStore, config, automation, sinks = {}, now = () => new Date() }) {
  // 알림/원장 sink는 실패해도 작업 결과를 바꾸지 않아야 하므로 개별 격리한다.
  const notifySink = sinks.notifyPublishResult || notifyPublishResult;
  const feedbackSink = sinks.recordPublishFeedback || recordPublishFeedback;
  const ledgerSink = sinks.appendPublishedLedger || appendPublishedLedger;
  const publishedLedgerPath = config?.publishedLedgerPath || process.env.PUBLISHED_LEDGER_PATH || undefined;


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
      if (resolved.contentTrack === 'ai-video') {
        const evidence = await verifyCreativeEvidence({
          evidencePath: resolved.evidencePath,
          bodyHtml: resolved.body
        });
        if (!evidence.ok) {
          await emitEvent?.({
            type: 'creative.evidence-blocked',
            detail: { failures: evidence.failures }
          });
          const error = new Error(`Creative evidence failed before publication: ${evidence.failures.join('; ')}`);
          error.code = 'creative-evidence-invalid';
          throw error;
        }
      }
      const sourceBundle = resolved?.sourceBundle && !Array.isArray(resolved.sourceBundle) ? resolved.sourceBundle : {};
      // 발행 전 원장 중복 차단: 주제/키워드/소스가 이미 발행된 글이면
      // 브라우저 발행 자체를 호출하지 않고 재시도 불가 오류로 작업을 종료한다.
      const ledger = await loadPublishedLedger(publishedLedgerPath);
      const duplicateCheck = isAlreadyPublished({
        id: resolved?.keywordId || sourceBundle.id || job.jobId,
        keyword: resolved?.keyword || sourceBundle.keyword || resolved?.title || '',
        title: resolved?.title || '',
        sourceBundle: resolved?.sourceBundle,
        contentTrack: resolved.contentTrack,
        blogUrl: job.blogUrl || ''
      }, { ledger: ledgerForBlog(ledger, job.blogUrl || resolved?.blogUrl || '') });
      if (duplicateCheck.matched) {
        await emitEvent?.({
          type: 'ledger.duplicate-blocked',
          detail: {
            jobId: job.jobId,
            rule: duplicateCheck.rule || null,
            against: duplicateCheck.against || null,
            title: resolved?.title || job.title || ''
          }
        });
        const duplicateError = new Error(`duplicate topic blocked by ledger (${duplicateCheck.rule}): ${resolved?.title || job.title || ''}`);
        duplicateError.code = 'duplicate-topic';
        throw duplicateError;
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

      const postUrl = resolvePublishPostUrl(result, { blogUrl: resolved?.blogUrl || job.blogUrl || '' });

      try {
        await notifySink({
          status: 'succeeded',
          title: resolved?.title || job.title || '',
          blogUrl: job.blogUrl || '',
          category: resolved?.category || '',
          jobId: job.jobId,
          postUrl,
          plainChars: resolved?.body ? String(resolved.body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length : null,
          message: 'publish_post succeeded'
        });
      } catch (notifyError) {
        await emitEvent?.({
          type: 'notify.discord-error',
          detail: { message: notifyError instanceof Error ? notifyError.message : String(notifyError) }
        });
      }
      try {
        await feedbackSink({
          keyword: resolved?.tags || '',
          title: resolved?.title || '',
          status: 'succeeded',
          category: resolved?.category || ''
        });
      } catch (feedbackError) {
        await emitEvent?.({
          type: 'notify.feedback-error',
          detail: { message: feedbackError instanceof Error ? feedbackError.message : String(feedbackError) }
        });
      }
      // 발행 원장(ledger) 기록 — 실제 발행이 성공했을 때만, 실제 URL과 함께 기록한다.
      // 제출 시점 기록(submit-queue)은 발행 실패 시 재발행을 막는 독이 된다.
      // 알림/피드백 실패와 독립적으로 실행되고, 실제 permalink를 확인하지 못한
      // 성공 결과는 빈 URL로 기록하지 않는다(이벤트만 남긴다).
      if (!postUrl) {
        await emitEvent?.({
          type: 'ledger.url-missing',
          detail: { jobId: job.jobId, title: resolved?.title || job.title || '' }
        });
      } else {
        try {
          await ledgerSink({
            id: resolved?.keywordId || sourceBundle.id || job.jobId,
            keyword: resolved?.keyword || sourceBundle.keyword || resolved?.title || '',
            title: resolved?.title || job.title || '',
            url: postUrl,
            category: resolved?.category || '',
            blogUrl: job.blogUrl || '',
            jobId: job.jobId,
            sourceBundle: resolved?.sourceBundle || null,
            contentTrack: resolved.contentTrack,
            evidencePath: resolved.evidencePath,
          }, publishedLedgerPath);
        } catch (ledgerError) {
          await emitEvent?.({
            type: 'ledger.write-error',
            detail: { message: ledgerError instanceof Error ? ledgerError.message : String(ledgerError) }
          });
        }
      }

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
