# 이미지 생성 레퍼런스

## PIL 다이어그램 생성

기술 다이어그램은 Python PIL로 생성. 다크 테마 통일.

### 기본 설정

```python
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
teal = '#2de2e6'
white = '#f0f8ff'
accent = '#7af4fc'
dark_bg = '#0a1628'
```

### 배경 생성

```python
def make_bg():
    img = Image.new('RGB', (W, H), dark_bg)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / (H - 1)
        r = int(10 + (17 - 10) * t)
        g = int(22 + (29 - 22) * t)
        b = int(40 + (51 - 40) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    # 그리드
    for x in range(0, W, 60):
        draw.line([(x, 0), (x, H)], fill=(255, 255, 255, 8), width=1)
    for y in range(0, H, 60):
        draw.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)
    return img, draw
```

### 박스 그리기

```python
def draw_box(draw, x, y, w, h, text, bg='#1a2d4a', outline=teal, text_fill=white, font=None):
    if font is None: font = font_small
    draw.rounded_rectangle((x, y, x+w, y+h), radius=10, fill=bg, outline=outline, width=2)
    lines = text.split('\n')
    line_h = 16
    total_h = len(lines) * line_h
    start_y = y + (h - total_h) / 2
    for i, line in enumerate(lines):
        tw = draw.textlength(line, font=font)
        draw.text((x + (w - tw) / 2, start_y + i * line_h), line, fill=text_fill, font=font)
```

### 화살표 그리기

```python
import math

def draw_arrow(draw, x1, y1, x2, y2, color=teal, width=3):
    draw.line([(x1, y1), (x2, y2)], fill=color, width=width)
    angle = math.atan2(y2 - y1, x2 - x1)
    ah = 12
    px, py = x2 - ah*math.cos(angle-0.4), y2 - ah*math.sin(angle-0.4)
    qx, qy = x2 - ah*math.cos(angle+0.4), y2 - ah*math.sin(angle+0.4)
    draw.polygon([(x2, y2), (px, py), (qx, qy)], fill=color)
```

### 폰트

```python
try:
    font_title = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34)
    font_label = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 22)
    font_small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
    font_tiny = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
except:
    font_title = font_label = font_small = font_tiny = ImageFont.load_default()
```

### 테두리 + 저장

```python
draw.rounded_rectangle((20, 15, W-20, H-15), radius=20, outline=white, width=1)
img.save('/tmp/output.png')
```

## 레이아웃 패턴

### 파이프라인 (좌→우)
```
[Box1] → [Box2] → [Box3] → [Box4]
```
y=260, 박스 간 간격 220px

### 소스→처리→결과 (상→하)
```
[Source]
    ↓
[Process]
    ↓
[Result]
```
x=중앙, y 간격 120px

### 비교 (좌우 대칭)
```
[Option A]    [Option B]
     ↘          ↙
      [Decision]
```

## Base64 변환 (HTML 삽입용)

```javascript
const fs = require('fs');
const imgData = fs.readFileSync('/tmp/output.png');
const dataUri = 'data:image/png;base64,' + imgData.toString('base64');
// HTML의 src 속성에 삽입
```
