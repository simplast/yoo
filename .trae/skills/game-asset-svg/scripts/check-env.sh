#!/bin/bash
# 环境检查：检测可用的 SVG→PNG 转换工具
# 用法: bash check-env.sh
# 输出: 每行一个工具的状态（FOUND / MISSING / INSTALLED）

set +e

echo "=== SVG→PNG 转换工具检测 ==="

found=0

# 1. rsvg-convert (librsvg)
if command -v rsvg-convert >/dev/null 2>&1; then
  echo "FOUND    rsvg-convert     ($(rsvg-convert --version | head -n1))"
  found=$((found+1))
else
  echo "MISSING  rsvg-convert     (推荐: brew install librsvg)"
fi

# 2. ImageMagick (magick / convert)
if command -v magick >/dev/null 2>&1; then
  echo "FOUND    imagemagick(magick)  ($(magick --version | head -n1))"
  found=$((found+1))
elif command -v convert >/dev/null 2>&1; then
  echo "FOUND    imagemagick(convert) ($(convert --version | head -n1))"
  found=$((found+1))
else
  echo "MISSING  imagemagick     (推荐: brew install imagemagick)"
fi

# 3. Inkscape
if command -v inkscape >/dev/null 2>&1; then
  echo "FOUND    inkscape         ($(inkscape --version | head -n1))"
  found=$((found+1))
else
  echo "MISSING  inkscape         (可选, 体积较大)"
fi

# 4. Python cairosvg
if command -v python3 >/dev/null 2>&1; then
  if python3 -c "import cairosvg" 2>/dev/null; then
    echo "FOUND    python3+cairosvg"
    found=$((found+1))
  else
    echo "MISSING  python3+cairosvg (推荐: pip3 install cairosvg)"
  fi
else
  echo "MISSING  python3"
fi

echo ""
echo "=== 网络 API 检查 ==="
if command -v curl >/dev/null 2>&1; then
  echo "FOUND    curl"
else
  echo "MISSING  curl (必要工具)"
fi

if command -v python3 >/dev/null 2>&1; then
  echo "FOUND    python3          (用于 URL-encode prompt)"
else
  echo "MISSING  python3"
fi

echo ""
echo "=== 结果 ==="
if [ $found -gt 0 ]; then
  echo "OK: 找到 $found 个 SVG→PNG 转换工具"
else
  echo "WARN: 没找到任何转换工具，PNG 预览功能将不可用"
  echo "      兜底方案：直接在 IDE 中打开 SVG 文件预览"
fi
