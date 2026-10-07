import fs from 'node:fs/promises';
import path from 'node:path';

export function resolveDataPaths(config) {
  const root = path.resolve(config.dataRoot);
  return {
    root,
    jobsDir: path.join(root, 'jobs'),
    eventsDir: path.join(root, 'events'),
    artifactsDir: path.join(root, 'artifacts'),
    artifactContentDir: path.join(root, 'artifacts', 'content'),
    artifactMetaDir: path.join(root, 'artifacts', 'meta'),
    runtimeDir: path.join(root, 'runtime'),
    locksDir: path.join(root, 'runtime', 'locks'),
    stagingDir: path.join(root, 'staging'),
    qrDir: path.join(root, 'qr')
  };
}

export async function ensureDataPaths(config, options = {}) {
  const fsApi = options.fs || fs;
  const paths = resolveDataPaths(config);
  await Promise.all(
    Object.values(paths).map(targetPath => fsApi.mkdir(targetPath, { recursive: true }))
  );
  return paths;
}
