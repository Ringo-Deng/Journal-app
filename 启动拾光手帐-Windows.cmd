@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title 拾光手帐

echo 正在启动拾光手帐...
echo 项目目录：%CD%

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 未检测到 Node.js。拾光手帐需要 Node.js 22.21.0 或更高版本。
  echo 安装完成后，再双击这个文件即可。
  echo.
  pause
  exit /b 1
)

where git >nul 2>nul
if not errorlevel 1 (
  git rev-parse --is-inside-work-tree >nul 2>nul
  if not errorlevel 1 (
    echo 检查 GitHub 增量更新...
    set "GIT_TERMINAL_PROMPT=0"
    git fetch origin main --quiet
    if not errorlevel 1 (
      git merge --ff-only FETCH_HEAD --quiet
      if errorlevel 1 (
        echo 本地有尚未合并的修改，将继续启动当前本地版本。
      ) else (
        echo 已完成版本检查。
      )
    ) else (
      echo 本次未能拉取 GitHub 更新，将继续启动当前本地版本。
    )
  )
)

node local\launch.mjs
set "SHIGUANG_EXIT=%ERRORLEVEL%"
if not "%SHIGUANG_EXIT%"=="0" (
  echo.
  echo 拾光手帐没有正常启动，请保留本窗口中的提示。
  pause
)
exit /b %SHIGUANG_EXIT%
