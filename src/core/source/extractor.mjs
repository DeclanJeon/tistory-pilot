import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DOMParser } from 'linkedom';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  const ascii = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return ascii || 'source';
}

function resolveUrl(baseUrl, candidate) {
  const value = normalize(candidate);
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return '';
  }
}

function pickMeta(document, selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const value = normalize(element?.getAttribute('content') || element?.getAttribute('href') || element?.textContent || '');
    if (value) return value;
  }
  return '';
}

function removeNoise(root) {
  root.querySelectorAll('script, style, noscript, iframe, form, button, input, select, textarea, svg, canvas, nav, footer, aside').forEach(node => node.remove());
}

function scoreContainer(element) {
  const text = normalize(element.textContent || '');
  if (text.length < 200) return 0;
  const paragraphs = element.querySelectorAll('p').length;
  const headings = element.querySelectorAll('h2, h3').length;
  const images = element.querySelectorAll('img').length;
  return text.length + (paragraphs * 180) + (headings * 120) + (images * 40);
}

function pickContentRoot(document) {
  const selectors = [
    'article',
    'main article',
    '[itemprop="articleBody"]',
    '.article_view',
    '.article',
    '.post-content',
    '.entry-content',
    '.tt_article_useless_p_margin',
    'main',
    '#content'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && scoreContainer(element) > 0) {
      return element;
    }
  }

  const candidates = Array.from(document.querySelectorAll('article, main, section, div'));
  return candidates
    .map(element => ({ element, score: scoreContainer(element) }))
    .sort((a, b) => b.score - a.score)[0]?.element || document.body;
}

function extractBlocks(root, baseUrl, imageLimit) {
  const blocks = [];
  const imageMap = new Map();
  const paragraphTexts = new Set();

  for (const node of Array.from(root.querySelectorAll('h1, h2, h3, p, ul, ol, img, figure img'))) {
    const tag = node.tagName?.toLowerCase?.() || '';
    if (tag === 'img') {
      const src = resolveUrl(baseUrl, node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0] || '');
      if (!src) continue;
      if (!/^https?:/i.test(src)) continue;
      if (imageMap.has(src)) continue;
      const alt = normalize(node.getAttribute('alt') || node.closest('figure')?.querySelector('figcaption')?.textContent || '');
      imageMap.set(src, {
        url: src,
        alt: alt || 'source image',
        width: Number.parseInt(node.getAttribute('width') || '0', 10) || null,
        height: Number.parseInt(node.getAttribute('height') || '0', 10) || null
      });
      continue;
    }

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const text = normalize(node.textContent || '');
      if (text && !paragraphTexts.has(`heading:${text}`)) {
        blocks.push({ type: 'heading', level: tag === 'h3' ? 3 : 2, text });
        paragraphTexts.add(`heading:${text}`);
      }
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.querySelectorAll(':scope > li'))
        .map(item => normalize(item.textContent || ''))
        .filter(Boolean);
      if (items.length) {
        blocks.push({ type: 'list', ordered: tag === 'ol', items });
      }
      continue;
    }

    if (tag === 'p') {
      const text = normalize(node.textContent || '');
      if (!text || text.length < 30) continue;
      if (paragraphTexts.has(text)) continue;
      blocks.push({ type: 'paragraph', text });
      paragraphTexts.add(text);
    }
  }

  return {
    blocks,
    images: Array.from(imageMap.values()).slice(0, imageLimit)
  };
}

function chooseHeroImage(images, ogImage) {
  if (ogImage) {
    const match = images.find(image => image.url === ogImage);
    if (match) return match;
    return { url: ogImage, alt: 'hero image', width: null, height: null };
  }
  return images[0] || null;
}

function dedupeImages(images) {
  const seen = new Set();
  const output = [];
  for (const image of images) {
    if (!image?.url || seen.has(image.url)) continue;
    seen.add(image.url);
    output.push(image);
  }
  return output;
}

function buildSingleBodyText(source, options = {}) {
  const imageEvery = Math.max(2, options.imageEvery || 3);
  const maxParagraphs = Math.max(3, options.maxParagraphs || source.blocks.filter(block => block.type === 'paragraph').length);
  const includedImages = source.images.slice(0, Math.max(0, options.inlineImageLimit ?? source.images.length));
  const lines = [];
  const sourceLabel = source.siteName ? `${source.title} · ${source.siteName}` : source.title;

  if (source.description) {
    lines.push(source.description, '');
  }

  let paragraphCount = 0;
  let imageIndex = 0;
  let firstParagraphSeen = false;

  for (const block of source.blocks) {
    if (block.type === 'paragraph') {
      if (paragraphCount >= maxParagraphs) break;
      lines.push(block.text, '');
      paragraphCount += 1;
      firstParagraphSeen = true;
      if (paragraphCount % imageEvery === 0 && imageIndex < includedImages.length) {
        const image = includedImages[imageIndex];
        lines.push(`![${image.alt || source.title} 출처 이미지](${image.url})`, '');
        imageIndex += 1;
      }
      continue;
    }

    if (block.type === 'heading') {
      if (!firstParagraphSeen && !paragraphCount) continue;
      lines.push(`${'#'.repeat(Math.min(3, block.level))} ${block.text}`, '');
      continue;
    }

    if (block.type === 'list') {
      const prefix = block.ordered ? (index => `${index + 1}. `) : () => '- ';
      for (let index = 0; index < block.items.length; index += 1) {
        lines.push(`${prefix(index)}${block.items[index]}`);
      }
      lines.push('');
    }
  }

  for (; imageIndex < includedImages.length; imageIndex += 1) {
    const image = includedImages[imageIndex];
    lines.push(`![${image.alt || source.title} 출처 이미지](${image.url})`, '');
  }

  lines.push('## 출처', '', `- ${sourceLabel}: ${source.url}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildMergedTitle(sources) {
  if (sources.length === 1) return sources[0].title;
  return `${sources[0].title} 외 ${sources.length - 1}건 정리`;
}

function buildMergedDescription(sources) {
  if (sources.length === 1) return sources[0].description || '';
  const sites = Array.from(new Set(sources.map(source => source.siteName).filter(Boolean)));
  const label = sites.slice(0, 3).join(', ');
  return `${label}${sites.length > 3 ? ' 등' : ''} ${sources.length}개 소스를 바탕으로 핵심 내용을 묶어 정리했다.`;
}

function buildMergedBodyText(sources, options = {}) {
  const maxParagraphsPerSource = Math.max(2, options.maxParagraphsPerSource || options.maxParagraphs || 6);
  const imageEvery = Math.max(2, options.imageEvery || 3);
  const inlineImageLimit = Math.max(0, options.inlineImageLimit ?? options.imageLimit ?? 2);
  const lines = [];
  const mergedDescription = buildMergedDescription(sources);

  if (mergedDescription) {
    lines.push(mergedDescription, '');
  }

  for (const source of sources) {
    lines.push(`## ${source.title}`, '');
    if (source.description) {
      lines.push(source.description, '');
    }

    let paragraphCount = 0;
    let imageIndex = 0;
    const images = source.images.slice(0, inlineImageLimit);

    for (const block of source.blocks) {
      if (block.type === 'paragraph') {
        if (paragraphCount >= maxParagraphsPerSource) break;
        lines.push(block.text, '');
        paragraphCount += 1;
        if (paragraphCount % imageEvery === 0 && imageIndex < images.length) {
          const image = images[imageIndex];
          lines.push(`![${image.alt || source.title} 출처 이미지](${image.url})`, '');
          imageIndex += 1;
        }
        continue;
      }

      if (block.type === 'heading' && block.text !== source.title) {
        lines.push(`### ${block.text}`, '');
        continue;
      }

      if (block.type === 'list') {
        const prefix = block.ordered ? (index => `${index + 1}. `) : () => '- ';
        for (let index = 0; index < block.items.length; index += 1) {
          lines.push(`${prefix(index)}${block.items[index]}`);
        }
        lines.push('');
      }
    }

    for (; imageIndex < images.length; imageIndex += 1) {
      const image = images[imageIndex];
      lines.push(`![${image.alt || source.title} 출처 이미지](${image.url})`, '');
    }
  }

  lines.push('## 출처', '');
  for (const source of sources) {
    const sourceLabel = source.siteName ? `${source.title} · ${source.siteName}` : source.title;
    lines.push(`- ${sourceLabel}: ${source.url}`);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extensionFromContentType(contentType) {
  if (/png/i.test(contentType)) return '.png';
  if (/jpe?g/i.test(contentType)) return '.jpg';
  if (/webp/i.test(contentType)) return '.webp';
  if (/gif/i.test(contentType)) return '.gif';
  if (/svg/i.test(contentType)) return '.svg';
  return '';
}

function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname);
    return ext && ext.length <= 6 ? ext : '';
  } catch {
    return '';
  }
}

function toUrlList(input) {
  const list = Array.isArray(input) ? input : [input];
  return list
    .flatMap(value => String(value || '').split(/[\n,]+/))
    .map(value => normalize(value))
    .filter(Boolean);
}

export async function downloadImage(url, targetPath) {
  const response = await fetch(url, {
    headers: { 'user-agent': DEFAULT_USER_AGENT }
  });
  if (!response.ok) {
    throw new Error(`이미지 다운로드에 실패했다: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || '';
  const ext = extensionFromUrl(url) || extensionFromContentType(contentType) || '.img';
  const resolved = targetPath.endsWith(ext) ? targetPath : `${targetPath}${ext}`;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(resolved, Buffer.from(arrayBuffer));
  return resolved;
}

export async function fetchSource(url, options = {}) {
  const imageLimit = Math.max(1, options.imageLimit || 5);
  const response = await fetch(url, {
    headers: {
      'user-agent': DEFAULT_USER_AGENT,
      'accept-language': 'ko,en;q=0.8'
    }
  });
  if (!response.ok) {
    throw new Error(`소스 페이지를 가져오지 못했다: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const document = new DOMParser().parseFromString(html, 'text/html');
  removeNoise(document);

  const canonical = resolveUrl(url, pickMeta(document, ['link[rel="canonical"]'])) || url;
  const title = pickMeta(document, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'title'
  ]) || normalize(document.querySelector('h1')?.textContent || '');
  const description = pickMeta(document, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]'
  ]);
  const siteName = pickMeta(document, ['meta[property="og:site_name"]']) || new URL(canonical).host;
  const ogImage = resolveUrl(canonical, pickMeta(document, ['meta[property="og:image"]', 'meta[name="twitter:image"]']));
  const root = pickContentRoot(document);
  const { blocks, images } = extractBlocks(root, canonical, imageLimit);
  const heroImage = chooseHeroImage(images, ogImage);

  return {
    fetchedAt: new Date().toISOString(),
    url: canonical,
    requestedUrl: url,
    title,
    description,
    siteName,
    heroImage,
    images,
    blocks,
    textLength: blocks.filter(block => block.type === 'paragraph').reduce((sum, block) => sum + block.text.length, 0)
  };
}

function buildMergedSource(sources) {
  const images = dedupeImages(sources.flatMap(source => source.images.map(image => ({ ...image, sourceTitle: source.title }))));
  const heroImage = sources.find(source => source.heroImage?.url)?.heroImage || images[0] || null;
  return {
    fetchedAt: new Date().toISOString(),
    url: sources[0]?.url || '',
    requestedUrl: sources[0]?.requestedUrl || '',
    title: buildMergedTitle(sources),
    description: buildMergedDescription(sources),
    siteName: Array.from(new Set(sources.map(source => source.siteName).filter(Boolean))).join(', '),
    heroImage,
    images,
    blocks: [],
    textLength: sources.reduce((sum, source) => sum + source.textLength, 0),
    sourceCount: sources.length,
    sources
  };
}

export async function prepareSourceBundle(input, options = {}) {
  const urls = toUrlList(input);
  if (!urls.length) {
    throw new Error('최소 한 개의 소스 URL이 필요하다.');
  }

  const outputDir = path.resolve(options.outputDir || 'tmp/source-imports');
  fs.mkdirSync(outputDir, { recursive: true });

  const sources = [];
  for (const url of urls) {
    sources.push(await fetchSource(url, options));
  }

  const merged = buildMergedSource(sources);
  const slugBase = slugify(options.slug || (sources.length === 1 ? merged.title : `${sources[0].title}-merged`));
  const bodyText = sources.length === 1
    ? buildSingleBodyText(sources[0], {
      maxParagraphs: options.maxParagraphs,
      inlineImageLimit: options.inlineImageLimit,
      imageEvery: options.imageEvery
    })
    : buildMergedBodyText(sources, {
      maxParagraphsPerSource: options.maxParagraphsPerSource || options.maxParagraphs,
      inlineImageLimit: options.inlineImageLimit ?? options.imageLimit,
      imageEvery: options.imageEvery,
      imageLimit: options.imageLimit
    });

  const payload = sources.length === 1
    ? { ...sources[0], sourceCount: 1, sources }
    : merged;
  const jsonPath = path.join(outputDir, `${slugBase}.json`);
  const bodyPath = path.join(outputDir, `${slugBase}-body.txt`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(bodyPath, `${bodyText}\n`);

  let heroImagePath = '';
  if (options.downloadHero && payload.heroImage?.url) {
    const imageHash = crypto.createHash('sha1').update(payload.heroImage.url).digest('hex').slice(0, 8);
    heroImagePath = await downloadImage(payload.heroImage.url, path.join(outputDir, `${slugBase}-hero-${imageHash}`));
  }

  return {
    source: payload,
    bodyText,
    paths: {
      outputDir,
      jsonPath,
      bodyPath,
      heroImagePath
    }
  };
}

export function mergeSourceIntoConfig(config, prepared) {
  const next = { ...config };
  if (!next.title) next.title = prepared.source.title;
  if (!next.description) next.description = prepared.source.description;
  if (!next.body && !next.bodyFile) {
    next.body = prepared.bodyText;
  }
  if (!next.heroImage && prepared.paths.heroImagePath) {
    next.heroImage = prepared.paths.heroImagePath;
  }
  return next;
}
