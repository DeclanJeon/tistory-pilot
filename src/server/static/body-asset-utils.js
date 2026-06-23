export function normalizeAssetPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .trim();
}

export function isRelativeAssetPath(value) {
  const normalized = normalizeAssetPath(value);
  if (!normalized) return false;
  return !/^(?:[a-z]+:|\/\/|#)/i.test(normalized) && !normalized.startsWith('data:');
}

export function collectRelativeBodyAssetPaths(body) {
  const paths = new Set();
  for (const match of String(body || '').matchAll(/^!\[(.*?)\]\(([^\s)]+)\)$/gim)) {
    const candidate = normalizeAssetPath(match[2]);
    if (isRelativeAssetPath(candidate)) paths.add(candidate);
  }
  for (const match of String(body || '').matchAll(/<img[^>]+src=["']([^"']+)["']/gim)) {
    const candidate = normalizeAssetPath(match[1]);
    if (isRelativeAssetPath(candidate)) paths.add(candidate);
  }
  return [...paths].sort((a, b) => a.localeCompare(b));
}

function resolveAssetDataUrl(assetPath, assetDataUrls = {}) {
  const normalized = normalizeAssetPath(assetPath);
  if (!normalized) return '';
  if (assetDataUrls[normalized]) return assetDataUrls[normalized];
  const exact = Object.entries(assetDataUrls).find(([key]) => normalizeAssetPath(key) === normalized)?.[1];
  if (exact) return exact;
  const suffixMatches = Object.entries(assetDataUrls)
    .filter(([key]) => {
      const normalizedKey = normalizeAssetPath(key);
      return normalizedKey.endsWith(`/${normalized}`) || normalized.endsWith(`/${normalizedKey}`);
    })
    .sort((a, b) => b[0].length - a[0].length);
  return suffixMatches[0]?.[1] || '';
}

export function inlineBodyAssetDataUrls(body, assetDataUrls = {}) {
  let output = String(body || '');
  output = output.replace(/(<img[^>]+src=["'])([^"']+)(["'][^>]*>)/gim, (match, prefix, src, suffix) => {
    const replacement = resolveAssetDataUrl(src, assetDataUrls);
    return replacement ? `${prefix}${replacement}${suffix}` : match;
  });
  output = output.replace(/^(!\[(.*?)\]\()([^\s)]+)(\))/gim, (match, prefix, _alt, src, suffix) => {
    const replacement = resolveAssetDataUrl(src, assetDataUrls);
    return replacement ? `${prefix}${replacement}${suffix}` : match;
  });
  return output;
}

function tokenizeImageContext(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .split(/[^\p{Letter}\p{Number}]+/u)
    .map(token => token.trim())
    .filter(Boolean);
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'about', 'case', 'topic', 'post', 'image', 'cover',
  'title', 'main', 'body', 'section', 'study', 'guide', 'trend', 'article', 'html', 'png', 'jpg', 'jpeg', 'webp',
  'gif', 'svg', '파일', '이미지', '본문', '대표', '섹션', '제목', '사례', '정리', '분석'
]);

export function buildFallbackImageQuery({ assetPath = '', title = '', description = '', text = '', category = '' } = {}) {
  const assetBaseName = normalizeAssetPath(assetPath).split('/').at(-1)?.replace(/\.[^.]+$/, '') || '';
  const categoryTerms = {
    'IT·테크': ['technology', 'computer', 'ai'],
    '경제·비즈니스': ['business', 'finance', 'office'],
    '스포츠': ['sports', 'stadium', 'team'],
    '세계·국제': ['world', 'city', 'global'],
    '시사': ['news', 'city', 'people'],
    '사회·이슈': ['people', 'culture', 'event']
  };
  const tokens = [
    ...tokenizeImageContext(assetBaseName),
    ...tokenizeImageContext(title),
    ...tokenizeImageContext(description),
    ...tokenizeImageContext(text).slice(0, 32),
    ...(categoryTerms[String(category || '').trim()] || [])
  ];
  const filtered = [];
  for (const token of tokens) {
    if (STOPWORDS.has(token)) continue;
    if (token.length < 2) continue;
    if (!filtered.includes(token)) filtered.push(token);
    if (filtered.length >= 6) break;
  }
  if (filtered.length === 0) filtered.push('editorial', 'blog');
  return filtered.join(',');
}

function hashLock(value) {
  let hash = 0;
  for (const char of String(value || '')) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }
  return String(Math.abs(hash) || 1);
}

export function buildFallbackImageUrl({ assetPath = '', title = '', description = '', text = '', category = '' } = {}) {
  const query = buildFallbackImageQuery({ assetPath, title, description, text, category });
  const pathQuery = query.split(',').map(part => encodeURIComponent(part)).join('/');
  const lock = hashLock(`${assetPath}|${title}|${category}`);
  return `https://loremflickr.com/1600/900/${pathQuery}?lock=${lock}`;
}
