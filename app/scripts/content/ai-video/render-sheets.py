#!/usr/bin/env python3
"""
render-sheets.py — deterministic storyboard sheet renderer for the ai-video track.

Reads a single job JSON file, composes one assembled sheet PNG with EXTERIOR
caption bands (captions are drawn outside the image area, never over the
generated pixels), then splits the rendered sheet back into:

  * clean panels  — the image area of each cell, no caption pixels
  * full panels   — the whole cell including its caption band
  * scene overviews — the per-scene region of the assembled sheet

It also emits review thumbnails for images that are too large to send to a
reviewer model directly. Source outputs are never modified; thumbnails are
new derived files recorded in the manifest.

Usage:
    python3 render-sheets.py JOB_JSON_PATH

Job schema (all paths may be absolute or relative to the job file directory):

{
  "sheet": {
    "out": "sheets/storyboard-sheet.png",
    "title": "optional title text",
    "cols": 2,
    "cellWidth": 1280,
    "cellHeight": 720,
    "captionHeight": 96,
    "margin": 24,
    "gutter": 16,
    "background": "#ffffff",
    "panels": [
      {"id": "scene-1-start", "sceneId": "scene-1", "role": "start",
       "image": "assets/keyframe-scene-1-start.png",
       "caption": "SCENE-1 START - ..."}
    ]
  },
  "extract": {
    "panelDir": "panels",
    "overviewDir": "overviews",
    "overviews": [{"sceneId": "scene-1", "panels": ["scene-1-start", "scene-1-end"]}]
  },
  "thumbnails": [
    {"src": "assets/x.png", "out": "reviews/thumbs/x.jpg", "maxDim": 1600}
  ],
  "outManifest": "render-manifest.json"
}

The manifest records every output path, SHA256, geometry and the resolved
font so the Node evidence gate can re-verify provenance without re-rendering.
"""

import hashlib
import json
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.stderr.write("render-sheets.py requires Pillow (PIL)\n")
    sys.exit(3)

MAX_PANELS = 8
BORDER = 2
INNER_PAD = 8

# Unicode-capable font candidates, in preference order. The first existing
# file wins and is recorded in the manifest. RENDER_SHEETS_FONT overrides.
# fc-match is consulted first when present (deterministic per system) so the
# remote's actual Hangul-capable font is used; DejaVuSans lacks Hangul glyphs.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJKkr-Regular.otf",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "C:/Windows/Fonts/malgun.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fc_match_font():
    """Ask fontconfig for a Korean-capable sans font; returns path or None."""
    import shutil
    import subprocess
    fc = shutil.which("fc-match")
    if not fc:
        return None
    try:
        out = subprocess.run(
            [fc, "-f", "%{file}", "sans:lang=ko"],
            capture_output=True, text=True, timeout=10
        )
        candidate = out.stdout.strip()
        if out.returncode == 0 and candidate and os.path.isfile(candidate):
            return candidate
    except Exception:
        pass
    return None


def resolve_font_path():
    override = os.environ.get("RENDER_SHEETS_FONT", "").strip()
    if override and os.path.isfile(override):
        return override
    matched = fc_match_font()
    if matched:
        return matched
    for candidate in FONT_CANDIDATES:
        if os.path.isfile(candidate):
            return candidate
    return None


def load_font(size):
    path = resolve_font_path()
    if path:
        try:
            return ImageFont.truetype(path, size), path
        except Exception:
            pass
    return ImageFont.load_default(), None


def text_width(draw, text, font):
    try:
        return draw.textlength(text, font=font)
    except Exception:
        bbox = draw.textbbox((0, 0), text, font=font)
        return bbox[2] - bbox[0]


def wrap_caption(draw, text, font, max_width):
    """Wrap the complete caption without discarding text."""
    words = str(text or "").split()
    lines = []
    current = ""
    for word in words:
        trial = word if not current else current + " " + word
        if text_width(draw, trial, font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            # Hard-split words that alone exceed the line width.
            while text_width(draw, word, font) > max_width and len(word) > 1:
                cut = len(word)
                while cut > 1 and text_width(draw, word[:cut], font) > max_width:
                    cut -= 1
                lines.append(word[:cut])
                word = word[cut:]
            current = word
    if current:
        lines.append(current)
    return lines


def fit_into(img, width, height, background):
    """Contain-fit img into width×height on a background canvas."""
    canvas = Image.new("RGB", (width, height), background)
    src = img.convert("RGB")
    scale = min(width / src.width, height / src.height)
    new_w = max(1, int(round(src.width * scale)))
    new_h = max(1, int(round(src.height * scale)))
    resized = src.resize((new_w, new_h), Image.LANCZOS)
    canvas.paste(resized, ((width - new_w) // 2, (height - new_h) // 2))
    return canvas


def caption_line_height(font):
    if hasattr(font, "getmetrics"):
        ascent, descent = font.getmetrics()
        return ascent + descent + 6
    return 14


def draw_caption_band(draw, box, lines, font, background, fg="#111111"):
    x0, y0, x1, y1 = box
    draw.rectangle(box, fill=background, outline="#333333", width=1)
    line_h = caption_line_height(font)
    total_h = line_h * len(lines)
    y = y0 + max(INNER_PAD, ((y1 - y0) - total_h) // 2)
    for line in lines:
        w = text_width(draw, line, font)
        draw.text((x0 + ((x1 - x0) - w) / 2, y), line, fill=fg, font=font, anchor="lt")
        y += line_h


def render_sheet(job, base_dir):
    sheet_spec = job["sheet"]
    panels = sheet_spec["panels"]
    if not 1 <= len(panels) <= MAX_PANELS:
        raise ValueError(f"panel count {len(panels)} outside 1..{MAX_PANELS}")

    cols = int(sheet_spec.get("cols", 2))
    cell_w = int(sheet_spec.get("cellWidth", 1280))
    cell_h = int(sheet_spec.get("cellHeight", 720))
    cap_h = int(sheet_spec.get("captionHeight", 96))
    margin = int(sheet_spec.get("margin", 24))
    gutter = int(sheet_spec.get("gutter", 16))
    background = sheet_spec.get("background", "#ffffff")
    title = sheet_spec.get("title")

    title_font, font_path = load_font(34)
    cap_font, _ = load_font(24)
    title_h = 72 if title else 0
    measure = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    caption_lines = [
        wrap_caption(measure, panel.get("caption", ""), cap_font, cell_w - 2 * INNER_PAD)
        for panel in panels
    ]
    cap_h = max(cap_h, max(len(lines) for lines in caption_lines)
                * caption_line_height(cap_font) + 2 * INNER_PAD)

    rows = (len(panels) + cols - 1) // cols
    width = margin * 2 + cols * cell_w + (cols - 1) * gutter
    height = margin * 2 + title_h + rows * (cell_h + cap_h) + (rows - 1) * gutter

    sheet = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(sheet)

    if title:
        tw = text_width(draw, title, title_font)
        draw.text(((width - tw) / 2, margin + 8), title, fill="#000000", font=title_font)

    cells = {}
    for index, panel in enumerate(panels):
        row, col = divmod(index, cols)
        cx = margin + col * (cell_w + gutter)
        cy = margin + title_h + row * (cell_h + cap_h + gutter)
        img_box = (cx, cy, cx + cell_w, cy + cell_h)
        cap_box = (cx, cy + cell_h, cx + cell_w, cy + cell_h + cap_h)

        with Image.open(resolve(base_dir, panel["image"])) as src:
            fitted = fit_into(src, cell_w - 2 * BORDER, cell_h - 2 * BORDER, background)
        draw.rectangle(img_box, outline="#222222", width=BORDER)
        sheet.paste(fitted, (cx + BORDER, cy + BORDER))
        draw_caption_band(draw, cap_box, caption_lines[index], cap_font, background)

        cells[panel["id"]] = {
            "id": panel["id"],
            "sceneId": panel.get("sceneId"),
            "role": panel.get("role"),
            "cellRect": [cx, cy, cx + cell_w, cy + cell_h + cap_h],
            "imageRect": [cx + BORDER, cy + BORDER, cx + cell_w - BORDER, cy + cell_h - BORDER],
            "captionRect": [cx, cy + cell_h, cx + cell_w, cy + cell_h + cap_h],
            "source": panel["image"],
        }

    out_path = resolve(base_dir, sheet_spec["out"])
    ensure_parent(out_path)
    sheet.save(out_path, "PNG")

    return sheet, cells, {
        "path": sheet_spec["out"],
        "sha256": sha256_file(out_path),
        "width": width,
        "height": height,
        "panelIds": [p["id"] for p in panels],
    }


def resolve(base_dir, p):
    return p if os.path.isabs(p) else os.path.normpath(os.path.join(base_dir, p))


def ensure_parent(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def extract_panels(job, base_dir, sheet, cells):
    """Split the rendered sheet into per-panel crops and scene overviews."""
    extract = job.get("extract") or {}
    panel_dir = extract.get("panelDir")
    overview_dir = extract.get("overviewDir")
    panels_out = []
    overviews_out = []

    if panel_dir:
        for pid, cell in cells.items():
            full = sheet.crop(tuple(cell["cellRect"]))
            clean = sheet.crop(tuple(cell["imageRect"]))
            panel_path = resolve(base_dir, os.path.join(panel_dir, f"{pid}.png"))
            clean_path = resolve(base_dir, os.path.join(panel_dir, f"{pid}.clean.png"))
            ensure_parent(panel_path)
            full.save(panel_path, "PNG")
            clean.save(clean_path, "PNG")
            panels_out.append({
                "id": pid,
                "sceneId": cell["sceneId"],
                "role": cell["role"],
                "path": os.path.relpath(panel_path, base_dir),
                "sha256": sha256_file(panel_path),
                "cleanPath": os.path.relpath(clean_path, base_dir),
                "cleanSha256": sha256_file(clean_path),
                "width": clean.width,
                "height": clean.height,
            })

    if overview_dir:
        for overview in extract.get("overviews", []):
            ids = [pid for pid in overview.get("panels", []) if pid in cells]
            if not ids:
                continue
            x0 = min(cells[pid]["cellRect"][0] for pid in ids)
            y0 = min(cells[pid]["cellRect"][1] for pid in ids)
            x1 = max(cells[pid]["cellRect"][2] for pid in ids)
            y1 = max(cells[pid]["cellRect"][3] for pid in ids)
            region = sheet.crop((x0, y0, x1, y1))
            out = resolve(base_dir, os.path.join(overview_dir, f"{overview['sceneId']}.png"))
            ensure_parent(out)
            region.save(out, "PNG")
            overviews_out.append({
                "sceneId": overview["sceneId"],
                "path": os.path.relpath(out, base_dir),
                "sha256": sha256_file(out),
                "width": region.width,
                "height": region.height,
                "panelIds": ids,
            })

    return panels_out, overviews_out


def make_thumbnails(job, base_dir):
    out = []
    for spec in job.get("thumbnails") or []:
        src = resolve(base_dir, spec["src"])
        dst = resolve(base_dir, spec["out"])
        max_dim = int(spec.get("maxDim", 1600))
        with Image.open(src) as img:
            work = img.convert("RGB")
            work.thumbnail((max_dim, max_dim), Image.LANCZOS)
            ensure_parent(dst)
            work.save(dst, "JPEG", quality=85)
        out.append({
            "src": os.path.relpath(src, base_dir),
            "srcSha256": sha256_file(src),
            "path": os.path.relpath(dst, base_dir),
            "sha256": sha256_file(dst),
            "width": work.width,
            "height": work.height,
        })
    return out


def main(argv):
    if len(argv) != 2:
        sys.stderr.write("usage: render-sheets.py JOB_JSON_PATH\n")
        return 2
    job_path = os.path.abspath(argv[1])
    base_dir = os.path.dirname(job_path)
    with open(job_path, "r", encoding="utf-8") as fh:
        job = json.load(fh)

    _, font_path = load_font(24)
    sheet, cells, sheet_info = render_sheet(job, base_dir)
    panels, overviews = extract_panels(job, base_dir, sheet, cells)
    thumbnails = make_thumbnails(job, base_dir)

    manifest = {
        "version": 1,
        "font": font_path or "Pillow.load_default",
        "sheet": sheet_info,
        "panels": panels,
        "overviews": overviews,
        "thumbnails": thumbnails,
    }
    out_manifest = resolve(base_dir, job.get("outManifest", "render-manifest.json"))
    ensure_parent(out_manifest)
    with open(out_manifest, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")
    print(json.dumps(manifest, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
