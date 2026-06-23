import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function loadProjectEnv(options = {}) {
  const fallbackEnvPaths = Array.isArray(options.fallbackEnvPaths) ? options.fallbackEnvPaths : [];
  const candidates = [options.localEnvPath || '.env', ...fallbackEnvPaths];
  let localEnvPath = '';
  let hasLocalEnv = false;
  for (const candidate of candidates) {
    const resolved = path.resolve(String(candidate));
    if (fs.existsSync(resolved)) {
      localEnvPath = resolved;
      hasLocalEnv = true;
      process.loadEnvFile?.(resolved);
      break;
    }
  }

  const externalEnvPath = String(options.externalEnvPath || process.env.TISTORY_ENV_FILE || '').trim();
  if (externalEnvPath && fs.existsSync(externalEnvPath)) {
    process.loadEnvFile?.(externalEnvPath);
    if (hasLocalEnv) {
      process.loadEnvFile?.(localEnvPath);
    }
  }

  return {
    localEnvPath,
    hasLocalEnv,
    externalEnvPath,
    hasExternalEnv: Boolean(externalEnvPath && fs.existsSync(externalEnvPath))
  };
}
