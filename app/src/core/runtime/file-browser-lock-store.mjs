import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  canTakeOverStaleLock,
  createBrowserLockRecord,
  renewBrowserLock
} from './browser-lock.mjs';
import { readJsonFile } from './file-store.mjs';

const DEFAULT_GUARD_STALE_MS = 5_000;

async function writeExclusiveJson(filePath, value) {
  const handle = await fs.open(filePath, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
}

export class FileBrowserLockStore {
  constructor({
    paths,
    now = () => new Date(),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    guardStaleMs = DEFAULT_GUARD_STALE_MS
  }) {
    this.paths = paths;
    this.now = now;
    this.sleep = sleep;
    this.guardStaleMs = guardStaleMs;
  }

  lockPath(key = 'tistory-browser-lane') {
    return path.join(this.paths.locksDir, `${key}.json`);
  }

  guardPath(key = 'tistory-browser-lane') {
    return path.join(this.paths.locksDir, `${key}.guard`);
  }

  async get(key = 'tistory-browser-lane') {
    const lockPath = this.lockPath(key);
    try {
      return await readJsonFile(lockPath);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      if (error instanceof SyntaxError) {
        await fs.rm(lockPath, { force: true });
        return null;
      }
      throw error;
    }
  }

  async withGuard(key, action) {
    const guardPath = this.guardPath(key);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const handle = await fs.open(guardPath, 'wx');
        try {
          return await action();
        } finally {
          await handle.close();
          await fs.rm(guardPath, { force: true });
        }
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        try {
          const stat = await fs.stat(guardPath);
          if ((this.now().getTime() - stat.mtimeMs) >= this.guardStaleMs) {
            await fs.rm(guardPath, { force: true });
            continue;
          }
        } catch (statError) {
          if (statError?.code !== 'ENOENT') throw statError;
        }
        await this.sleep(10);
      }
    }
    throw new Error(`Lock guard is busy for ${key}`);
  }

  async acquire({ ownerId, jobId, leaseMs, heartbeatMs, staleThresholdMs, key = 'tistory-browser-lane' }) {
    return this.withGuard(key, async () => {
      const now = this.now();
      const record = {
        ...createBrowserLockRecord({
          ownerId,
          jobId,
          acquiredAt: now.toISOString(),
          heartbeatAt: now.toISOString(),
          leaseMs,
          heartbeatMs,
          staleThresholdMs
        }),
        token: crypto.randomUUID()
      };
      const lockPath = this.lockPath(key);

      try {
        await writeExclusiveJson(lockPath, record);
        return { acquired: true, staleTakeover: false, previousLock: null, lock: record };
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }

      const current = await this.get(key);
      if (current && !canTakeOverStaleLock(current, now.getTime())) {
        return { acquired: false, staleTakeover: false, lock: current };
      }

      if (!current) {
        await writeExclusiveJson(lockPath, record);
        return { acquired: true, staleTakeover: false, previousLock: null, lock: record };
      }

      const stalePath = `${lockPath}.stale-${now.getTime()}-${Math.random().toString(16).slice(2)}`;
      await fs.rename(lockPath, stalePath);
      try {
        await writeExclusiveJson(lockPath, record);
      } catch (error) {
        await fs.rename(stalePath, lockPath).catch(() => {});
        throw error;
      }
      await fs.rm(stalePath, { force: true });
      return {
        acquired: true,
        staleTakeover: true,
        previousLock: current,
        lock: record
      };
    });
  }

  async heartbeat({ ownerId, expectedToken = null, key = 'tistory-browser-lane' }) {
    return this.withGuard(key, async () => {
      const current = await this.get(key);
      if (!current) {
        return { renewed: false, reason: 'missing-lock' };
      }
      if (current.ownerId !== ownerId) {
        return { renewed: false, reason: 'owner-mismatch', lock: current };
      }
      if (expectedToken && current.token !== expectedToken) {
        return { renewed: false, reason: 'token-mismatch', lock: current };
      }
      const next = renewBrowserLock(current, this.now().toISOString());
      await fs.writeFile(this.lockPath(key), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      return { renewed: true, lock: next };
    });
  }

  async release({ ownerId, expectedToken = null, key = 'tistory-browser-lane' }) {
    return this.withGuard(key, async () => {
      const current = await this.get(key);
      if (!current) {
        return { released: false, reason: 'missing-lock' };
      }
      if (current.ownerId !== ownerId) {
        return { released: false, reason: 'owner-mismatch', lock: current };
      }
      if (expectedToken && current.token !== expectedToken) {
        return { released: false, reason: 'token-mismatch', lock: current };
      }
      await fs.rm(this.lockPath(key), { force: true });
      return { released: true, lock: current };
    });
  }
}
