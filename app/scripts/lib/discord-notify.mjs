#!/usr/bin/env node
/**
 * discord-notify.mjs — Discord webhook 알림
 */
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { URL } from 'node:url';

function parseBool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return fallback;
}

export function resolveDiscordWebhook(env = process.env) {
  const url = String(
    env.DISCORD_WEBHOOK_URL
    || env.TISTORY_DISCORD_WEBHOOK_URL
    || env.PUBLISH_WORKBENCH_DISCORD_WEBHOOK_URL
    || ''
  ).trim();
  const enabled = parseBool(env.DISCORD_WEBHOOK_ENABLED, Boolean(url));
  return { enabled: enabled && Boolean(url), url };
}

function postJson(urlString, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = JSON.stringify(payload);
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, statusCode: res.statusCode, body: data });
        } else {
          resolve({ ok: false, statusCode: res.statusCode, body: data.slice(0, 300) });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Discord webhook timeout'));
    });
    req.write(body);
    req.end();
  });
}

export async function sendDiscordWebhook(payload, env = process.env) {
  const cfg = resolveDiscordWebhook(env);
  if (!cfg.enabled) {
    return { ok: false, skipped: true, reason: 'discord-webhook-disabled' };
  }
  try {
    const result = await postJson(cfg.url, payload);
    return { ...result, skipped: false };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: 'discord-webhook-error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function notifyPublishResult({
  status = 'succeeded',
  title = '',
  blogUrl = '',
  category = '',
  jobId = '',
  postUrl = '',
  plainChars = null,
  qaScore = null,
  message = '',
  keyword = ''
} = {}, env = process.env) {
  const ok = status === 'succeeded';
  const color = ok ? 0x22c55e : 0xef4444;
  const statusLabel = ok ? '발행 성공' : '발행 실패';
  const fields = [
    { name: '상태', value: statusLabel, inline: true },
    { name: '카테고리', value: category || '-', inline: true },
    { name: 'Job', value: jobId ? `\`${jobId}\`` : '-', inline: false }
  ];
  if (keyword) fields.push({ name: '키워드', value: keyword, inline: true });
  if (plainChars != null) fields.push({ name: '본문 길이', value: `${plainChars}자`, inline: true });
  if (qaScore != null) fields.push({ name: 'QA 점수', value: String(qaScore), inline: true });
  if (postUrl) fields.push({ name: '글 URL', value: postUrl, inline: false });
  if (message) fields.push({ name: '메시지', value: message.slice(0, 900), inline: false });

  const content = ok
    ? `✅ 티스토리 발행 완료: **${title || '(제목 없음)'}**`
    : `❌ 티스토리 발행 실패: **${title || '(제목 없음)'}**`;

  return sendDiscordWebhook({
    username: 'Tistory Pilot',
    content,
    embeds: [
      {
        title: (title || 'Tistory 발행 알림').slice(0, 250),
        url: postUrl || blogUrl || undefined,
        color,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: blogUrl || 'tistory-pilot' }
      }
    ]
  }, env);
}

export async function notifyQaResult({
  title = '',
  keyword = '',
  ok = false,
  score = 0,
  failures = [],
  warnings = [],
  market = null
} = {}, env = process.env) {
  if (ok && !parseBool(env.DISCORD_NOTIFY_QA_PASS, false)) {
    return { ok: true, skipped: true, reason: 'qa-pass-silent' };
  }
  const color = ok ? 0x3b82f6 : 0xf59e0b;
  const topFail = (failures || []).slice(0, 5).map(f => `• ${f.code}: ${f.message}`).join('\n') || '-';
  const topWarn = (warnings || []).slice(0, 4).map(w => `• ${w.code}: ${w.message}`).join('\n') || '-';
  const marketLine = market
    ? `경쟁 글 ${market.sampleCount || 0}건 / 평균 제목 ${market.avgTitleLength || '-'}자 / 의도 ${market.intent || '-'}`
    : '-';

  return sendDiscordWebhook({
    username: 'Tistory Pilot QA',
    content: ok ? `🧪 QA 통과: **${title}**` : `🧪 QA 실패: **${title}**`,
    embeds: [
      {
        title: (title || keyword || 'QA').slice(0, 250),
        color,
        fields: [
          { name: '점수', value: String(score), inline: true },
          { name: '키워드', value: keyword || '-', inline: true },
          { name: '시장 리서치', value: marketLine, inline: false },
          { name: '실패', value: topFail.slice(0, 900), inline: false },
          { name: '경고', value: topWarn.slice(0, 700), inline: false }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  }, env);
}


// scripts/lib/ → scripts/ → app/ → publish-workbench/ (정식 data root)
const NOTIFY_QA_STATE_DEFAULT = path.resolve(
  import.meta.dirname, '..', '..', '..', 'data', 'runtime', 'public-qa-notify.json'
);
const NOTIFY_QA_RETRY_MS = 6 * 60 * 60 * 1000;

async function readNotifyQaState(statePath) {
  try {
    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return {};
  } catch {
    // 파일이 없거나 깨져도 알림 발송 자체는 막지 않는다. 최초 발송으로 취급.
    return {};
  }
}

async function writeNotifyQaState(statePath, state) {
  try {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    return true;
  } catch (error) {
    // state 기록 실패는 알림 실패로 이어지지 않는다 — 다음 주기에 다시 시도된다.
    console.error(`[discord-notify] QA state 기록 실패: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * 공개 사이트 QA 지적을 Discord로 알린다.
 *
 * 15분마다 같은 지적을 반복 발송하지 않기 위해 지적 코드 목록을 fingerprint로
 * 남긴다. fingerprint가 그대로면 6시간이 지나야 다시 보낸다.
 *
 * @param {object} detail
 * @param {string} [detail.blogUrl]
 * @param {{code: string, url?: string}[]} [detail.fatal]
 * @param {{code: string, url?: string}[]} [detail.advisory]
 * @param {{code: string, url?: string}[]} [detail.warnings]
 * @param {number} [detail.articlesChecked]
 * @param {string} [detail.checkedAt]
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function notifyPublicSiteQa({
  blogUrl = '',
  fatal = [],
  advisory = [],
  warnings = [],
  articlesChecked = 0,
  checkedAt = ''
} = {}, env = process.env) {
  const fatalList = Array.isArray(fatal) ? fatal : [];
  const advisoryList = Array.isArray(advisory) ? advisory : [];
  if (fatalList.length === 0 && advisoryList.length === 0) {
    return { ok: true, skipped: true, reason: 'no-findings' };
  }

  const cfg = resolveDiscordWebhook(env);
  if (!cfg.enabled) {
    return { ok: false, skipped: true, reason: 'discord-webhook-disabled' };
  }

  const statePath = env.PUBLIC_QA_NOTIFY_STATE
    || env.PUBLISH_WORKBENCH_DATA_ROOT && path.join(env.PUBLISH_WORKBENCH_DATA_ROOT, 'runtime', 'public-qa-notify.json')
    || NOTIFY_QA_STATE_DEFAULT;
  // 코드 목록을 정렬·중복 제거해 fingerprint를 만든다. 샘플링한 글 수가
  // 바뀌면 같은 이슈(auto-refresh)가 더 많이 잡히는데, 이때 재발송하지
  // 않도록 글 단위가 아니라 코드 집합 기준으로 잡는다.
  const fingerprint = [...new Set([...fatalList, ...advisoryList]
    .map(item => String(item?.code || ''))
    .filter(Boolean))]
    .sort()
    .join('|');
  const state = await readNotifyQaState(statePath);
  const lastSentAt = Date.parse(String(state.lastSentAt || ''));
  const unchanged = state.fingerprint === fingerprint;
  const tooOld = !Number.isFinite(lastSentAt) || Date.now() - lastSentAt > NOTIFY_QA_RETRY_MS;
  if (unchanged && !tooOld) {
    return { ok: true, skipped: true, reason: 'deduped', lastSentAt: state.lastSentAt || null };
  }

  const details = [...fatalList, ...advisoryList]
    .map(item => `• ${item?.code || 'unknown'}${item?.url ? `: ${item.url}` : ''}`)
    .join('\n')
    .slice(0, 900);
  const content = fatalList.length > 0
    ? `🚨 티스토리 공개 QA 차단: **${fatalList.length}건**`
    : `⚠️ 티스토리 공개 QA 지적: **${advisoryList.length}건**`;
  const detailLines = [
    `지적 ${fatalList.length + advisoryList.length}건 (경고 ${Array.isArray(warnings) ? warnings.length : 0}건)`,
    details || '-'
  ].join('\n\n').slice(0, 3900);

  const result = await sendDiscordWebhook({
    username: 'Tistory Public QA',
    content,
    embeds: [{
      title: blogUrl || 'Tistory Public QA',
      color: fatalList.length > 0 ? 0xef4444 : 0xf59e0b,
      fields: [
        { name: '블로그', value: blogUrl || '-', inline: true },
        { name: '치명 / 권고', value: `${fatalList.length} / ${advisoryList.length}`, inline: true },
        { name: '검사 글', value: `${articlesChecked}건`, inline: true },
        { name: '상세', value: detailLines, inline: false }
      ],
      timestamp: checkedAt || new Date().toISOString(),
      footer: { text: blogUrl || 'tistory-pilot' }
    }]
  }, env);

  // 발송 성공/실패와 무관하게 state를 남긴다. 실패를 매 tick 재시도하면
  // 워크훅이 꺼져 있을 때 로그가 15분마다 도배되기 때문이다.
  if (!result.skipped) {
    await writeNotifyQaState(statePath, { fingerprint, lastSentAt: new Date().toISOString() });
  }
  return { ...result, deduped: false };
}


const isCli = process.argv[1] && process.argv[1].endsWith('discord-notify.mjs');
if (isCli) {
  const mode = process.argv[2] || 'publish-success';
  const run = mode === 'qa-fail'
    ? notifyQaResult({
        title: 'QA 테스트 글',
        keyword: 'ISA 추천',
        ok: false,
        score: 62,
        failures: [{ code: 'market-needs-table', message: '비교표 없음' }],
        warnings: [{ code: 'title-hook-missing', message: '연도/숫자 훅 없음' }],
        market: { sampleCount: 8, avgTitleLength: 28, intent: 'commercial' }
      })
    : notifyPublishResult({
        status: mode === 'publish-fail' ? 'failed' : 'succeeded',
        title: 'Discord 알림 테스트 글',
        blogUrl: 'https://acstory.tistory.com',
        category: '경제상식',
        jobId: 'test-job-local',
        postUrl: 'https://acstory.tistory.com/',
        plainChars: 3200,
        qaScore: 96,
        message: mode === 'publish-fail' ? '테스트 실패 메시지' : '테스트 성공 메시지',
        keyword: '테스트'
      });
  run.then(r => {
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok && !r.skipped) process.exit(2);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
