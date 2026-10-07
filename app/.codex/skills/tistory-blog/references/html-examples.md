# HTML 예시 레퍼런스

## 섹션별 완성 예시

### 도입부

```html
<p style="margin:0.8rem 0;">PonsLink에는 "PonsCast"라는 기능이 있다. 회의 중에 녹화된 영상이나 PDF 자료를 모든 참여자에게 동시에 보여주는 기능이다.</p>

<blockquote style="border-left:3px solid #d1d5db;padding:0.8rem 1.2rem;margin:1.5rem 0;color:#4b5563;font-style:italic;background:#f9fafb;border-radius:0 8px 8px 0;">
"화면을 공유하는 대신, 미디어 데이터를 데이터 채널로 보낸다" — 이것이 PonsCast의 핵심 설계 결정이다.
</blockquote>
```

### 알고리즘 설명 섹션

```html
<h2 style="margin:3rem 0 1.2rem;font-size:20px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
⚙️ 프레임 프로토콜: 13바이트에 담긴 것
</h2>

<div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:1rem 1.2rem;margin:1.5rem 0;font-size:15px;">
💡 <strong>PonsCast 프레임은 고정 크기 헤더와 가변 페이로드로 구성된다.</strong> 헤더가 작기 때문에 오버헤드는 무시할 수준이다.
</div>

<p style="margin:0.8rem 0;">첫 번째 바이트(1 byte): 타입 식별자. 항상 9다. PonsLink가 DataChannel에서 사용하는 메시지 타입 중 하나로, 이 값이 9여야 PonsCast 프레임으로 인식된다.</p>

<div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:0.8rem 1.2rem;margin:1rem 0;border-radius:0 8px 8px 0;font-size:15px;">
<strong>시퀀스 번호(4바이트)</strong>: uint32로, 프레임이 생성된 순서를 나타낸다. 수신자는 이 번호로 프레임 순서를 맞추고, 누락을 감지한다.
</div>
```

### 비교 섹션

```html
<h2 style="margin:3rem 0 1.2rem;font-size:20px;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;">
⚖️ 대안 비교: 왜 이 길을 택했는가
</h2>

<div style="overflow-x:auto;margin:1.5rem 0;">
<table style="width:100%;border-collapse:collapse;font-size:15px;">
<thead>
<tr style="background:#1f2937;color:#fff;">
<th style="padding:10px 16px;text-align:left;">대안</th>
<th style="padding:10px 16px;text-align:left;">장점</th>
<th style="padding:10px 16px;text-align:left;">단점</th>
</tr>
</thead>
<tbody>
<tr style="background:#f8fafc;">
<td style="padding:10px 16px;font-weight:600;">화면 공유</td>
<td style="padding:10px 16px;">브라우저 내장</td>
<td style="padding:10px 16px;">iOS 미지원, 전체 화면 노출</td>
</tr>
<tr style="background:#fff;">
<td style="padding:10px 16px;font-weight:600;">addTrack</td>
<td style="padding:10px 16px;">코덱 협상 자동</td>
<td style="padding:10px 16px;">정적 콘텐츠 비효율</td>
</tr>
<tr style="background:#f8fafc;">
<td style="padding:10px 16px;font-weight:600;color:#22c55e;">DataChannel (PonsCast)</td>
<td style="padding:10px 16px;">플랫폼 독립</td>
<td style="padding:10px 16px;">패킷 복구 없음</td>
</tr>
</tbody>
</table>
</div>
```

### 코드 참조 섹션

```html
<div style="background:#0f172a;color:#e2e8f0;padding:1.2rem 1.5rem;border-radius:12px;margin-top:2.5rem;font-size:14px;line-height:1.8;">
<strong style="color:#93c5fd;">📚 읽은 코드</strong><br>
<code style="color:#a5f3fc;">src/lib/ponscast/protocol.ts:1-45</code> — 프레임 프로토콜 정의, 타입 9, 13바이트 헤더<br>
<code style="color:#a5f3fc;">src/hooks/usePonsCastReceiver.ts:103-165</code> — processQueue jitter buffer 및 순서 맞추기<br>
<code style="color:#a5f3fc;">src/services/dataBroadcaster.ts</code> — 토큰 버킷 레이트 리밋<br>
</div>
```

## 색상 팔레트

| 용도 | 색상 코드 | 설명 |
|------|-----------|------|
| 히어로 배경 | `#0a1628` | 다크 네이비 |
| 테일 액센트 | `#2de2e6` | 시안 |
| 강조 텍스트 | `#111827` | 거의 블랙 |
| 노란 박스 배경 | `#fefce8` | 연한 옐로우 |
| 노란 박스 보더 | `#fde68a` | 옐로우 |
| 파란 박스 배경 | `#eff6ff` | 연한 블루 |
| 파란 박스 보더 | `#3b82f6` | 블루 |
| 코드 박스 배경 | `#0f172a` | 다크 |
| 코드 텍스트 | `#a5f3fc` | 라이트 시안 |
| 테이블 헤더 | `#1f2937` | 다크 |
| 테이블 행 홀수 | `#f8fafc` | 연한 그레이 |
