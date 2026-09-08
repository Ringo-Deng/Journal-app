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

# Git 仓库安装版每次启动只拉取 main 的增量更新，不再重新下载整包。
# 禁止终端凭据提示，避免公司网络或未登录 GitHub 时卡死启动。
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "检查 GitHub 增量更新…"
  BEFORE="$(git rev-parse HEAD 2>/dev/null || true)"
  if GIT_TERMINAL_PROMPT=0 git fetch origin main --quiet && git merge --ff-only FETCH_HEAD --quiet; then
    AFTER="$(git rev-parse HEAD 2>/dev/null || true)"
    if [[ -n "$BEFORE" && -n "$AFTER" && "$BEFORE" != "$AFTER" ]]; then
      echo "已更新到最新 main。"
    else
      echo "当前已经是最新 main。"
    fi
  else
    echo "本次未能拉取 GitHub 更新，将继续启动当前本地版本。"
  fi
else
  echo "当前是下载版目录；可正常启动，但不会自动拉取 GitHub 增量更新。"
fi

exec node local/launch.mjs
