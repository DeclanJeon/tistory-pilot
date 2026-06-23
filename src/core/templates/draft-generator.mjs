import { analyzeSourceBundle } from '../source/source-analysis.mjs';
import { getTemplateById } from './catalog.mjs';

function markdownTitle(markdown) {
  const match = String(markdown || '').match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Markdown draft';
}

function markdownParagraphs(markdown) {
  return String(markdown || '')
    .split(/\n\n+/)
    .map(block => block.trim())
    .filter(Boolean);
}

function markdownSource(markdown) {
  const paragraphs = markdownParagraphs(markdown);
  const blocks = [];
  for (const block of paragraphs) {
    if (/^#{1,3}\s+/.test(block)) {
      blocks.push({ type: 'heading', text: block.replace(/^#{1,3}\s+/, '') });
    } else if (/^[-*]\s+/m.test(block)) {
      blocks.push({ type: 'list', items: block.split(/\n/).map(line => line.replace(/^[-*]\s+/, '').trim()).filter(Boolean) });
    } else {
      blocks.push({ type: 'paragraph', text: block.replace(/\n/g, ' ') });
    }
  }
  return {
    sourceCount: 1,
    title: markdownTitle(markdown),
    textLength: String(markdown || '').length,
    images: Array.from(String(markdown || '').matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)).map(match => ({ url: match[1] })),
    blocks
  };
}

function introForTemplate(templateId, title, description) {
  switch (templateId) {
    case 'tech-deep-dive':
      return `${description || `${title}의 핵심 구조와 의미를 단계적으로 정리한다.`}\n\n## 무엇을 다루는가\n`;
    case 'tutorial-guide':
      return `${description || `${title}를 바로 따라갈 수 있도록 절차 중심으로 정리했다.`}\n\n## 준비\n`;
    case 'opinion-analysis':
      return `${description || `${title}에 대한 관점을 먼저 정리한다.`}\n\n## 관점\n`;
    case 'curation-roundup':
      return `${description || `${title}를 여러 포인트로 나눠 빠르게 훑는다.`}\n\n## 한눈에 보기\n`;
    case 'news-briefing':
    default:
      return `${description || `${title}의 핵심만 먼저 정리한다.`}\n\n## 핵심 내용\n`;
  }
}

export function generateDraftFromMarkdown({ markdown, templateId = '', description = '' }) {
  const source = markdownSource(markdown);
  const analysis = analyzeSourceBundle(source, { templateId });
  const requestedTemplate = templateId ? getTemplateById(templateId) : null;
  const resolvedTemplateId = requestedTemplate?.id || analysis.recommendedTemplateId;
  const template = getTemplateById(resolvedTemplateId);
  const title = source.title;
  const draftDescription = description || markdownParagraphs(markdown).find(block => !/^#/.test(block))?.slice(0, 160) || '';
  const body = `${introForTemplate(resolvedTemplateId, title, draftDescription)}\n${String(markdown || '').trim()}`.trim();

  return {
    title,
    description: draftDescription,
    body,
    templateId: resolvedTemplateId,
    templateLabel: template?.label || resolvedTemplateId,
    analysis
  };
}
