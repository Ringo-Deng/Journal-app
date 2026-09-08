#!/bin/zsh
set -u

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

echo "正在启动拾光手帐…"
echo "项目目录：$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "未检测到 Node.js。拾光手帐需要 Node.js 22.21.0 或更高版本。"
  echo "安装完成后，再双击这个文件即可。"
  echo ""
  read "?按回车关闭窗口。"
  exit 1
fi

exec node local/launch.mjs
