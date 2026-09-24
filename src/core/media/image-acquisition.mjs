import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

// Google Images is a discovery surface, not a licence grant. Only these
// operator-approved hosts are downloaded unless IMAGE_ALLOW_UNVERIFIED_SOURCE=1.
export const DEFAULT_IMAGE_ALLOWED_HOSTS = Object.freeze([
  'wikimedia.org',
  'wikipedia.org',
  'unsplash.com',
  'pexels.com',
  'pixabay.com',
  'pxhere.com',
  'openclipart.org',
  'publicdomainpictures.net',
  'gov.kr',
  'go.kr',
  'korea.kr',
  'data.go.kr'
]);

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'image', 'photo', 'picture', 'blog', 'guide',
  'article', 'post', 'title', 'main', 'body', 'section', 'cover', 'editorial', '이미지', '사진', '그림',
  '대표', '본문', '섹션', '제목', '정리', '분석', '방법', '추천', '관련', '대한', '위한', '있는', '한다'
]);

const CATEGORY_IMAGE_HINTS = Object.freeze({
  '이사·청소·주거': ['home', 'moving', 'interior', 'service'],
  '생활·정보': ['daily life', 'consumer', 'service', 'comparison'],
  '투자·재테크': ['finance', 'calculator', 'documents', 'planning'],
  'IT·테크': ['technology', 'computer', 'network', 'software'],
  '개발지식': ['software', 'code', 'architecture', 'developer'],
  '개발 회고': ['roadmap', 'workspace', 'retrospective', 'planning']
});

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/');
}

function decodeUrl(value) {
  let current = decodeHtmlEntities(value).trim();
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current.replace(/[),.;]+$/, '');
}

function safeHttpUrl(value) {
  try {
    const url = new URL(decodeUrl(value));
    if (!/^https?:$/i.test(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function hostMatches(host, allowedHost) {
  const normalizedHost = String(host || '').toLowerCase().replace(/^www\./, '');
  const normalizedAllowed = String(allowedHost || '').toLowerCase().trim().replace(/^\*\./, '').replace(/^www\./, '');
  return Boolean(normalizedHost && normalizedAllowed && (normalizedHost === normalizedAllowed || normalizedHost.endsWith(`.${normalizedAllowed}`)));
}

export function parseAllowedImageHosts(value = '') {
  const configured = String(value || '')
    .split(/[\s,]+/)
    .map((host) => host.trim())
    .filter(Boolean);
  return configured.length ? configured : [...DEFAULT_IMAGE_ALLOWED_HOSTS];
}

export function isAllowedImageSource(candidate = {}, { allowedHosts = DEFAULT_IMAGE_ALLOWED_HOSTS, allowUnverified = false } = {}) {
  if (allowUnverified) return true;
  const hosts = Array.isArray(allowedHosts) ? allowedHosts : parseAllowedImageHosts(allowedHosts);
  const imageValue = candidate.imageUrl || candidate.url;
  try {
    const host = new URL(String(imageValue || '')).hostname;
    return hosts.some((allowed) => hostMatches(host, allowed));
  } catch {
    return false;
  }
}

export function tokenizeImageQuery(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_/|·•]+/g, ' ')
    .split(/[^\p{Letter}\p{Number}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

export function buildImageSearchQuery(context = {}) {
  const keyword = String(context.keyword || '').replace(/\s+/g, ' ').trim();
  const phraseTokens = new Set(tokenizeImageQuery(keyword));
  const extras = [];
  const push = (value) => {
    for (const token of tokenizeImageQuery(value)) {
      if (phraseTokens.has(token) || extras.includes(token)) continue;
      extras.push(token);
      if (extras.length >= 5) return;
    }
  };
  push(context.category || '');
  push(context.title || '');
  push(context.description || '');
  for (const token of (context.market?.commonTokens || [])) push(token);
  for (const token of (CATEGORY_IMAGE_HINTS[String(context.category || '').trim()] || [])) push(token);

  const query = [keyword, ...extras].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return query.slice(0, 180) || 'editorial home service';
}

export function buildGoogleImageSearchUrl(query, { usageRights = 'cl', safe = 'active' } = {}) {
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('tbm', 'isch');
  url.searchParams.set('hl', 'ko');
  url.searchParams.set('gl', 'kr');
  url.searchParams.set('safe', safe);
  // il:cl is Google's Creative Commons usage-rights filter. It is still
  // treated as a discovery hint; the host allowlist remains mandatory.
  if (usageRights) url.searchParams.set('tbs', `il:${usageRights}`);
  url.searchParams.set('q', query);
  return url.toString();
}

function addCandidate(out, seen, imageUrl, sourceUrl = '', title = '', alt = '') {
  const image = safeHttpUrl(imageUrl);
  if (!image || /(?:encrypted-tbn|gstatic\.com\/images|google\.com\/url)/i.test(image)) return;
  const source = safeHttpUrl(sourceUrl);
  const key = image.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ imageUrl: image, sourceUrl: source, title: decodeHtmlEntities(title).trim(), alt: decodeHtmlEntities(alt).trim() });
}

export function parseGoogleImageCandidates(html = {}, { maxCandidates = 40 } = {}) {
  const text = String(html || '');
  const out = [];
  const seen = new Set();

  // Traditional /imgres?imgurl=...&imgrefurl=... links.
  const imgUrlRe = /[?&](?:amp;)?imgurl=([^&"'<>\\\s]+)/gi;
  let match;
  while ((match = imgUrlRe.exec(text)) && out.length < maxCandidates) {
    const tail = text.slice(match.index, match.index + 2600);
    const sourceMatch = tail.match(/[?&](?:amp;)?imgrefurl=([^&"'<>\\\s]+)/i);
    addCandidate(out, seen, match[1], sourceMatch?.[1] || '');
  }

  // Embedded result objects used by newer Google Images responses.
  const objectRe = /["'](?:ou|original|imageUrl|image_url)["']\s*:\s*["'](https?:[^"']+)["']/gi;
  while ((match = objectRe.exec(text)) && out.length < maxCandidates) {
    const tail = text.slice(match.index, match.index + 3200);
    const sourceMatch = tail.match(/["'](?:ru|referrer|imgrefurl|sourceUrl|source_url)["']\s*:\s*["'](https?:[^"']+)["']/i);
    const titleMatch = tail.match(/["'](?:pt|title|text)["']\s*:\s*["']([^"']{2,180})["']/i);
    addCandidate(out, seen, match[1], sourceMatch?.[1] || '', titleMatch?.[1] || '');
  }

  return out;
}

export function scoreImageCandidate(candidate = {}, context = {}) {
  const queryTokens = new Set(tokenizeImageQuery(buildImageSearchQuery(context)));
  const haystack = tokenizeImageQuery([candidate.title, candidate.alt, candidate.sourceUrl, candidate.imageUrl].filter(Boolean).join(' '));
  const overlap = haystack.filter((token) => queryTokens.has(token));
  let score = overlap.length * 10;
  if (candidate.sourceUrl) score += 2;
  if (candidate.title) score += 1;
  return score;
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function searchGoogleImages(query, {
  fetchImpl = globalThis.fetch,
  usageRights = 'cl',
  maxCandidates = 40,
  timeoutMs = 15000,
  userAgent = DEFAULT_USER_AGENT
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch 구현을 찾을 수 없다.');
  const searchUrl = buildGoogleImageSearchUrl(query, { usageRights });
  const response = await fetchWithTimeout(fetchImpl, searchUrl, {
    headers: {
      'user-agent': userAgent,
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8'
    }
  }, timeoutMs);
  if (!response.ok) throw new Error(`Google Images 검색 실패: HTTP ${response.status}`);
  const html = await response.text();
  return {
    query,
    searchUrl,
    candidates: parseGoogleImageCandidates(html, { maxCandidates })
  };
}

function imageInfo(format, mime, extension, width, height) {
  return { format, mime, extension, width, height };
}

function parseJpegDimensions(data) {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 1 >= data.length) break;
    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) break;
    if (JPEG_SOF_MARKERS.has(marker) && offset + 7 < data.length) {
      return { width: data.readUInt16BE(offset + 5), height: data.readUInt16BE(offset + 3) };
    }
    offset += segmentLength;
  }
  return { width: null, height: null };
}

function parseWebpDimensions(data) {
  if (data.length >= 30 && data.toString('ascii', 12, 16) === 'VP8X') {
    const width = 1 + data[24] + (data[25] << 8) + (data[26] << 16);
    const height = 1 + data[27] + (data[28] << 8) + (data[29] << 16);
    return { width, height };
  }
  return { width: null, height: null };
}

export function inspectImageBuffer(input, {
  minBytes = 1024,
  minWidth = 640,
  minHeight = 360,
  maxBytes = 12 * 1024 * 1024,
  minAspect = 1.2,
  maxAspect = 2.1
} = {}) {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  const fail = (reason, extra = {}) => ({ ok: false, reason, bytes: data.length, ...extra });
  if (data.length < minBytes) return fail('too-small-bytes');
  if (data.length > maxBytes) return fail('too-large-bytes');

  let info;
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    info = imageInfo('png', 'image/png', '.png', data.readUInt32BE(16), data.readUInt32BE(20));
  } else if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') {
    const dimensions = parseWebpDimensions(data);
    info = imageInfo('webp', 'image/webp', '.webp', dimensions.width, dimensions.height);
  } else if (data.length >= 10 && (data.subarray(0, 6).toString('ascii') === 'GIF87a' || data.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    info = imageInfo('gif', 'image/gif', '.gif', data.readUInt16LE(6), data.readUInt16LE(8));
  } else if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    const dimensions = parseJpegDimensions(data);
    info = imageInfo('jpeg', 'image/jpeg', '.jpg', dimensions.width, dimensions.height);
  } else {
    return fail('unsupported-or-invalid-format');
  }

  if (!Number.isInteger(info.width) || !Number.isInteger(info.height) || info.width <= 0 || info.height <= 0) {
    return fail('missing-dimensions', info);
  }
  if (info.width < minWidth || info.height < minHeight) return fail('dimensions-too-small', info);
  const aspect = info.width / info.height;
  if (aspect < minAspect || aspect > maxAspect) return fail('aspect-ratio-out-of-range', { ...info, aspect: Number(aspect.toFixed(4)) });
  return { ok: true, bytes: data.length, aspect: Number(aspect.toFixed(4)), ...info };
}

export async function validateImageFile(filePath, options = {}) {
  try {
    const data = await fs.readFile(filePath);
    return { path: filePath, ...inspectImageBuffer(data, options) };
  } catch (error) {
    return { ok: false, path: filePath, reason: 'file-unreadable', error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, data);
  await fs.rename(tempPath, filePath);
}

export async function writeValidatedImage(input, targetPath, options = {}) {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  const info = inspectImageBuffer(data, options);
  if (!info.ok) throw new Error(`이미지 검증 실패: ${info.reason}`);
  const target = String(targetPath || '').trim();
  if (!target) throw new Error('이미지 저장 경로가 비어 있다.');
  const ext = path.extname(target);
  const resolvedPath = ext ? target.replace(/\.[^.]+$/, info.extension) : `${target}${info.extension}`;
  await writeAtomic(resolvedPath, data);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return { path: resolvedPath, hash, ...info };
}

export async function downloadImageCandidate(candidate, targetPath, {
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
  userAgent = DEFAULT_USER_AGENT,
  ...validationOptions
} = {}) {
  const imageUrl = safeHttpUrl(candidate?.imageUrl || candidate?.url || candidate);
  if (!imageUrl) throw new Error('이미지 URL이 유효하지 않다.');
  if (typeof fetchImpl !== 'function') throw new Error('fetch 구현을 찾을 수 없다.');
  const response = await fetchWithTimeout(fetchImpl, imageUrl, {
    headers: { 'user-agent': userAgent, accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }
  }, timeoutMs);
  if (!response.ok) throw new Error(`이미지 다운로드 실패: HTTP ${response.status}`);
  const declaredLength = Number(response.headers?.get?.('content-length') || 0);
  if (declaredLength > (validationOptions.maxBytes || 12 * 1024 * 1024)) throw new Error('이미지가 허용 크기를 초과했다.');
  const bytes = Buffer.from(await response.arrayBuffer());
  const stored = await writeValidatedImage(bytes, targetPath, validationOptions);
  return {
    ...stored,
    imageUrl,
    sourceUrl: safeHttpUrl(candidate?.sourceUrl || candidate?.referrer || ''),
    title: String(candidate?.title || ''),
    alt: String(candidate?.alt || ''),
    declaredContentType: response.headers?.get?.('content-type') || ''
  };
}

export async function writeImageProvenance(imagePath, provenance = {}) {
  const sidecarPath = `${imagePath}.image.json`;
  await writeAtomic(sidecarPath, `${JSON.stringify({
    version: 1,
    imagePath,
    ...provenance
  }, null, 2)}\n`);
  return sidecarPath;
}

function sanitizeBaseName(value) {
  const slug = String(value || 'post')
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9가-힣_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'post';
}

export function buildCodexImagenPrompt(context = {}, query = buildImageSearchQuery(context)) {
  const category = String(context.category || '생활 정보').trim();
  const keyword = String(context.keyword || query).trim();
  const marketTokens = (context.market?.commonTokens || []).slice(0, 4).join(', ');
  return [
    'Generate one polished Korean blog representative image.',
    `Topic keyword: ${keyword}.`,
    `Category: ${category}.`,
    marketTokens ? `Visual cues from search research: ${marketTokens}.` : '',
    'Use a clear editorial scene or an accurate conceptual illustration directly related to the topic.',
    'Landscape 3:2 composition, strong subject separation, clean modern lighting, readable at mobile width.',
    'No text, no letters, no numbers, no logos, no brand marks, no watermark, no collage, no UI screenshot.'
  ].filter(Boolean).join(' ');
}

export function resolveCodexImagenScript(env = process.env) {
  const configured = String(env.CODEX_IMAGEN_SCRIPT || '').trim();
  const codexHome = String(env.CODEX_HOME || '').trim()
    ? path.resolve(String(env.CODEX_HOME).trim())
    : String(env.HOME || '').trim()
      ? path.join(String(env.HOME).trim(), '.codex')
      : '';
  const candidates = [
    configured,
    codexHome ? path.join(codexHome, 'skills', 'codex-imagen', 'scripts', 'codex-imagen.mjs') : '',
    codexHome ? path.join(codexHome, 'skills', '.system', 'imagegen', 'scripts', 'image_gen.py') : '',
    '/home/oai/skills/codex-imagen/scripts/codex-imagen.mjs',
    '/opt/skills/codex-imagen/scripts/codex-imagen.mjs'
  ].filter(Boolean);
  return [...new Set(candidates)];
}

function runCommand(command, args, { timeoutMs = 310000, cwd = PROJECT_ROOT } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, timedOut, error: error instanceof Error ? error.message : String(error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function extractPathsFromValue(value, out = []) {
  if (typeof value === 'string') {
    if (/\.(?:png|jpe?g|webp|gif)$/i.test(value.trim())) out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractPathsFromValue(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) extractPathsFromValue(item, out);
  }
  return out;
}

function extractImagenPaths(stdout) {
  const paths = [];
  try {
    extractPathsFromValue(JSON.parse(stdout), paths);
  } catch {
    // --json output may contain diagnostics around the JSON object.
  }
  for (const line of String(stdout || '').split(/\r?\n/)) extractPathsFromValue(line, paths);
  return [...new Set(paths)];
}

async function inspectGeneratedCandidates(paths, options) {
  for (const candidate of [...new Set(paths)].filter(Boolean)) {
    const checked = await validateImageFile(candidate, options);
    if (!checked.ok) continue;
    const extension = path.extname(candidate);
    const normalizedPath = extension
      ? `${candidate.slice(0, -extension.length)}${checked.extension}`
      : `${candidate}${checked.extension}`;
    if (normalizedPath !== candidate) {
      try {
        return await writeValidatedImage(await fs.readFile(candidate), candidate, options);
      } catch {
        continue;
      }
    }
    return checked;
  }
  return null;
}

export async function acquireRepresentativeImage(context = {}, {
  outDir,
  env = process.env,
  fetchImpl = globalThis.fetch,
  runImagen = null,
  search = true,
  imagen = true,
  maxCandidates = 10,
  usageRights = 'cl',
  allowedHosts = parseAllowedImageHosts(env.IMAGE_ALLOWED_HOSTS || ''),
  allowUnverifiedSource = String(env.IMAGE_ALLOW_UNVERIFIED_SOURCE || '') === '1',
  timeoutMs = 20000,
  minBytes = 1024,
  minWidth = 640,
  minHeight = 360,
  maxBytes = 12 * 1024 * 1024,
  minAspect = 1.2,
  maxAspect = 2.1,
  now = new Date()
} = {}) {
  const targetDir = path.resolve(outDir || path.join(PROJECT_ROOT, 'content', 'generated', 'images'));
  await fs.mkdir(targetDir, { recursive: true });
  const query = buildImageSearchQuery(context);
  const stamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const baseName = `${sanitizeBaseName(context.id || context.keyword || 'post')}-${Number.isFinite(stamp) ? stamp : Date.now()}`;
  const validationOptions = { minBytes, minWidth, minHeight, maxBytes, minAspect, maxAspect };
  const errors = [];

  if (search) {
    try {
      const found = await searchGoogleImages(query, { fetchImpl, usageRights, maxCandidates: Math.max(maxCandidates * 3, maxCandidates), timeoutMs });
      const candidates = found.candidates
        .map((candidate) => ({ ...candidate, score: scoreImageCandidate(candidate, context) }))
        .sort((a, b) => b.score - a.score);
      for (const candidate of candidates.slice(0, maxCandidates)) {
        if (!isAllowedImageSource(candidate, { allowedHosts, allowUnverified: allowUnverifiedSource })) {
          errors.push(`source-not-allowlisted:${candidate.sourceUrl || candidate.imageUrl}`);
          continue;
        }
        try {
          const downloaded = await downloadImageCandidate(candidate, path.join(targetDir, baseName), {
            fetchImpl,
            timeoutMs,
            ...validationOptions
          });
          const provenance = {
            method: 'google-images',
            status: 'ready',
            query,
            searchUrl: found.searchUrl,
            imageUrl: downloaded.imageUrl,
            sourceUrl: downloaded.sourceUrl || null,
            sourceHost: downloaded.sourceUrl ? new URL(downloaded.sourceUrl).hostname : new URL(downloaded.imageUrl).hostname,
            usageRightsFilter: usageRights ? `il:${usageRights}` : null,
            license: 'operator-allowlisted; verify source terms before reuse',
            licenseVerified: false,
            fetchedAt: new Date().toISOString(),
            candidateScore: candidate.score,
            width: downloaded.width,
            height: downloaded.height,
            bytes: downloaded.bytes,
            format: downloaded.format,
            sha256: downloaded.hash
          };
          const provenancePath = await writeImageProvenance(downloaded.path, provenance);
          return { ok: true, status: 'ready', method: 'google-images', path: downloaded.path, provenancePath, query, provenance };
        } catch (error) {
          errors.push(`download:${candidate.imageUrl}:${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (found.candidates.length === 0) errors.push('google-images:no-candidates');
    } catch (error) {
      errors.push(`google-images:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (imagen) {
    const scripts = resolveCodexImagenScript(env);
    const script = scripts.find((candidate) => {
      try { return requireLikeExists(candidate); } catch { return false; }
    });
    if (!script) {
      errors.push('codex-imagen:script-not-found (set CODEX_IMAGEN_SCRIPT)');
    } else {
      const outputPath = path.join(targetDir, `${baseName}.png`);
      const prompt = buildCodexImagenPrompt(context, query);
      const timeoutSeconds = Math.max(1, Number(env.CODEX_IMAGEN_TIMEOUT_SEC || 300) || 300);
      const retries = Math.max(0, Number(env.CODEX_IMAGEN_RETRIES ?? 1) || 0);
      const legacyPython = /\.py$/i.test(script);
      const command = legacyPython ? String(env.CODEX_IMAGEN_PYTHON || 'python3') : 'node';
      const commandArgs = legacyPython
        ? [script, 'generate', '--prompt', prompt, '--quality', 'medium', '--size', '1536x1024', '--out', outputPath, '--force']
        : [script, '--json', '--timeout', String(timeoutSeconds), '--retries', String(retries), '--output', outputPath, '--prompt', prompt];
      const result = typeof runImagen === 'function'
        ? await runImagen({ command, args: commandArgs, outputPath, prompt, legacyPython })
        : await runCommand(command, commandArgs, { timeoutMs: (timeoutSeconds * (retries + 1) + 10) * 1000 });
      if (result?.stderr) errors.push(`codex-imagen:stderr:${String(result.stderr).split(/\r?\n/).filter(Boolean).at(-1) || ''}`);
      const generated = await inspectGeneratedCandidates([outputPath, ...extractImagenPaths(result?.stdout || '')], validationOptions);
      if (generated) {
        const provenance = {
          method: 'codex-imagen',
          scriptMode: legacyPython ? 'legacy-python-imagegen' : 'codex-imagen-helper',
          status: 'ready',
          query,
          prompt,
          script,
          generatedAt: new Date().toISOString(),
          license: 'generated-by-codex-imagen',
          licenseVerified: true,
          width: generated.width,
          height: generated.height,
          bytes: generated.bytes
        };
        const provenancePath = await writeImageProvenance(generated.path, provenance);
        return { ok: true, status: 'ready', method: 'codex-imagen', path: generated.path, provenancePath, query, provenance };
      }
      errors.push(`codex-imagen:invalid-output (exit=${result?.code ?? 'unknown'})`);
    }
  }

  return { ok: false, status: 'failed', method: null, path: '', query, errors };
}

function requireLikeExists(filePath) {
  // This synchronous check keeps the Imagen command path deterministic while
  // avoiding a second async race between discovery and spawn.
  return existsSync(filePath);
}
