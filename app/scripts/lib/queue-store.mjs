/**
 * queue-store.mjs — scheduled 큐 JSON 파일의 공통 락 + 원자 갱신
 *
 * 큐 파일(날짜별 JSON), project.json 등 "읽기-수정-쓰기" 패턴이 필요한
 * JSON 파일에 대해 프로세스 간 배타 락과 원자 교체를 제공한다.
 *
 * - writeJsonAtomic(filePath, value): 같은 디렉터리의 temp 파일에 쓴 뒤
 *   rename으로 원자 교체한다. 부분 기록 파일이 관찰되지 않는다.
 * - withQueueFileLock(filePath, fn, opts): `<filePath>.lock` 디렉터리를
 *   mkdir로 점유하는 배타 락. 크래시로 남은 락은 mtime이 staleMs를 넘으면
 *   회수한다. 획득 대기는 timeoutMs로 상한이 있어 무한 대기하지 않는다.
 *   락 해제는 finally에서 항상 수행한다.
 * - updateQueueFile(filePath, updater, opts): 락 안에서 파일을 읽고
 *   updater(data)를 호출한다. updater가 undefined를 반환하면 쓰지 않는다
 *   (거부). 다른 값을 반환하면 원자 기록한다. 파일이 없으면 data=null.
 *   손상된 JSON은 절대 덮어쓰지 않고 오류를 전파한다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_STALE_MS = 120_000;
const DEFAULT_POLL_MS = 40;

export class QueueLockTimeoutError extends Error {
  constructor(lockDir, timeoutMs) {
    super(`queue lock timeout after ${timeoutMs}ms: ${lockDir}`);
    this.name = 'QueueLockTimeoutError';
    this.lockDir = lockDir;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

async function reclaimStaleLock(lockDir, staleMs) {
  try {
    const observed = await fs.stat(lockDir);
    if (Date.now() - observed.mtimeMs <= staleMs) return false;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
  const recoveryDir = `${lockDir}.recovery`;
  try { await fs.mkdir(recoveryDir); }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  try {
    const stat = await fs.stat(lockDir);
    if (Date.now() - stat.mtimeMs <= staleMs) return false;
    let owner;
    try { owner = JSON.parse(await fs.readFile(path.join(lockDir, 'owner.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (processIsAlive(owner?.pid)) return false;
    await fs.rm(lockDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  } finally {
    await fs.rm(recoveryDir, { recursive: true, force: true });
  }
}

export async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fs.rename(tempPath, filePath);
}

export async function withQueueFileLock(filePath, fn, {
  timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
  staleMs = DEFAULT_STALE_MS,
  pollMs = DEFAULT_POLL_MS
} = {}) {
  const lockDir = `${filePath}.lock`;
  const ownerPath = path.join(lockDir, 'owner.json');
  const owner = { pid: process.pid, token: randomUUID() };
  // 부모 디렉터리가 없으면 mkdir(lockDir)이 ENOENT로 실패한다 — 먼저 보장.
  await fs.mkdir(path.dirname(lockDir), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fs.mkdir(lockDir);
      try { await fs.writeFile(ownerPath, JSON.stringify(owner), 'utf8'); }
      catch (error) { await fs.rm(lockDir, { recursive: true, force: true }); throw error; }
      break; // 락 획득
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await reclaimStaleLock(lockDir, staleMs)) continue;
      if (Date.now() >= deadline) {
        throw new QueueLockTimeoutError(lockDir, timeoutMs);
      }
      await sleep(pollMs);
    }
  }
  try {
    return await fn();
  } finally {
    try {
      const current = JSON.parse(await fs.readFile(ownerPath, 'utf8'));
      if (current.token === owner.token) await fs.rm(lockDir, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export async function updateQueueFile(filePath, updater, options = {}) {
  return withQueueFileLock(filePath, async () => {
    let data = null;
    try {
      data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
      // 없는 파일만 새로 만든다. 손상된 JSON은 덮어쓰지 않고 실패시킨다.
      if (error.code !== 'ENOENT') throw error;
    }
    const next = await updater(data);
    let changed = false;
    if (next !== undefined) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await writeJsonAtomic(filePath, next);
      changed = true;
    }
    return { changed, data: next === undefined ? data : next };
  }, options);
}
