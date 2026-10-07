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

function isMissingActivePageFailure(error) {
  const message = String(error?.message || error || '');
  return /No active page|Target page, context or browser has been closed/i.test(message);
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

function runPlaywrightCdpFallback(mode, payload, { timeoutMs = 45_000 } = {}) {
  const script = `
import { chromium } from 'playwright-core';

const mode = process.env.GJC_CDP_MODE;
const payload = JSON.parse(process.env.GJC_CDP_PAYLOAD || '{}');
const port = process.env.CDP_PORT || '9222';
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + port);
let context = browser.contexts()[0] || null;
if (!context) context = await browser.newContext();
let pages = context.pages();
let page = pages.find(candidate => candidate.url() && candidate.url() !== 'about:blank') || pages[0] || null;
if (!page) page = await context.newPage();
if (mode === 'navigate') {
  await page.goto(payload.url, {
    waitUntil: payload.waitUntil || 'commit',
    timeout: Number.isFinite(payload.timeoutMs) ? payload.timeoutMs : 30000
  });
  process.stdout.write(JSON.stringify({ url: page.url() }));
} else if (mode === 'evaluate') {
  const value = await page.evaluate(expression => globalThis.eval(expression), payload.expression);
  process.stdout.write(typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value ?? null));
} else {
  throw new Error('Unsupported fallback mode: ' + mode);
}
await browser.close().catch(() => {});
`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      GJC_CDP_MODE: mode,
      GJC_CDP_PAYLOAD: JSON.stringify(payload)
    },
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL'
  });
  if (result.error) throw result.error;
  if ((result.status ?? 0) !== 0) {
    const detail = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n').trim();
    throw new Error(`playwright CDP fallback failed${detail ? `\n${detail}` : ''}`);
  }
  return (result.stdout || '').trim();
}

function runAgbrowseRecoverable(args, options = {}) {
  try {
    return runAgbrowse(args, options);
  } catch (error) {
    if (isMissingActivePageFailure(error)) {
      if (args[0] === 'navigate' && args[1]) {
        const waitUntilIndex = args.indexOf('--wait-until');
        const timeoutIndex = args.indexOf('--timeout');
        const stdout = runPlaywrightCdpFallback('navigate', {
          url: args[1],
          waitUntil: waitUntilIndex > -1 ? args[waitUntilIndex + 1] : 'commit',
          timeoutMs: timeoutIndex > -1 ? Number.parseInt(args[timeoutIndex + 1], 10) : 30000
        }, options);
        return { status: 0, stdout, stderr: '', combined: stdout };
      }
      if (args[0] === 'evaluate' && args[1]) {
        const stdout = runPlaywrightCdpFallback('evaluate', { expression: args[1] }, options);
        return { status: 0, stdout, stderr: '', combined: stdout };
      }
    }
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
  const stdout = runPlaywrightCdpFallback('navigate', {
    url,
    waitUntil: options.waitUntil || 'commit',
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000
  }, options);
  return { status: 0, stdout, stderr: '', combined: stdout };
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
  const stdout = runPlaywrightCdpFallback('evaluate', { expression });
  if (!stdout) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout;
  }
}