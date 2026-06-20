#!/bin/bash
# 调用 text_to_image API 生成参考 PNG
# 用法: bash gen-ref.sh "<prompt>" <output_path>
# 示例: bash gen-ref.sh "SVG pixel art tower, ..." assets/towers/corrosive.ref.png
#
# 行为：
#   - 该 API 直接返回图像二进制流（JPEG），不是 JSON
#   - 实际格式由 --content-type 决定，自动以 .jpg / .png 命名
#   - 如果 output_path 后缀与实际格式不一致，强制改后缀

set -e

PROMPT="$1"
OUTPUT="$2"

if [ -z "$PROMPT" ] || [ -z "$OUTPUT" ]; then
  echo "用法: bash gen-ref.sh <prompt> <output_path>" >&2
  exit 1
fi

# URL-encode prompt (使用 python3)
ENCODED_PROMPT=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$PROMPT")

# API 端点 (来自 IDE 规范)
API_URL="https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${ENCODED_PROMPT}&image_size=square"

# 创建输出目录
mkdir -p "$(dirname "$OUTPUT")"

# 临时文件存原始响应
TMPFILE=$(mktemp -t gen-ref-XXXXXX)
trap "rm -f $TMPFILE" EXIT

echo "[gen-ref] 调用 text_to_image API..."
echo "[gen-ref] URL: ${API_URL:0:120}..."

# 下载到临时文件，同时捕获 content-type
HTTP_CODE=$(curl -sS -L --max-time 90 -D - -o "$TMPFILE" -w "%{http_code}" "$API_URL" 2>/dev/null | tail -1)

if [ ! -s "$TMPFILE" ]; then
  echo "[gen-ref] 错误: 响应为空 (HTTP $HTTP_CODE)" >&2
  exit 2
fi

# 用 file 识别实际格式
FILE_TYPE=$(file -b --mime-type "$TMPFILE" 2>/dev/null || echo "unknown")
echo "[gen-ref] 实际格式: $FILE_TYPE (HTTP $HTTP_CODE)"

# 调整文件后缀匹配实际格式
case "$FILE_TYPE" in
  image/jpeg)
    EXT="jpg"
    ;;
  image/png)
    EXT="png"
    ;;
  image/webp)
    EXT="webp"
    ;;
  *)
    echo "[gen-ref] 警告: 未知格式 $FILE_TYPE，强制按 jpg 处理" >&2
    EXT="jpg"
    ;;
esac

# 调整 OUTPUT 路径的后缀
BASE_PATH="${OUTPUT%.*}"
FINAL_OUTPUT="${BASE_PATH}.${EXT}"

# 移动到目标路径
mv "$TMPFILE" "$FINAL_OUTPUT"
trap - EXIT

# 验证
if [ -s "$FINAL_OUTPUT" ]; then
  FILE_SIZE=$(stat -f%z "$FINAL_OUTPUT" 2>/dev/null || stat -c%s "$FINAL_OUTPUT" 2>/dev/null || echo "?")
  echo "[gen-ref] OK: $FINAL_OUTPUT ($FILE_SIZE bytes)"
  if [ "$FINAL_OUTPUT" != "$OUTPUT" ]; then
    echo "[gen-ref] 注: 后缀从 ${OUTPUT##*.} 改为 $EXT 以匹配实际格式"
  fi
else
  echo "[gen-ref] 错误: 输出文件为空" >&2
  exit 3
fi
