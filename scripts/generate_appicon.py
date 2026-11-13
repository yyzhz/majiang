#!/usr/bin/env python3
"""生成红中麻将 Android 启动图标（参考页面左上角 brand-mark）。

输出:
  mipmap-*/ic_launcher.png            全幅方形（含深绿背景）
  mipmap-*/ic_launcher_round.png      圆形裁切
  mipmap-*/ic_launcher_foreground.png 自适应图标前景层（透明底）
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RES = "/Users/sheeppyang/CodeBuddy/majiang/android/app/src/main/res"
FONT = "/System/Library/Fonts/Supplemental/Songti.ttc"  # index 0 = Songti SC Black

# 品牌色（取自 css/style.css 与 values/ic_launcher_background）
BG_CENTER = (17, 65, 47)     # #11412F
BG_EDGE = (8, 37, 28)        # #08251C
TILE_TOP = (255, 253, 243)   # #FFFDF3
TILE_BOTTOM = (233, 224, 198)  # #E9E0C6
TILE_EDGE = (185, 173, 143)  # #B9AD8F
TEXT_RED = (122, 31, 31)     # #7A1F1F

LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

SS = 4  # 超采样倍数


def gradient(size, center_color, edge_color, radial=True):
    """低分辨率渐变后放大，速度友好。"""
    small = 64
    img = Image.new("RGB", (small, small))
    px = img.load()
    for y in range(small):
        for x in range(small):
            if radial:
                d = ((x - small / 2) ** 2 + (y - small / 2) ** 2) / (small / 2) ** 2
            else:
                d = (x + y) / (2 * small)
            t = min(1.0, max(0.0, d)) ** 1.2
            c = tuple(int(a + (b - a) * t) for a, b in zip(center_color, edge_color))
            px[x, y] = c
    return img.resize(size, Image.LANCZOS)


def draw_tile(canvas_size, tile_ratio, radius_ratio, thickness_ratio, shadow=True, ss=SS):
    """绘制牌面（透明底画布），返回 RGBA Image。

    tile_ratio 牌宽占画布比例; thickness_ratio 牌底厚度占牌宽比例。
    """
    s = canvas_size * ss
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    tile = int(s * tile_ratio)
    half = tile // 2
    cx = cy = s // 2
    radius = int(tile * radius_ratio)
    thick = max(SS, int(tile * thickness_ratio))

    # 底部软阴影
    if shadow:
        sh = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(sh)
        d.rounded_rectangle(
            [cx - half, cy - half + thick, cx + half, cy + half + thick],
            radius=radius, fill=(0, 0, 0, 110),
        )
        sh = sh.filter(ImageFilter.GaussianBlur(tile * 0.06))
        img.alpha_composite(sh)

    # 牌体厚度（下缘）
    edge = gradient((tile, tile), TILE_EDGE, tuple(int(c * 0.88) for c in TILE_EDGE), radial=False).convert("RGBA")
    mask_edge = Image.new("L", (tile, tile), 0)
    ImageDraw.Draw(mask_edge).rounded_rectangle([0, 0, tile - 1, tile - 1], radius=radius, fill=255)
    img.paste(edge, (cx - half, cy - half + thick), mask_edge)

    # 牌面（160° 对角渐变）
    face = gradient((tile, tile), TILE_TOP, TILE_BOTTOM, radial=False).convert("RGBA")
    mask = Image.new("L", (tile, tile), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, tile - 1, tile - 1], radius=radius, fill=255)
    img.paste(face, (cx - half, cy - half), mask)

    # 高光：顶部细亮线
    hl = ImageDraw.Draw(img)
    hl.rounded_rectangle(
        [cx - half + tile * 0.10, cy - half + tile * 0.055,
         cx + half - tile * 0.10, cy - half + tile * 0.10],
        radius=int(tile * 0.02), fill=(255, 255, 255, 60),
    )

    # 中
    font = ImageFont.truetype(FONT, int(tile * 0.60), index=0)
    d = ImageDraw.Draw(img)
    d.text((cx, cy + tile * 0.01), "中", font=font, fill=TEXT_RED, anchor="mm")

    return img.resize((canvas_size, canvas_size), Image.LANCZOS)


def make_legacy(size):
    """全幅方形图标：深绿渐变背景 + 居中牌面。"""
    s = size * SS
    img = gradient((s, s), BG_CENTER, BG_EDGE).convert("RGBA")
    img.alpha_composite(draw_tile(s, tile_ratio=0.62, radius_ratio=0.26, thickness_ratio=0.07, ss=2))
    return img.resize((size, size), Image.LANCZOS)


def make_round(size):
    s = size * SS
    img = gradient((s, s), BG_CENTER, BG_EDGE).convert("RGBA")
    img.alpha_composite(draw_tile(s, tile_ratio=0.62, radius_ratio=0.26, thickness_ratio=0.07, ss=2))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, s - 1, s - 1], fill=255)
    img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


def make_foreground(size):
    """自适应前景：牌面居中于安全区（66/108 ≈ 0.61），四周透明。"""
    return draw_tile(size, tile_ratio=0.58, radius_ratio=0.26, thickness_ratio=0.07)


def save(img, density, name):
    path = os.path.join(RES, f"mipmap-{density}")
    os.makedirs(path, exist_ok=True)
    img.save(os.path.join(path, name), "PNG")
    print("wrote", os.path.relpath(os.path.join(path, name), RES))


for density, size in LEGACY.items():
    save(make_legacy(size), density, "ic_launcher.png")
    save(make_round(size), density, "ic_launcher_round.png")

for density, size in FOREGROUND.items():
    save(make_foreground(size), density, "ic_launcher_foreground.png")

print("done")
