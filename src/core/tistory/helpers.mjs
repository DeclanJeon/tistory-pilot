import fs from 'node:fs';
import path from 'node:path';

export function normalizeBlogUrl(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  const url = new URL(value.startsWith('http') ? value : `https://${value}`);
  return `${url.protocol}//${url.host}`;
}

export function buildEditorUrl(blogUrl) {
  const baseUrl = normalizeBlogUrl(blogUrl);
  return baseUrl ? `${baseUrl}/manage/newpost` : '';
}

export function buildCategoryUrl(blogUrl) {
  const baseUrl = normalizeBlogUrl(blogUrl);
  return baseUrl ? `${baseUrl}/manage/category` : '';
}

export function buildManagePostUrl(blogUrl, postId) {
  const baseUrl = normalizeBlogUrl(blogUrl);
  const resolvedPostId = String(postId || '').trim();
  return baseUrl && resolvedPostId ? `${baseUrl}/manage/post/${resolvedPostId}` : '';
}

export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

export function toDataUrl(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`이미지 파일을 찾을 수 없다: ${resolved}`);
  }
  const data = fs.readFileSync(resolved).toString('base64');
  return `data:${getMimeType(resolved)};base64,${data}`;
}

function localImageCandidates(src, baseDir = '') {
  const normalized = String(src || '').trim();
  const candidates = [];
  if (!normalized) return candidates;
  if (path.isAbsolute(normalized)) {
    candidates.push(normalized);
  } else {
    if (baseDir) candidates.push(path.resolve(baseDir, normalized));
    candidates.push(path.resolve(normalized));
  }
  return [...new Set(candidates)];
}

export function collectBodyImageDataUrls(body, { baseDir = '' } = {}) {
  const imageDataUrls = {};
  const register = src => {
    const normalized = String(src || '').trim();
    if (
      !normalized
      || /^(?:https?:|data:|blob:)/i.test(normalized)
      || normalized.startsWith('//')
      || imageDataUrls[normalized]
    ) return;
    for (const candidate of localImageCandidates(normalized, baseDir)) {
      try {
        const dataUrl = toDataUrl(candidate);
        imageDataUrls[normalized] = dataUrl;
        imageDataUrls[candidate] = dataUrl;
        return;
      } catch {
        // 브라우저에서 업로드한 HTML의 상대 경로 자산은 서버에서 읽을 수 없을 수 있다.
      }
    }
  };

  for (const match of String(body || '').matchAll(/^!\[(.*?)\]\(([^\s)]+)\)$/gim)) {
    register(match[2]);
  }

  for (const match of String(body || '').matchAll(/<img[^>]+src=["']([^"']+)["']/gim)) {
    register(match[1]);
  }

  return imageDataUrls;
}

export function inlineBodyImageSources(body, bodyImageDataUrls = {}) {
  return String(body || '').replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (match, prefix, quote, src) => {
      const replacement = String(bodyImageDataUrls?.[String(src).trim()] || '').trim();
      return replacement ? `${prefix}${quote}${replacement}${quote}` : match;
    }
  );
}

export function resolveOutputPath(filePath) {
  const resolved = path.resolve(String(filePath));
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

export function writeDataUrlFile(filePath, dataUrl) {
  const match = String(dataUrl || '').match(/^data:.*?;base64,(.+)$/);
  if (!match) {
    throw new Error('유효한 data URL 이 아니다.');
  }
  const resolved = resolveOutputPath(filePath);
  fs.writeFileSync(resolved, Buffer.from(match[1], 'base64'));
  return resolved;
}
