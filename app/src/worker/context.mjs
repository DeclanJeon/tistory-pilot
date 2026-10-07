import { assertWorkerBootstrapContract, createRuntimeConfig } from '../core/runtime/config.mjs';
import { ensureDataPaths } from '../core/runtime/paths.mjs';

export async function buildWorkerContext(options = {}) {
  assertWorkerBootstrapContract({
    argv: options.argv || [],
    env: options.env || process.env,
    mode: options.mode || 'queue-worker'
  });

  const config = createRuntimeConfig(options);
  const paths = await ensureDataPaths(config, options);
  return { config, paths };
}
