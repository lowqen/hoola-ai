"""README 그림(SVG)을 만든다: 로고, 섹션·기능 아이콘, 바로가기 버튼 (라이트·다크).

GitHub README는 SVG를 <img>로 그려 웹 폰트를 못 쓰므로, 글자는 폰트에서 윤곽선 경로로 바꿔 넣는다.

    pip install fonttools
    python scripts/readme/assets.py <폰트 폴더> docs/readme

폰트 폴더에는 Google Fonts의 Inter[opsz,wght].ttf를 Inter.ttf로, NotoSansKR[wght].ttf를
NotoSansKR.ttf로 둔다 (둘 다 SIL OFL).
"""

import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONT_DIR = Path(sys.argv[1])
OUT = Path(sys.argv[2])

# 연습장 테마(web/src/lib/theme/tokens.css)에서 가져온 색
THEME = {
    "light": {
        "tile": "#D3EEDF",
        "ink": "#2E6A50",
        "text": "#1F2A24",
        "muted": "#5A665F",
        "pill": "#FFFFFF",
        "line": "#D5E0D8",
    },
    "dark": {
        "tile": "#22392E",
        "ink": "#A2D1B7",
        "text": "#E3ECE6",
        "muted": "#9AA8A0",
        "pill": "#121815",
        "line": "#2C3A32",
    },
}

_fonts = {}


def font(name, weight, opsz=None):
    key = (name, weight, opsz)
    if key not in _fonts:
        f = TTFont(FONT_DIR / f"{name}.ttf")
        axes = {"wght": weight}
        if opsz and "opsz" in [a.axisTag for a in f["fvar"].axes]:
            axes["opsz"] = opsz
        _fonts[key] = instantiateVariableFont(f, axes)
    return _fonts[key]


def text_path(s, size, x, y, name="Inter", weight=600, opsz=None):
    """글자열을 SVG 경로 하나로. (x, y)는 기준선 왼쪽. 반환: (d, 너비)."""
    f = font(name, weight, opsz)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    scale = size / f["head"].unitsPerEm
    pen = SVGPathPen(gs, lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    cx = 0.0
    for ch in s:
        g = cmap.get(ord(ch))
        if g is None:
            raise SystemExit(f"{name}에 글자 없음: {ch!r}")
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, x + cx, y)))
        cx += hmtx[g][0] * scale
    return pen.getCommands(), cx


def has_hangul(s):
    return any("가" <= c <= "힣" for c in s)


def label(s, size, x, y, weight=600):
    if has_hangul(s):
        return text_path(s, size, x, y, "NotoSansKR", weight)
    return text_path(s, size, x, y, "Inter", weight, opsz=min(32, max(14, size)))


# 24×24 선 아이콘 (Material Symbols 느낌의 둥근 선)
ICONS = {
    "screens": '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    "features": '<path d="M11 3.5l1.7 5.3 5.3 1.7-5.3 1.7L11 17.5l-1.7-5.3L4 10.5l5.3-1.7z"/><path d="M18.5 15v5M16 17.5h5"/>',
    "bots": '<rect x="4.5" y="8" width="15" height="11.5" rx="3"/><path d="M12 4.5V8"/><circle cx="12" cy="3.5" r="1"/><path d="M9.5 12.5v1M14.5 12.5v1M9.5 16.5h5M2.5 12.5v3M21.5 12.5v3"/>',
    "search": '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/><path d="M8 10.5h5M10.5 8v5"/>',
    "cards": '<rect x="3" y="6.5" width="10.5" height="15" rx="2"/><path d="M8 4.5l1-.9a2 2 0 0 1 2.4-.1l8.2 5.6a2 2 0 0 1 .5 2.8l-5 7.3"/><path d="M8.2 12.3c-1.4-1-1.3-2.4-.3-2.4.5 0 .8.4.8.7 0-.3.3-.7.8-.7 1 0 1.1 1.4-.3 2.4l-.5.4z"/>',
    "dev": '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>',
    "docs": '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7.5h6M9 11h4"/>',
    "license": '<path d="M12 3.5v17M6 20.5h12M5 7h14M12 5V3.5"/><path d="M7.5 7l-3 6.5a3 3 0 0 0 6 0zM16.5 7l-3 6.5a3 3 0 0 0 6 0z"/>',
    "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    "review": '<path d="M3.5 20.5h17M5 16l4.5-5.5 3.5 3 6-7.5"/><circle cx="19" cy="6" r="1.5"/>',
    "trophy": '<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3.5 4.5M16 6h3a3 3 0 0 1-3.5 4.5M12 13.5V17M8.5 20.5h7M10 17h4v3.5h-4z"/>',
    "chip": '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
    "offline": '<path d="M7 18.5h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.6 9.1 4.7 4.7 0 0 0 7 18.5z"/><path d="M12 9.5v6M9.5 13l2.5 2.5 2.5-2.5"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="3.8" ry="9"/><path d="M3 12h18"/>',
    "book": '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/>',
    "lang": '<path d="M4 5h8M8 3.5V5M10.5 5c-.6 3.5-3 6.5-6.5 8M6.5 8.5c1 2 2.6 3.6 4.5 4.5"/><path d="M12.5 20.5l4-9 4 9M14 17.5h5"/>',
}


def icon(name, color, x, y, scale, width=1.9):
    return (
        f'<g transform="translate({x} {y}) scale({scale:g})" fill="none" stroke="{color}" '
        f'stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</g>'
    )


def write(rel, svg):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(svg, encoding="utf-8", newline="\n")


def tile(name, size, radius, pad, t):
    s = (size - 2 * pad) / 24
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
        f'<rect width="{size}" height="{size}" rx="{radius}" fill="{t["tile"]}"/>'
        f"{icon(name, t['ink'], pad, pad, s, 1.9 if size < 40 else 1.8)}</svg>"
    )


def badge(icon_name, caption, title, t):
    cap_d, cap_w = label(caption, 11.5, 0, 0, 500)
    tit_d, tit_w = label(title, 17, 0, 0, 650 if not has_hangul(title) else 700)
    x = 52
    w = round(x + max(cap_w, tit_w) + 24)
    cap_d, _ = label(caption, 11.5, x, 23, 500)
    tit_d, _ = label(title, 17, x, 41.5, 650 if not has_hangul(title) else 700)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="56" viewBox="0 0 {w} 56">'
        f'<rect x=".75" y=".75" width="{w - 1.5}" height="54.5" rx="27.25" fill="{t["pill"]}" '
        f'stroke="{t["line"]}" stroke-width="1.5"/>'
        f"{icon(icon_name, t['ink'], 18, 16, 1, 2.1)}"
        f'<path fill="{t["muted"]}" d="{cap_d}"/><path fill="{t["text"]}" d="{tit_d}"/></svg>'
    )


def lockup(t, app_icon):
    # 앱 아이콘(512) + "hoola" + "-ai" + 한글 부제
    h = 96
    word_d, word_w = text_path("hoola", 60, 0, 0, "Inter", 750, 32)
    x0 = 96 + 22
    word_d, word_w = text_path("hoola", 60, x0, 62, "Inter", 750, 32)
    ai_d, ai_w = text_path("-ai", 60, x0 + word_w, 62, "Inter", 750, 32)
    sub_d, sub_w = text_path("훌라 연습장", 17, x0 + 3, 88, "NotoSansKR", 600)
    w = round(x0 + word_w + ai_w + 6)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'<g transform="translate(0 0) scale({96 / 512:g})">{app_icon}</g>'
        f'<path fill="{t["text"]}" d="{word_d}"/><path fill="{t["ink"]}" d="{ai_d}"/>'
        f'<path fill="{t["muted"]}" d="{sub_d}"/></svg>'
    )


def main():
    fav = (Path(__file__).parents[2] / "web/src/lib/assets/favicon.svg").read_text(encoding="utf-8")
    app_icon = fav[fav.index(">") + 1 : fav.rindex("</svg>")]
    for mode, t in THEME.items():
        write(f"logo/hoola-lockup-{mode}.svg", lockup(t, app_icon))
        for name in ["screens", "features", "bots", "search", "cards", "dev", "docs", "license"]:
            write(f"sections/{name}-{mode}.svg", tile(name, 32, 9, 6, t))
        for name in ["cards", "target", "review", "trophy", "chip", "offline"]:
            write(f"features/{name}-{mode}.svg", tile(name, 56, 16, 13, t))
        write(f"badges/play-en-{mode}.svg", badge("globe", "PLAY NOW", "In your browser", t))
        write(f"badges/rules-en-{mode}.svg", badge("book", "HOW TO PLAY", "Rules (Korean)", t))
        write(f"badges/readme-ko-{mode}.svg", badge("lang", "README", "한국어로 읽기", t))
        write(f"badges/play-ko-{mode}.svg", badge("globe", "지금 바로", "브라우저에서 하기", t))
        write(f"badges/rules-ko-{mode}.svg", badge("book", "처음이라면", "규칙 읽기", t))
        write(f"badges/readme-en-{mode}.svg", badge("lang", "README", "Read in English", t))
    print("ok", sum(1 for _ in OUT.rglob("*.svg")), "svg")


main()
