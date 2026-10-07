---
name: tistory-blog
description: "Tistory 블로그 포스트 작성 및 발행 스킬. 한국어 기술 블로그 글을 쓸 때 사용. 레이아웃, 스타일, 가독성 규칙 포함. 발행은 browser 도구로 Tistory 관리자 페이지에서 수행. 트리거: tistory, 블로그, 포스트, 글쓰기, 발행, blog, post, tistory publish"
---

# Tistory Blog Posting Skill

한국어 기술 블로그 포스트를 작성하고 Tistory에 발행하는 스킬.

## 범위

- `creative-production`은 콘텐츠·영상 제작의 프로젝트 코디네이터이고, 이 스킬은 Tistory 블로그 글쓰기·발행 레인이다.
- 단독 호출이면 `creative-production`에 범위·경로를 한 번만 확인한 뒤 요청된 작업만 실행한다. `creative-production`이 위임한 작업이면 다시 라우팅하거나 인터뷰·승인을 반복하지 않는다.
- 글쓰기 요청은 원고·HTML 산출물만 의미한다 — 영상 패키지, 콘티, 추가 산출물을 함축하지 않는다. 본문 이미지는 아래 이미지 전략 계약에 따른다.
- Tistory 발행은 사용자가 명시적으로 요청했을 때만 수행한다.

## 핵심 원칙

1. **가독성 최우선**: 읽는 사람의 눈 흐름을 고려한 레이아웃
2. **AI 티 제거**: 균일한 구조, 반복 패턴 금지
3. **강약 조절**: 긴 설명 ↔ 짧은 문장 교차
4. **시각적 리듬**: 박스, 인용, 테이블 다양 활용

## 절대 금지

- `한 줄 요약`, `먼저 핵심만 보자`, `바로 본론으로` 같은 AI 패턴
- 모든 섹션이 같은 길이의 문단으로 끝나는 균일한 구조
- ` ``` ` 마크다운 문법 (Tistory는 HTML 렌더링)
- `<details>`, `<summary>` 태그 (Tistory 미지원)
- 모든 이미지를 새로 생성 (웹에서 적절한 이미지를 가져오는 것도 허용)

## 글쓰기 규칙

### 문장 리듬
- 문단 첫 문장은 짧게 (10-20자)
- 설명은 그 뒤에 길게 (3-5문장)
- 핵심은 볼드나 색상 박스로 강조
- 섹션 전환 시 1-2문장 짧은 도입부

### 어조
- "~합니다" 체 사용 (격식체)
- "~이런거", "~어쩔수없이" 같은 구어체 금지
- 기술 용어는第一次에 한글 병기: "백프레셔(backpressure)"
- 비유는 허용하되, 1개 섹션에 1개 이내

### 구조
- 도입: 왜 이 주제가 중요한가 (2-3문장)
- 본문: 4-6개 섹션, 각 섹션마다 이모지 헤더
- 마무리: 핵심 정리 + 읽은 코드 참조
- 각 섹션은 독립적으로 읽을 수 있어야 함

## HTML 템플릿

모든 포스트는 다음 구조를 따른다:

```html
<div style="font-size:16px;line-height:1.82;color:#1f2937;">

<!-- 1. 히어로 이미지 + 캡션 -->
<figure style="margin:0 0 2rem;">
<img style="width:100%;height:auto;border-radius:14px;border:1px solid #e5e7eb;" src="DATA_URI_OR_URL" />
<figcaption style="text-align:center;font-size:13px;color:#6b7280;margin-top:8px;">FIGURE_CAPTION</figcaption>
</figure>

<!-- 2. 섹션 헤더 (이모지 포함) -->
<h2 style="margin:3rem 0 1.2rem;font-size:20px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
EMOJI SECTION_TITLE
</h2>

<!-- 3. 핵심 인사이트 (노란 박스) -->
<div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:1rem 1.2rem;margin:1.5rem 0;font-size:15px;">
💡 <strong>KEY_INSIGHT_TEXT</strong>
</div>

<!-- 4. 정보 박스 (파란 왼쪽 보더) -->
<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:0.8rem 1.2rem;margin:1rem 0;border-radius:0 8px 8px 0;font-size:15px;">
INFO_TEXT
</div>

<!-- 5. 본문 문단 -->
<p style="margin:0.8rem 0;">PARAGRAPH_TEXT</p>

<!-- 6. 강조 문단 -->
<p style="margin:0.8rem 0;">일반 텍스트와 <strong style="color:#111827;">강조 텍스트</strong>, 그리고 <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:14px;">인라인 코드</code>.</p>

<!-- 7. 인용문 (블록인용) -->
<blockquote style="border-left:3px solid #d1d5db;padding:0.8rem 1.2rem;margin:1.5rem 0;color:#4b5563;font-style:italic;background:#f9fafb;border-radius:0 8px 8px 0;">
QUOTE_TEXT
</blockquote>

<!-- 8. 테이블 -->
<div style="overflow-x:auto;margin:1.5rem 0;">
<table style="width:100%;border-collapse:collapse;font-size:15px;">
<thead>
<tr style="background:#1f2937;color:#fff;">
<th style="padding:10px 16px;text-align:left;border-radius:8px 0 0 0;">HEADER_1</th>
<th style="padding:10px 16px;text-align:left;border-radius:0 8px 0 0;">HEADER_2</th>
</tr>
</thead>
<tbody>
<tr style="background:#f8fafc;"><td style="padding:10px 16px;">CELL_1</td><td style="padding:10px 16px;">CELL_2</td></tr>
<tr style="background:#fff;"><td style="padding:10px 16px;">CELL_3</td><td style="padding:10px 16px;">CELL_4</td></tr>
</tbody>
</table>
</div>

<!-- 9. 코드 참조 (다크 박스) -->
<div style="background:#0f172a;color:#e2e8f0;padding:1.2rem 1.5rem;border-radius:12px;margin-top:2.5rem;font-size:14px;line-height:1.8;">
<strong style="color:#93c5fd;">📚 읽은 코드</strong><br>
<code style="color:#a5f3fc;">FILE_PATH:LINE</code> — DESCRIPTION<br>
</div>

</div>
```

## 섹션 이모지 가이드

각 섹션 시작에 적절한 이모지를 붙인다:

| 주제 유형 | 추천 이모지 |
|-----------|------------|
| 개념 설명 | 💡 📖 🔍 |
| 알고리즘/프로세스 | ⚙️ 🔄 📊 |
| 코드 리뷰 | 📝 🔧 💻 |
| 아키텍처 | 🏗️ 🧩 📐 |
| 비교/트레이드오프 | ⚖️ 🔄 🎯 |
| 에러/문제 해결 | 🐛 🛠️ ⚠️ |
| 보안 | 🔒 🛡️ 🔑 |
| 성능 | ⚡ 🚀 📈 |

## 이미지 전략

### PIL 다이어그램 (기본)
기술 다이어그램은 PIL로 생성:
- 다크 배경 (#0a1628) + 그리드
- 테일 컬러 (#2de2e6) + 화이트 텍스트
- 1280x720 크기
- `rounded_rectangle`로 박스, `line`+`polygon`으로 화살표

### 웹 이미지 (선택)
적절한 스톡 이미지가 있으면 URL 직접 사용 허용:
- Unsplash, Pexels 등 무료 이미지
- 기술 블로그용 일러스트레이션
- 반드시 `<figcaption>`으로 출처 표시

### 기존 SVG/Data URI 유지
이미 있는 히어로 이미지는 교체하지 않는다.

## 발행 워크플로우

### 1. 글 작성
1. `.txt` 파일로 원고 작성
2. `.html` 파일로 HTML 변환 (위 템플릿 적용)
3. 이미지 생성 또는 확보

### 2. Tistory 발행
```
browser open → tistory.com/manage/newpost/?type=post
→ 제목 입력 (#post-title-inp)
→ 본문 입력 (tinymce.setContent)
→ 카테고리 선택 (#category-btn → 개발지식)
→ 완료 → 공개 발행
```

### 3. 검증
- 제목 일치
- 이미지 로드
- 카테고리 확인
- 마크다운 누출 없음
- AI 패턴 없음

## 레퍼런스

- 상세 HTML 예시: `references/html-examples.md`
- PIL 이미지 생성: `references/image-generation.md`
- Tistory API 패턴: `references/tistory-patterns.md`
