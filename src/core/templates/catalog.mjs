export const TEMPLATE_CATALOG = Object.freeze([
  {
    id: 'tech-deep-dive',
    label: '기술 심층 분석형',
    description: '긴 본문, 구조적 헤딩, 코드/이미지 보강에 맞는 템플릿',
    layout: ['hero', 'summary', 'sectioned-analysis', 'references']
  },
  {
    id: 'tutorial-guide',
    label: '튜토리얼/가이드형',
    description: '순서형 단계와 체크리스트가 많은 글에 맞는 템플릿',
    layout: ['hero', 'goal', 'steps', 'tips', 'references']
  },
  {
    id: 'news-briefing',
    label: '뉴스 브리핑형',
    description: '짧은 핵심 정리와 배경 설명에 맞는 템플릿',
    layout: ['headline', 'brief', 'details', 'references']
  },
  {
    id: 'opinion-analysis',
    label: '의견/해설형',
    description: '논평과 전망 중심의 글에 맞는 템플릿',
    layout: ['headline', 'claim', 'analysis', 'conclusion', 'references']
  },
  {
    id: 'curation-roundup',
    label: '큐레이션/라운드업형',
    description: '여러 링크를 한 편 또는 시리즈로 묶는 템플릿',
    layout: ['headline', 'overview', 'source-breakdown', 'takeaways', 'references']
  }
]);

export function getTemplateCatalog() {
  return TEMPLATE_CATALOG;
}

export function getTemplateById(templateId) {
  return TEMPLATE_CATALOG.find(template => template.id === templateId) || null;
}
