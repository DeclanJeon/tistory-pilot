import { FileBrowserLockStore } from '../core/runtime/file-browser-lock-store.mjs';
import { FileJobStore } from '../core/jobs/file-job-store.mjs';
import { FileArtifactStore } from '../core/artifacts/file-artifact-store.mjs';
import { notifyPublishResult } from '../../scripts/lib/discord-notify.mjs';

const BROWSER_JOB_TYPES = new Set(['publish_post', 'category_ensure', 'draft_prepare']);
const RECOVERABLE_STATES = new Set(['running', 'waiting_for_qr', 'waiting_for_editor']);
const RETRYABLE_ERROR_RE = /(?:econnreset|econnrefused|etimedout|timeout|network|socket|5\d\d|temporar|disconnected|target closed)/i;

function isJobDue(job, now = Date.now()) {
  for (const field of ['notBefore', 'nextAttemptAt']) {
    if (job[field] && Date.parse(job[field]) > now) return false;
  }
  return true;
}

function isRetryableError(error) {
  return Boolean(error?.retryable) || RETRYABLE_ERROR_RE.test(error instanceof Error ? error.message : String(error));
}

function retryAt(attempt, now = Date.now()) {
  const delayMs = Math.min(15 * 60_000, 30_000 * (2 ** Math.max(0, attempt - 1)));
  return new Date(now + delayMs).toISOString();
}

export class WorkerJobRunner {
  constructor({
    config,
    paths,
    handlers,
    now = () => new Date().toISOString(),
    clock = () => new Date(),
    jobStore = null,
    artifactStore = null,
    lockStore = null,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
  }) {
    this.config = config;
    this.paths = paths;
    this.handlers = handlers;
    this.jobStore = jobStore || new FileJobStore({ paths, now });
    this.artifactStore = artifactStore || new FileArtifactStore({ paths, now });
    this.lockStore = lockStore || new FileBrowserLockStore({ paths, now: clock });
    this.now = now;
    this.clock = clock;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
  }

  async recoverInterruptedJobs() {
    const nowMs = Date.now();
    const lockKey = this.config.lock?.key || 'tistory-browser-lane';
    try {
      const currentLock = await this.lockStore.get(lockKey);
      if (currentLock) {
        const heartbeatMs = new Date(currentLock.heartbeatAt).getTime();
        const staleMs = currentLock.staleThresholdMs || 150_000;
        const leaseMs = currentLock.leaseMs || 90_000;
        if ((heartbeatMs + staleMs <= nowMs) || (heartbeatMs + leaseMs <= nowMs)) {
          await this.lockStore.release({ ownerId: currentLock.ownerId, expectedToken: currentLock.token, key: lockKey }).catch(() => {});
        }
      }
    } catch { /* ignore lock cleanup errors */ }

    const jobs = await this.jobStore.list();
    const recoverable = jobs.filter(job => RECOVERABLE_STATES.has(job.state));
    for (const job of recoverable) {
      await this.jobStore.update(job.jobId, current => ({ ...current, state: 'queued', lockOwner: null }));
      await this.jobStore.appendEvent(job.jobId, {
        type: 'job.recovered',
        detail: { previousState: job.state, reason: 'worker-startup-requeue' }
      });
    }
    return recoverable.map(job => job.jobId);
  }

  async runNextJob() {
    const queued = await this.jobStore.listByState('queued');
    const job = queued.find(candidate => isJobDue(candidate, this.clock().getTime()));
    if (!job) return null;
    return this.executeJob(job);
  }

  async runJobById(jobId) {
    const job = await this.jobStore.get(jobId);
    if (!isJobDue(job, this.clock().getTime())) {
      return { skipped: true, reason: 'job-not-due', jobId };
    }
    if (RECOVERABLE_STATES.has(job.state)) {
      await this.jobStore.update(job.jobId, current => ({ ...current, state: 'queued', lockOwner: null }));
      await this.jobStore.appendEvent(job.jobId, {
        type: 'job.recovered',
        detail: { previousState: job.state, reason: 'job-worker-requeue' }
      });
      return this.executeJob({ ...job, state: 'queued', lockOwner: null });
    }
    if (job.state !== 'queued') {
      return { skipped: true, reason: `job-not-runnable:${job.state}`, jobId };
    }
    return this.executeJob(job);
  }

  async executeJob(job) {
    const attempt = (job.attempt || 0) + 1;
    const handler = this.handlers[job.type];
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`);
    }

    let acquiredLock = null;
    let heartbeatTimer = null;
    try {
      if (BROWSER_JOB_TYPES.has(job.type)) {
        const lockResult = await this.lockStore.acquire({
          ownerId: this.config.worker.workerId,
          jobId: job.jobId,
          leaseMs: this.config.lock.leaseMs,
          heartbeatMs: this.config.lock.heartbeatMs,
          staleThresholdMs: this.config.lock.staleThresholdMs,
          key: this.config.lock.key
        });
        if (!lockResult.acquired) {
          await this.jobStore.update(job.jobId, current => ({ ...current, state: 'queued' }));
          await this.jobStore.appendEvent(job.jobId, {
            type: 'lock.skipped',
            detail: { ownerId: lockResult.lock?.ownerId || null, jobId: lockResult.lock?.jobId || null }
          });
          return { deferred: true, reason: 'lock-busy', jobId: job.jobId };
        }
        acquiredLock = lockResult.lock;
        await this.jobStore.update(job.jobId, current => ({ ...current, lockOwner: this.config.worker.workerId }));
        await this.jobStore.appendEvent(job.jobId, {
          type: lockResult.staleTakeover ? 'lock.stale-takeover' : 'lock.acquired',
          detail: {
            ownerId: this.config.worker.workerId,
            previousOwnerId: lockResult.previousLock?.ownerId || null,
            previousJobId: lockResult.previousLock?.jobId || null
          }
        });
        heartbeatTimer = this.setIntervalFn(async () => {
          try {
            const heartbeat = await this.lockStore.heartbeat({
              ownerId: this.config.worker.workerId,
              expectedToken: acquiredLock.token,
              key: this.config.lock.key
            });
            await this.jobStore.appendEvent(job.jobId, {
              type: heartbeat.renewed ? 'lock.heartbeat' : 'lock.heartbeat-missed',
              detail: {
                ownerId: this.config.worker.workerId,
                reason: heartbeat.reason || null
              }
            });
          } catch (error) {
            try {
              await this.jobStore.appendEvent(job.jobId, {
                type: 'lock.heartbeat-error',
                detail: {
                  ownerId: this.config.worker.workerId,
                  message: error instanceof Error ? error.message : String(error)
                }
              });
            } catch {
              // Ignore secondary logging failures inside the background heartbeat.
            }
          }
        }, this.config.lock.heartbeatMs);
      }

      job = await this.jobStore.update(job.jobId, current => ({
        ...current,
        state: 'running',
        attempt,
        nextAttemptAt: null
      }));
      await this.jobStore.appendEvent(job.jobId, {
        type: 'job.started',
        detail: { workerId: this.config.worker.workerId, runId: job.runId, attempt, maxAttempts: job.maxAttempts }
      });
      const outcome = await handler({
        job,
        emitEvent: input => this.jobStore.appendEvent(job.jobId, input)
      });
      const mergedArtifactRefs = [...job.artifactRefs, ...(outcome.artifactRefs || [])];
      await this.jobStore.update(job.jobId, current => ({
        ...current,
        state: 'succeeded',
        artifactRefs: mergedArtifactRefs,
        lockOwner: null,
        failureCode: null
      }));
      await this.jobStore.appendEvent(job.jobId, {
        type: 'job.succeeded',
        detail: { runId: job.runId, artifactRefs: outcome.artifactRefs || [], result: outcome.result || null }
      });
      return { jobId: job.jobId, state: 'succeeded', result: outcome.result || null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const uncertain = error?.uncertain === true || error?.code === 'publish-uncertain';
      const retryable = !uncertain && isRetryableError(error);
      if (uncertain) {
        await this.jobStore.update(job.jobId, current => ({
          ...current,
          state: 'waiting_for_reconcile',
          lockOwner: null,
          failureCode: 'publish-uncertain',
          nextAttemptAt: null
        }));
        await this.jobStore.appendEvent(job.jobId, {
          type: 'job.waiting-for-reconcile',
          detail: { attempt: job.attempt, message }
        });
        return { jobId: job.jobId, state: 'waiting_for_reconcile', error: message };
      }
      if (retryable && job.attempt < job.maxAttempts) {
        const nextAttemptAt = retryAt(job.attempt, this.clock().getTime());
        await this.jobStore.update(job.jobId, current => ({
          ...current,
          state: 'queued',
          lockOwner: null,
          failureCode: 'retryable-error',
          nextAttemptAt
        }));
        await this.jobStore.appendEvent(job.jobId, {
          type: 'job.retry-scheduled',
          detail: { attempt: job.attempt, maxAttempts: job.maxAttempts, nextAttemptAt, message }
        });
        return { jobId: job.jobId, state: 'queued', retryAt: nextAttemptAt, error: message };
      }
      await this.jobStore.update(job.jobId, current => ({
        ...current,
        state: 'failed',
        lockOwner: null,
        failureCode: retryable ? 'retry-exhausted' : 'job-failed',
        nextAttemptAt: null
      }));
      await this.jobStore.appendEvent(job.jobId, {
        type: 'job.failed',
        detail: { attempt: job.attempt, maxAttempts: job.maxAttempts, message, stack: error instanceof Error ? error.stack : null }
      });
      try {
        if (job.type === 'publish_post') {
          await notifyPublishResult({
            status: 'failed',
            title: job.title || job.jobId,
            blogUrl: job.blogUrl || '',
            category: job.category || '',
            jobId: job.jobId,
            message
          });
        }
      } catch {
        // ignore notify failure
      }
      return { jobId: job.jobId, state: 'failed', error: message };
    } finally {
      if (heartbeatTimer) {
        this.clearIntervalFn(heartbeatTimer);
      }
      if (acquiredLock) {
        const release = await this.lockStore.release({
          ownerId: this.config.worker.workerId,
          expectedToken: acquiredLock.token,
          key: this.config.lock.key
        });
        await this.jobStore.appendEvent(job.jobId, {
          type: release.released ? 'lock.released' : 'lock.release-skipped',
          detail: {
            ownerId: this.config.worker.workerId,
            reason: release.reason || null
          }
        });
      }
    }
  }
}
