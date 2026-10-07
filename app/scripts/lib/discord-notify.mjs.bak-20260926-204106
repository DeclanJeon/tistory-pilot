#!/usr/bin/env node
/**
 * discord-notify.mjs — Discord webhook 알림
 */
import https from 'node:https';
import http from 'node:http';
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
