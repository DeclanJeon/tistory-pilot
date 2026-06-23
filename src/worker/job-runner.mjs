import { FileBrowserLockStore } from '../core/runtime/file-browser-lock-store.mjs';
import { FileJobStore } from '../core/jobs/file-job-store.mjs';
import { FileArtifactStore } from '../core/artifacts/file-artifact-store.mjs';

const BROWSER_JOB_TYPES = new Set(['publish_post', 'category_ensure', 'draft_prepare']);
const RECOVERABLE_STATES = new Set(['running', 'waiting_for_qr', 'waiting_for_editor']);

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
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
  }

  async recoverInterruptedJobs() {
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
    const job = queued[0];
    if (!job) return null;
    return this.executeJob(job);
  }

  async runJobById(jobId) {
    const job = await this.jobStore.get(jobId);
    if (RECOVERABLE_STATES.has(job.state)) {
      await this.jobStore.update(job.jobId, current => ({ ...current, state: 'queued', lockOwner: null }));
      await this.jobStore.appendEvent(job.jobId, {
        type: 'job.recovered',
        detail: { previousState: job.state, reason: 'job-worker-requeue' }
      });
      return this.executeJob({ ...job, state: 'queued', lockOwner: null });
    }
    if (job.state !== 'queued') {
      return { skipped: true, reason: `job-not-runnable:${job.state}`, jobId: job.jobId };
    }
    return this.executeJob(job);
  }

  async executeJob(job) {
    await this.jobStore.update(job.jobId, current => ({ ...current, state: 'running' }));
    await this.jobStore.appendEvent(job.jobId, {
      type: 'job.started',
      detail: { workerId: this.config.worker.workerId }
    });

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
        detail: { artifactRefs: outcome.artifactRefs || [], result: outcome.result || null }
      });
      return { jobId: job.jobId, state: 'succeeded', result: outcome.result || null };
    } catch (error) {
      await this.jobStore.update(job.jobId, current => ({
        ...current,
        state: 'failed',
        lockOwner: null,
        failureCode: 'job-failed'
      }));
      await this.jobStore.appendEvent(job.jobId, {
        type: 'job.failed',
        detail: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : null
        }
      });
      return { jobId: job.jobId, state: 'failed', error: error instanceof Error ? error.message : String(error) };
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
