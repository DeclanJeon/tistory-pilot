#!/usr/bin/env node
/**
 * event-trigger.mjs — Shadow 이벤트 감지 (Phase 4)
 *
 * shadow-sources-<date>.json 에서 trigger/multi 신호를 읽어
 * 이벤트 파일을 content/learning/events/<date>.json 에 기록한다.
 * 실제 생성은 하지 않는다 — generate-daily.sh 의 Shadow 스텝과 별개로
 * 급상승 이벤트를 관측하는 용도다. 멱등성: 같은 date에 동일 trigger는 1회만 기록.
 *
 * 사용법: node scripts/content/event-trigger.mjs [--date YYYY-MM-DD] [--dry-run]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SHADOW_DIR = path.join(PROJECT_ROOT, 'content', 'learning');
const EVENTS_DIR = path.join(SHADOW_DIR, 'events');

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseArgs(argv) {
  const args = { date: '', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i + 1]) args.date = argv[i + 1], i++;
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--help') {
      console.log('사용법: node event-trigger.mjs [--date YYYY-MM-DD] [--dry-run]');
      process.exit(0);
    }
  }
  if (!args.date) args.date = todayDate();
  return args;
}

export async function detectEvents({ date }) {
  const shadowPath = path.join(SHADOW_DIR, `shadow-sources-${date}.json`);
  try {
    const raw = await fs.readFile(shadowPath, 'utf8');
    const data = JSON.parse(raw);
    const triggers = (data.merged || []).filter((m) => m.trigger === true || m.multi === true);
    return triggers.map((m) => ({
      normalized: m.normalized,
      trigger: m.trigger,
      multi: m.multi,
      sourceCount: m.sourceCount,
      sources: m.sources
    }));
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const events = await detectEvents({ date: args.date });
  console.log(`[event-trigger] date=${args.date} triggers=${events.length}`);
  for (const e of events.slice(0, 8)) {
    console.log(`  - ${e.normalized} trigger=${e.trigger} multi=${e.multi} sources=${e.sources.map(s=>s.source).join(',')}`);
  }
  if (events.length === 0) {
    console.log('[event-trigger] 트리거 없음 — 이벤트 파일 미생성');
    return;
  }
  await fs.mkdir(EVENTS_DIR, { recursive: true });
  const outPath = path.join(EVENTS_DIR, `${args.date}.json`);
  // 멱등성: 이미 있으면 덮어쓰지 않고 병합
  let existing = { date: args.date, events: [] };
  try {
    existing = JSON.parse(await fs.readFile(outPath, 'utf8'));
  } catch {}
  const existingKeys = new Set((existing.events || []).map((e) => e.normalized));
  const newEvents = events.filter((e) => !existingKeys.has(e.normalized));
  if (newEvents.length === 0) {
    console.log(`[event-trigger] 신규 트리거 없음 — ${outPath} 유지`);
    return;
  }
  const merged = { date: args.date, generatedAt: new Date().toISOString(), events: [...(existing.events || []), ...newEvents] };
  if (args.dryRun) {
    console.log(`[dry-run] ${outPath} 기록 생략`);
    return;
  }
  await fs.writeFile(outPath, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`[event-trigger] 이벤트 기록: ${outPath} (+${newEvents.length})`);
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('event-trigger.mjs')) {
  main().catch((error) => {
    console.error(`[event-trigger] 오류: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}