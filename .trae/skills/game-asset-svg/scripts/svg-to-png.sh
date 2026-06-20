#!/bin/bash
# SVG → PNG 转换（按优先级尝试多种工具）
# 用法: bash svg-to-png.sh <input.svg> <output.png> [size]
# 示例: bash svg-to-png.sh tower.svg preview.png 64

set +e

INPUT="$1"
OUTPUT="$2"
SIZE="${3:-64}"

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
  echo "用法: bash svg-to-png.sh <input.svg> <output.png> [size]" >&2
  exit 1
fi

if [ ! -f "$INPUT" ]; then
  echo "错误: 输入文件不存在: $INPUT" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

# 1. rsvg-convert (最佳：librsvg，忠实于 SVG 规范)
if command -v rsvg-convert >/dev/null 2>&1; then
  echo "[svg-to-png] 使用 rsvg-convert..."
  rsvg-convert -w "$SIZE" -h "$SIZE" "$INPUT" -o "$OUTPUT"
  if [ $? -eq 0 ] && [ -s "$OUTPUT" ]; then
    echo "[svg-to-png] OK: $(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null) bytes"
    exit 0
  fi
fi

# 2. ImageMagick 7+ (magick)
if command -v magick >/dev/null 2>&1; then
  echo "[svg-to-png] 使用 ImageMagick (magick)..."
  magick -background none -density 300 "$INPUT" -resize "${SIZE}x${SIZE}" "$OUTPUT"
  if [ $? -eq 0 ] && [ -s "$OUTPUT" ]; then
    echo "[svg-to-png] OK: $(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null) bytes"
    exit 0
  fi
fi

# 3. ImageMagick 6 (convert)
if command -v convert >/dev/null 2>&1; then
  echo "[svg-to-png] 使用 ImageMagick (convert)..."
  convert -background none -density 300 "$INPUT" -resize "${SIZE}x${SIZE}" "$OUTPUT"
  if [ $? -eq 0 ] && [ -s "$OUTPUT" ]; then
    echo "[svg-to-png] OK: $(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null) bytes"
    exit 0
  fi
fi

# 4. Inkscape
if command -v inkscape >/dev/null 2>&1; then
  echo "[svg-to-png] 使用 Inkscape..."
  inkscape -w "$SIZE" -h "$SIZE" "$INPUT" --export-filename="$OUTPUT" 2>/dev/null
  if [ $? -eq 0 ] && [ -s "$OUTPUT" ]; then
    echo "[svg-to-png] OK: $(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null) bytes"
    exit 0
  fi
fi

# 5. Python cairosvg
if command -v python3 >/dev/null 2>&1 && python3 -c "import cairosvg" 2>/dev/null; then
  echo "[svg-to-png] 使用 Python cairosvg..."
  python3 -c "
import cairosvg
cairosvg.svg2png(url='$INPUT', write_to='$OUTPUT', output_width=$SIZE, output_height=$SIZE)
"
  if [ $? -eq 0 ] && [ -s "$OUTPUT" ]; then
    echo "[svg-to-png] OK: $(stat -f%z "$OUTPUT" 2>/dev/null || stat -c%s "$OUTPUT" 2>/dev/null) bytes"
    exit 0
  fi
fi

# 全部失败
echo "[svg-to-png] 错误: 找不到任何 SVG→PNG 转换工具" >&2
echo "[svg-to-png] 建议安装: brew install librsvg  (macOS)" >&2
echo "[svg-to-png] 兜底方案: 直接在 IDE 中打开 SVG 文件预览" >&2
exit 1
