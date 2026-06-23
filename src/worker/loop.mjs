import { buildWorkerContext } from './context.mjs';
import { createWorkerHandlers } from './handlers.mjs';
import { WorkerJobRunner } from './job-runner.mjs';
import { FileArtifactStore } from '../core/artifacts/file-artifact-store.mjs';
import { reapExpiredArtifacts, clearExpiredQrFiles } from './reaper.mjs';
import { createAgbrowseAutomation } from './agbrowse-automation.mjs';

export async function runWorkerLoop(options = {}) {
  const mode = options.jobId ? 'job-worker' : (options.mode || 'queue-worker');
  const context = await buildWorkerContext({ ...options, mode });
  const artifactStore = new FileArtifactStore({ paths: context.paths });
  const automation = createAgbrowseAutomation({
    qrEmailConfig: context.config.qrEmail
  });
  const handlers = createWorkerHandlers({ artifactStore, config: context.config, automation });
  const runner = new WorkerJobRunner({ config: context.config, paths: context.paths, handlers });
  await runner.recoverInterruptedJobs();

  const poll = async () => {
    await reapExpiredArtifacts({ config: context.config, paths: context.paths });
    await clearExpiredQrFiles({ config: context.config, paths: context.paths });
    if (options.jobId) {
      return runner.runJobById(options.jobId);
    }
    return runner.runNextJob();
  };

  if (options.once || options.jobId) {
    return poll();
  }

  let stopped = false;
  let timer = null;
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(async () => {
      try {
        await poll();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
      schedule();
    }, context.config.worker.pollMs);
  };

  await poll();
  schedule();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}
