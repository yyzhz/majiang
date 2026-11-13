#!/usr/bin/env python3
"""用纯标准库生成麻将主题启动图标，并输出 Android 各密度 PNG。
不依赖 Pillow / ImageMagick，缩放交给 macOS 自带的 sips。
"""
import math
import os
import struct
import subprocess
import zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
TMP = '/tmp/majiang-icon-tmp'
S = 512  # 基准绘制分辨率

BG_LIGHT = (28, 107, 76)
BG_DARK = (8, 37, 28)
TILE = (253, 252, 246)
TILE_EDGE = (216, 207, 182)
TILE_SHADOW = (185, 173, 143)
RED = (179, 38, 30)


def clamp(v):
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def rounded_rect(x, y, cx, cy, hw, hh, r):
    qx = abs(x - cx) - (hw - r)
    qy = abs(y - cy) - (hh - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def rect(x, y, x0, y0, x1, y1):
    return max(x0 - x, x - x1, y0 - y, y - y1)


def blend(px, i, color, a):
    if a <= 0:
        return
    for c in range(3):
        px[i + c] = int(px[i + c] * (1 - a) + color[c] * a)
    px[i + 3] = int(px[i + 3] * (1 - a) + 255 * a)


def draw_base(kind):
    """kind: full / round / foreground"""
    px = bytearray(S * S * 4)
    for yy in range(S):
        v = yy / S
        for xx in range(S):
            u = xx / S
            i = (yy * S + xx) * 4

            if kind == 'foreground':
                px[i + 3] = 0
            else:
                dist = math.hypot(u - 0.5, v - 0.5) / 0.72
                t = clamp(dist)
                bg = tuple(int(BG_LIGHT[c] * (1 - t) + BG_DARK[c] * t) for c in range(3))
                alpha = 1.0
                if kind == 'round':
                    alpha = clamp((0.5 - math.hypot(u - 0.5, v - 0.5)) * S + 0.5)
                px[i], px[i + 1], px[i + 2], px[i + 3] = bg[0], bg[1], bg[2], int(255 * alpha)

            # 牌面尺寸：自适应图标前景需收紧到安全区
            if kind == 'foreground':
                cx, cy, hw, hh, r = 0.5, 0.5, 0.205, 0.265, 0.035
                off = 0.0
            else:
                cx, cy, hw, hh, r = 0.5, 0.5, 0.28, 0.355, 0.045
                off = 0.012

            # 牌底厚边（立体感）
            d = rounded_rect(u, v + off, cx, cy + off, hw, hh, r)
            blend(px, i, TILE_SHADOW, clamp(0.5 / S - d))
            # 牌面
            d = rounded_rect(u, v, cx, cy, hw, hh, r)
            blend(px, i, TILE, clamp(0.5 / S - d))
            # 牌面细边
            inner = rounded_rect(u, v, cx, cy, hw - 0.012, hh - 0.012, max(r - 0.01, 0.005))
            edge_a = clamp(0.5 / S - inner) * (1 - clamp(0.5 / S - (inner + 0.006)))
            blend(px, i, TILE_EDGE, edge_a * 0.55)

            # 「中」字：中间一竖 + 口字框
            if kind == 'foreground':
                sx0, sx1, sy0, sy1 = 0.484, 0.516, 0.32, 0.68
                ox0, ox1, oy0, oy1 = 0.375, 0.625, 0.385, 0.615
                ix0, ix1, iy0, iy1 = 0.405, 0.595, 0.415, 0.585
            else:
                sx0, sx1, sy0, sy1 = 0.478, 0.522, 0.28, 0.72
                ox0, ox1, oy0, oy1 = 0.35, 0.65, 0.375, 0.625
                ix0, ix1, iy0, iy1 = 0.39, 0.61, 0.415, 0.585

            a_stem = clamp(0.5 / S - rect(u, v, sx0, sy0, sx1, sy1))
            a_outer = clamp(0.5 / S - rect(u, v, ox0, oy0, ox1, oy1))
            a_inner = clamp(0.5 / S - rect(u, v, ix0, iy0, ix1, iy1))
            blend(px, i, RED, max(a_stem, a_outer * (1 - a_inner)))

            if kind == 'round':
                alpha = clamp((0.5 - math.hypot(u - 0.5, v - 0.5)) * S + 0.5)
                px[i + 3] = int(px[i + 3] * alpha)
    return px


def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))


def write_png(path, px):
    raw = b''.join(b'\x00' + bytes(px[y * S * 4:(y + 1) * S * 4]) for y in range(S))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


DENSITIES = [
    ('mdpi', 48, 108),
    ('hdpi', 72, 162),
    ('xhdpi', 96, 216),
    ('xxhdpi', 144, 324),
    ('xxxhdpi', 192, 432),
]


def main():
    os.makedirs(TMP, exist_ok=True)
    base = {}
    for kind in ('full', 'round', 'foreground'):
        path = os.path.join(TMP, f'{kind}.png')
        write_png(path, draw_base(kind))
        base[kind] = path

    for dpi, icon_px, fg_px in DENSITIES:
        folder = os.path.join(RES, f'mipmap-{dpi}')
        os.makedirs(folder, exist_ok=True)
        for kind, name, size in (
            ('full', 'ic_launcher.png', icon_px),
            ('round', 'ic_launcher_round.png', icon_px),
            ('foreground', 'ic_launcher_foreground.png', fg_px),
        ):
            out = os.path.join(folder, name)
            subprocess.run(['sips', '-z', str(size), str(size), base[kind], '--out', out],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f'[icon] {os.path.relpath(out, ROOT)}')


if __name__ == '__main__':
    main()
