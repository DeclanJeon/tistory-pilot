import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const AGBROWSE_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'agbrowse');

function formatCommand(args) {
  return ['agbrowse', ...args].join(' ');
}

export function runAgbrowse(args, options = {}) {
  const { env = {}, allowFailure = false, timeoutMs = 45_000 } = options;
  const result = spawnSync(AGBROWSE_BIN, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL'
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  if (result.status !== 0 && !allowFailure) {
    const detail = [stdout, stderr].filter(Boolean).join('\n');
    throw new Error(`${formatCommand(args)} failed with exit code ${result.status}${detail ? `\n${detail}` : ''}`);
  }

  return {
    status: result.status ?? 0,
    stdout,
    stderr,
    combined: [stdout, stderr].filter(Boolean).join('\n')
  };
}

function isRecoverableCdpFailure(error) {
  const message = String(error?.message || error || '');
  return error?.code === 'ETIMEDOUT' || /CDP connection failed|CDP connect attempt|browserType\.connectOverCDP|Chrome CDP not responding|Timeout .*exceeded|spawnSync .* ETIMEDOUT/i.test(message);
}
function shouldRecoverHeaded(options = {}) {
  return options.headed === true || String(process.env.PUBLISH_WORKBENCH_BROWSER_HEADLESS || '').trim() === '0';
}


function recoverBrowser({ headed = false } = {}) {
  stopBrowser();
  const env = headed ? {} : { CHROME_HEADLESS: '1' };
  const args = headed ? ['start', '--headed'] : ['start'];
  runAgbrowse(args, { env });
}

function runAgbrowseRecoverable(args, options = {}) {
  try {
    return runAgbrowse(args, options);
  } catch (error) {
    if (!isRecoverableCdpFailure(error)) throw error;
    recoverBrowser({ headed: shouldRecoverHeaded(options) });
    return runAgbrowse(args, options);
  }
}

export function browserStatus() {
  const result = runAgbrowse(['status'], { allowFailure: true });
  const combined = result.combined;
  return {
    running: result.status === 0 && /running:\s*true/i.test(combined),
    raw: combined
  };
}

export function ensureBrowserStarted({ headed = false } = {}) {
  const status = browserStatus();
  if (status.running) {
    return { started: false, headed };
  }

  const env = headed ? {} : { CHROME_HEADLESS: '1' };
  const args = headed ? ['start', '--headed'] : ['start'];
  runAgbrowse(args, { env });
  return { started: true, headed };
}

export function stopBrowser() {
  return runAgbrowse(['stop'], { allowFailure: true });
}

export function navigate(url, options = {}) {
  const args = ['navigate', url];
  if (options.waitUntil) args.push('--wait-until', String(options.waitUntil));
  if (Number.isFinite(options.timeoutMs)) args.push('--timeout', String(options.timeoutMs));
  return runAgbrowseRecoverable(args);
}

export function wait(ms) {
  return runAgbrowseRecoverable(['wait', String(ms)]);
}

export function snapshot({ interactive = true, maxNodes = 40 } = {}) {
  const args = ['snapshot'];
  if (interactive) args.push('--interactive');
  if (maxNodes) args.push('--max-nodes', String(maxNodes));
  return runAgbrowseRecoverable(args).stdout;
}

function buildExpression(pageFunction, payload) {
  if (typeof payload === 'undefined') {
    return `(${pageFunction.toString()})()`;
  }
  return `(${pageFunction.toString()})(${JSON.stringify(payload)})`;
}

export function evaluate(pageFunction, payload) {
  const expression = buildExpression(pageFunction, payload);
  const result = runAgbrowseRecoverable(['evaluate', expression, '--unsafe-allow', 'evaluate']);
  if (!result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return result.stdout;
  }
}
