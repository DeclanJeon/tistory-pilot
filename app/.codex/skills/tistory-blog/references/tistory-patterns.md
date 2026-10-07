# Tistory 발행 패턴

## 브라우저 기반 발행

Tistory는 API가 아닌 브라우저 관리자 페이지를 통해 발행.

### 새 글 발행

```javascript
// 1. 새 글 페이지로 이동
await tab.goto('https://acstory.tistory.com/manage/newpost/?type=post');

// 2. 제목 입력 (React value setter 사용)
await page.evaluate((title) => {
  const el = document.querySelector('#post-title-inp');
  const proto = el instanceof HTMLTextAreaElement 
    ? HTMLTextAreaElement.prototype 
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, title);
  el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:title}));
  el.dispatchEvent(new Event('change', {bubbles:true}));
}, title);

// 3. 본문 입력 (TinyMCE)
await page.evaluate(({html}) => {
  const editor = window.tinymce?.get?.('editor-tistory') || window.tinymce?.activeEditor;
  editor.setContent(html, {format:'html'});
  editor.fire('input'); editor.fire('change'); editor.save();
}, {html});

// 4. 카테고리 선택
await page.click('#category-btn');
await sleep(400);
await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('#category-list [id^="category-item"]'));
  const target = items.find(el => (el.innerText||el.textContent||'').includes('개발지식'));
  if (target) target.click();
});

// 5. 발행
await page.click('#publish-layer-btn');
await page.waitForSelector('#publish-btn', {timeout:30000});
await sleep(400);
await page.click('#publish-btn');
await sleep(3500);
```

### 기존 글 수정

```javascript
// 1. 수정 페이지로 이동
await tab.goto(`https://acstory.tistory.com/manage/post/${postId}`);

// 2-5: 위와 동일
```

### 글 ID 찾기

```javascript
await safeGoto('https://acstory.tistory.com/manage/posts/');
await sleep(1200);
const postId = await page.evaluate((title) => {
  for (const a of Array.from(document.querySelectorAll('a[href]'))) {
    const text = (a.innerText || a.textContent || '').trim();
    const m = (a.href || '').match(/\/(\d+)(?:$|[?#])/);
    if (m && text.includes(title.slice(0, 15))) return m[1];
  }
  return null;
}, title);
```

## 유틸리티 함수

```javascript
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function safeGoto(url) {
  try { await tab.goto(url, {waitUntil:'networkidle2'}); }
  catch { await page.goto(url, {waitUntil:'networkidle2', timeout:45000}); }
}
```

## 검증 체크리스트

```javascript
// 발행 후 검증
const check = await page.evaluate(() => ({
  title: document.title,
  hasImg: document.querySelectorAll('img[src*="data:image"]').length > 0,
  hasCaption: document.querySelectorAll('figcaption').length > 0,
  hasH2: document.querySelectorAll('h2').length,
  hasCallout: document.querySelectorAll('[style*="fefce8"]').length > 0,
  hasBlockquote: document.querySelectorAll('blockquote').length > 0,
  hasDarkCodeBox: document.querySelectorAll('[style*="0f172a"]').length > 0,
  markdownLeak: /```|^#{1,3}\s|!\[/.test(document.body.innerText),
  aiPattern: document.body.innerText.includes('한 줄 요약')
}));
```

## 매니페스트 관리

```json
{
  "seriesTitle": "시리즈 제목",
  "category": "개발지식",
  "blogUrl": "https://acstory.tistory.com",
  "posts": [
    {
      "order": 1,
      "slug": "YYYY-MM-DD-slug",
      "title": "[시리즈 N] 제목",
      "bodyFile": "content/series/final-bodies/slug.txt",
      "bodyHtmlFile": "content/series/html/slug.html",
      "tags": "태그1,태그2",
      "category": "개발지식",
      "description": "글 설명",
      "postId": "NNN"
    }
  ]
}
```
