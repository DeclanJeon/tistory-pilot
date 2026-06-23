export function isHtmlDocument(input) {
  return /<!doctype html|<html\b|<body\b|<[a-z][\s\S]*>/i.test(String(input || ''));
}

export function stripHtml(input) {
  return String(input || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlTitle(input) {
  const html = String(input || '');
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
    || 'HTML 포스트';
}

export function htmlDescription(input) {
  const html = String(input || '');
  return html.match(/<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']+)[\"']/i)?.[1]?.trim()
    || stripHtml(html).slice(0, 160);
}

export function inferCategory(text) {
  const haystack = String(text || '').toLowerCase();
  if (/ai|인공지능|llm|개발|코드|api|서버|클라우드|소프트웨어|테크|기술|프로그래밍|javascript|typescript|python|react|node\.?js|docker|kubernetes|linux|nginx|database|sql/.test(haystack)) return 'IT·테크';
  if (/증시|주식|금리|물가|부동산|경제|비즈니스|기업|매출|투자|창업|스타트업|환율/.test(haystack)) return '경제·비즈니스';
  if (/축구|야구|농구|배구|테니스|골프|경기|리그|선수|감독|월드컵|올림픽|메달|스포츠/.test(haystack)) return '스포츠';
  if (/외교|국제|해외|유럽|미국|중국|일본|우크라|가자|러시아|세계/.test(haystack)) return '세계·국제';
  if (/정치|선거|대통령|국회|정부|장관|정당|사법|법원|검찰|시사/.test(haystack)) return '시사';
  if (/k팝|케이팝|아이돌|팬덤|챌린지|해시태그|sns|인스타|틱톡|유튜브|바이럴|밈|팝업|트렌드|연예|문화|사회|이슈/.test(haystack)) return '사회·이슈';
  return '사회·이슈';
}

export function inferTags(text) {
  const raw = String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*_>`~()[\]{}.,!?;:"'|]/g, ' ')
    .split(/\s+/)
    .map(v => v.trim())
    .filter(v => v.length >= 2 && v.length <= 24);
  const stop = new Set(['그리고', '하지만', '있는', '없는', '대한', '으로', '에서', '이다', '한다', 'this', 'that', 'with', 'from']);
  const seen = [];
  for (const word of raw) {
    const normalized = word.replace(/^\d+$/, '').trim();
    if (!normalized || stop.has(normalized.toLowerCase())) continue;
    if (!seen.includes(normalized)) seen.push(normalized);
    if (seen.length >= 8) break;
  }
  return seen.join(',');
}