import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export function loadProjectEnv(options = {}) {
  const localEnvPath = path.resolve(String(options.localEnvPath || '.env'));
  const hasLocalEnv = fs.existsSync(localEnvPath);
  if (hasLocalEnv) {
    process.loadEnvFile?.(localEnvPath);
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
