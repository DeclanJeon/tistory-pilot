#!/usr/bin/env node
/**
 * source-material.mjs — 트랜스크립트 소스 아카이브 로더/발췌 (설계: docs/design/transcript-source-injection.md §4)
 *
 * 아카이브 구조:
 *   content/sources/<archive>/manifest.json
 *   content/sources/<archive>/*.md   (flucto 트랜스크립트: `# 제목` / `> **채널:**` … `---` / `## [MM:SS]` 섹션)
 *
 * API:
 *   loadManifest(archive)             → { files: [{file, videoUrl, channel, title, chars}] } | null
 *   loadExcerpts(keywordEntry)        → [{ videoUrl, channel, title, ts, text }]
 *   buildSourceBlock(keywordEntry)    → 프롬프트 삽입용 문자열 | ''
 *   sourceCitations(keywordEntry)     → ["채널 | 제목 | URL", …]  (meta.json용)
 *   loadSourceRaw(source)             → [{ title, text }]  (QA verbatim 대조용, 전체 원문)
 *
 * 실패 정책: manifest/파일 누락은 스킵 + warn. 전부 실패해도 빈 결과 (파이프라인 중단 금지).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
// 테스트에서 SOURCE_ARCHIVE_ROOT로 오버라이드 가능 (호출 시점 해석)
function archiveRoot() {
  return process.env.SOURCE_ARCHIVE_ROOT || path.join(PROJECT_ROOT, 'content', 'sources');
}

// ─── 헤더/섹션 파싱 ─────────────────────────────────────────────────

/** flucto md 헤더(제목·메타·`---`) 제거. 첫 `\n---` 이후 본문 반환. */
export function stripHeader(text = '') {
  const idx = String(text).indexOf('\n---');
  if (idx >= 0) return String(text).slice(idx + 4);
  return String(text);
}

/** `## [MM:SS]` 타임스탬프 섹션 분리. */
export function splitSections(text = '') {
  const sections = [];
  const re = /##\s*\[(\d{2}:\d{2}(?::\d{2})?)\]([\s\S]*?)(?=##\s*\[\d{2}:\d{2}(?::\d{2})?\]|$)/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const body = m[2].trim();
    if (body) sections.push({ ts: m[1], text: body });
  }
  return sections;
}

// ─── 로더 ────────────────────────────────────────────────────────────

export async function loadManifest(archive) {
  if (!archive) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(archiveRoot(), archive, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * 키워드 sourceMaterial.files에서 발췌:
 * - tags 토큰(2자 이상) 중 하나라도 섹션에 있으면 우선 (없으면 전체)
 * - 텍스트 길이 내림차순, 파일당 최대 sectionsPerFile 섹션
 */
export async function loadExcerpts(keywordEntry, { maxFiles = 3, sectionsPerFile = 2 } = {}) {
  const sm = keywordEntry?.sourceMaterial;
  if (!sm?.archive || !Array.isArray(sm.files)) return [];
  const manifest = await loadManifest(sm.archive);
  const byName = new Map((manifest?.files || []).map(f => [f.file, f]));
  const tokens = (keywordEntry.tags || [])
    .map(t => String(t).trim())
    .filter(t => t.length >= 2);

  const out = [];
  for (const f of sm.files.slice(0, maxFiles)) {
    const meta = byName.get(f) || {};
    let raw = '';
    try {
      raw = await fs.readFile(path.join(archiveRoot(), sm.archive, f), 'utf8');
    } catch {
      console.warn(`[source-material] 파일 없음 — 스킵: ${f}`);
      continue;
    }
    let sections = splitSections(stripHeader(raw));
    if (tokens.length) {
      const hit = sections.filter(s => tokens.some(t => s.text.includes(t)));
      if (hit.length) sections = hit;
    }
    sections.sort((a, b) => b.text.length - a.text.length);
    for (const s of sections.slice(0, sectionsPerFile)) {
      out.push({
        videoUrl: meta.videoUrl || '',
        channel: meta.channel || '',
        title: meta.title || f,
        ts: s.ts,
        text: s.text
      });
    }
  }
  return out;
}

/** 프롬프트 삽입용 발췌 블록. excerptChars까지 누적. */
export async function buildSourceBlock(keywordEntry, { excerptChars = 4000 } = {}) {
  const sm = keywordEntry?.sourceMaterial;
  if (!sm) return '';
  const cap = Number(sm.excerptChars) || excerptChars;
  const excerpts = await loadExcerpts(keywordEntry);
  const blocks = [];
  let used = 0;
  for (const e of excerpts) {
    if (used >= cap) break;
    const take = Math.min(e.text.length, cap - used);
    blocks.push(`[출처: ${e.channel || '유튜브'} | ${e.title} | ${e.videoUrl || '(URL)'}]\n${e.text.slice(0, take)}`);
    used += take;
  }
  return blocks.join('\n\n');
}

/** meta.json source.citations 용. */
export async function sourceCitations(keywordEntry) {
  const sm = keywordEntry?.sourceMaterial;
  if (!sm || !Array.isArray(sm.files)) return [];
  const manifest = await loadManifest(sm.archive);
  const byName = new Map((manifest?.files || []).map(f => [f.file, f]));
  const out = [];
  for (const f of sm.files) {
    const m = byName.get(f);
    if (m) out.push(`${m.channel || ''} | ${m.title || f} | ${m.videoUrl || ''}`.trim());
  }
  return out;
}

/** QA verbatim 대조용 — 전체 원문 (헤더 제거). source: { archive, files } */
export async function loadSourceRaw(source = {}) {
  if (!source?.archive || !Array.isArray(source.files)) return [];
  const out = [];
  for (const f of source.files) {
    try {
      const raw = await fs.readFile(path.join(archiveRoot(), source.archive, f), 'utf8');
      out.push({ title: f, text: stripHeader(raw) });
    } catch {
      // 스킵
    }
  }
  return out;
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isCli || process.argv[1]?.endsWith('source-material.mjs')) {
  const archive = process.argv[2] || '부업-20260820';
  loadManifest(archive).then(m => {
    console.log(`아카이브: ${archive} | 파일 ${m?.files?.length ?? 0}건`);
    for (const f of (m?.files || []).slice(0, 5)) console.log(`  - ${f.file} (${f.chars}자) ${f.videoUrl}`);
    if (!m) process.exit(1);
  }).catch(e => { console.error(e.message); process.exit(1); });
}
