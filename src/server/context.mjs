import { createRuntimeConfig } from '../core/runtime/config.mjs';
import { ensureDataPaths } from '../core/runtime/paths.mjs';

export async function buildServerContext(options = {}) {
  const config = createRuntimeConfig(options);
  const paths = await ensureDataPaths(config, options);
  return { config, paths };
}
