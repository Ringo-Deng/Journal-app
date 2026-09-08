#!/bin/zsh
set -u

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

echo "正在启动翻页测试…"
echo "项目目录：$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "未检测到 Node.js。拾光手帐需要 Node.js 22.13.0 或更高版本。"
  echo "安装完成后，再双击这个文件即可。"
  echo ""
  read "?按回车关闭窗口。"
  exit 1
fi

export SHIGUANG_DEV=1
export SHIGUANG_OPEN_PATH="/three-test"
exec node local/launch.mjs
