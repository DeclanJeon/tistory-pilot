import { readFile } from 'node:fs/promises';
import path from 'node:path';

const mimeByExt = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml']
]);

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function toDataUrl(filePath) {
  const bytes = await readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = mimeByExt.get(ext) || 'application/octet-stream';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export async function loadRevisedManifest(filePath = 'content/ponslink-series/publish-manifest.revised.json') {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function buildPostHtml(post) {
  const body = await readFile(post.bodyFile, 'utf8');
  const blocks = [];

  for (const part of String(body).split(/\n\n+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const lines = trimmed.split(/\n/);
    if (lines.every(line => /^>\s?/.test(line))) {
      const inner = lines
        .map(line => line.replace(/^>\s?/, '').trim())
        .filter(Boolean)
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('');
      blocks.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }

    const imageMatch = trimmed.match(/^!\[(.*?)\]\(([^\s)]+)\)$/i);
    if (imageMatch) {
      const [, alt, src] = imageMatch;
      const resolved = src.startsWith('assets/') ? await toDataUrl(src) : src;
      blocks.push(`<p><img src="${resolved}" alt="${escapeHtml(alt || post.title)}" style="max-width:100%;height:auto;" /></p>`);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(3, headingMatch[1].length);
      blocks.push(`<h${level}>${escapeHtml(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = trimmed.split(/\n/)
        .map(line => line.replace(/^[-*]\s+/, '').trim())
        .filter(Boolean)
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
      blocks.push(`<ul>${items}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = trimmed.split(/\n/)
        .map(line => line.replace(/^\d+\.\s+/, '').trim())
        .filter(Boolean)
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
      blocks.push(`<ol>${items}</ol>`);
      continue;
    }

    blocks.push(`<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`);
  }

  return blocks.join('');
}

export async function updateTistoryPost(page, post, category = '회고') {
  const html = await buildPostHtml(post);
  await page.goto(`https://acstory.tistory.com/manage/post/${post.postId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.tinymce?.activeEditor, { timeout: 30000 });

  await page.click('#post-title-inp', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(post.title, { delay: 1 });

  await page.evaluate(targetCategory => {
    const combo = document.querySelector('[role="combobox"]');
    combo?.click();
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(el => (el.innerText || '').includes(targetCategory));
    option?.click();
  }, category);

  await page.evaluate(contentHtml => {
    window.tinymce.activeEditor.setContent(contentHtml);
    window.tinymce.activeEditor.fire('change');
    window.tinymce.triggerSave?.();
  }, html);

  await new Promise(resolve => setTimeout(resolve, 1000));
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(el => (el.innerText || '').trim() === '완료');
    btn?.click();
  });

  await page.waitForFunction(() => document.body.innerText.includes('공개 발행'), { timeout: 15000 });
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, a, [role="button"]')).find(el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() === '공개 발행');
    btn?.click();
  });

  await new Promise(resolve => setTimeout(resolve, 2200));
  return { postId: post.postId, title: post.title, updated: true };
}
