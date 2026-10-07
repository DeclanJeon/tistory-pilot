const TEMPLATE_IDS = Object.freeze([
  'tech-deep-dive',
  'tutorial-guide',
  'news-briefing',
  'opinion-analysis',
  'curation-roundup'
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countParagraphs(source) {
  if (Array.isArray(source.sources) && source.sources.length > 0) {
    return source.sources.reduce((sum, item) => sum + countParagraphs(item), 0);
  }
  return (source.blocks || []).filter(block => block.type === 'paragraph').length;
}

function countHeadings(source) {
  if (Array.isArray(source.sources) && source.sources.length > 0) {
    return source.sources.reduce((sum, item) => sum + countHeadings(item), 0);
  }
  return (source.blocks || []).filter(block => block.type === 'heading').length;
}

function countLists(source) {
  if (Array.isArray(source.sources) && source.sources.length > 0) {
    return source.sources.reduce((sum, item) => sum + countLists(item), 0);
  }
  return (source.blocks || []).filter(block => block.type === 'list').length;
}

function inferTemplate(source) {
  const sourceCount = source.sourceCount || source.sources?.length || 1;
  const paragraphCount = countParagraphs(source);
  const headingCount = countHeadings(source);
  const listCount = countLists(source);
  const imageCount = Array.isArray(source.images) ? source.images.length : 0;
  const title = String(source.title || '').toLowerCase();

  if (sourceCount >= 3) return 'curation-roundup';
  if (/가이드|튜토리얼|방법|how to|guide|tutorial/.test(title) || listCount >= 3) return 'tutorial-guide';
  if (paragraphCount >= 12 || headingCount >= 4 || imageCount >= 4) return 'tech-deep-dive';
  if (/의견|논평|분석|전망|opinion|analysis/.test(title)) return 'opinion-analysis';
  return 'news-briefing';
}

function estimateSeries(source) {
  const sourceCount = source.sourceCount || source.sources?.length || 1;
  const paragraphCount = countParagraphs(source);
  const headingCount = countHeadings(source);
  const imageCount = Array.isArray(source.images) ? source.images.length : 0;
  const textLength = Number(source.textLength || 0);

  let score = 0;
  score += Math.floor(textLength / 2200);
  score += Math.floor(paragraphCount / 8);
  score += Math.floor(headingCount / 5);
  score += Math.floor(imageCount / 6);
  score += sourceCount >= 3 ? 1 : 0;

  const recommendedPosts = clamp(1 + score, 1, 4);
  const maxPosts = clamp(Math.max(recommendedPosts, Math.ceil((textLength || 1) / 1800)), 1, 5);
  return {
    recommendedPosts,
    minPosts: 1,
    maxPosts,
    strategy: recommendedPosts > 1 ? 'series' : 'single-post'
  };
}

export function analyzeSourceBundle(source, options = {}) {
  const templateId = options.templateId && TEMPLATE_IDS.includes(options.templateId)
    ? options.templateId
    : inferTemplate(source);
  const series = estimateSeries(source);
  const paragraphCount = countParagraphs(source);
  const headingCount = countHeadings(source);
  const listCount = countLists(source);
  const imageCount = Array.isArray(source.images) ? source.images.length : 0;
  const sourceCount = source.sourceCount || source.sources?.length || 1;

  return {
    sourceCount,
    paragraphCount,
    headingCount,
    listCount,
    imageCount,
    textLength: Number(source.textLength || 0),
    estimatedPosts: series,
    recommendedTemplateId: templateId,
    recommendationReason: [
      `${sourceCount}개 소스`,
      `문단 ${paragraphCount}개`,
      `헤딩 ${headingCount}개`,
      `이미지 ${imageCount}개`
    ].join(', ')
  };
}
