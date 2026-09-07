@echo off
chcp 65001 >nul
setlocal EnableExtensions

title 拾光手帐 v0.1.6 - 推送到 GitHub

set "REPO=https://github.com/Ringo-Deng/Journal-app.git"
set "TARGET=%USERPROFILE%\Documents\Journal-app-GitHub"

echo ==========================================
echo  拾光手帐 v0.1.6 - Windows GitHub 初始化
echo ==========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [错误] 当前 Windows 没有找到 Git。
  echo 请先安装 Git for Windows 或 GitHub Desktop，再重新运行本文件。
  echo https://desktop.github.com/
  echo.
  pause
  exit /b 1
)

set "SRC=%~1"
if "%SRC%"=="" (
  echo 请把解压后的 shiguang_v016 文件夹拖到本 BAT 上运行，
  echo 或直接把该文件夹完整路径粘贴到下面。
  echo.
  set /p "SRC=源码文件夹路径: "
)
set "SRC=%SRC:"=%"

if not exist "%SRC%\package.json" (
  echo.
  echo [错误] 没找到：
  echo %SRC%\package.json
  echo.
  echo 请选择解压后的 shiguang_v016 文件夹，不要选 .command 文件。
  pause
  exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath '%SRC%\package.json' | ConvertFrom-Json).version"`) do set "VER=%%V"

if not "%VER%"=="0.1.6" (
  echo.
  echo [错误] 检测到版本 %VER%，要求 v0.1.6。
  pause
  exit /b 1
)

echo [1/5] 已确认 v0.1.6
echo.

if exist "%TARGET%\.git" (
  echo [2/5] 更新本地 Journal-app 仓库...
  pushd "%TARGET%"
  git fetch origin || goto :gitfail
  git checkout main || goto :gitfail
  git reset --hard origin/main || goto :gitfail
  popd
) else (
  echo [2/5] 克隆 Journal-app...
  if exist "%TARGET%" rmdir /s /q "%TARGET%"
  git clone "%REPO%" "%TARGET%" || goto :gitfail
)

echo.
echo [3/5] 复制源码并排除私人数据...
robocopy "%SRC%" "%TARGET%" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP ^
 /XD "%SRC%\.git" "%SRC%\.github" "%SRC%\data" "%SRC%\node_modules" "%SRC%\.next" "%SRC%\.vinext" "%SRC%\dist" "%SRC%\build" ^
 /XF ".DS_Store"

if errorlevel 8 (
  echo [错误] 复制源码失败。
  pause
  exit /b 1
)

if not exist "%TARGET%\data" mkdir "%TARGET%\data"
(
echo # Local runtime data
echo.
echo 真实手帐正文、上传照片、API 设置、AI 结果和本机任务状态不提交到公开 GitHub 仓库。
) > "%TARGET%\data\README.md"

(
echo node_modules/
echo .next/
echo .vinext/
echo dist/
echo build/
echo .DS_Store
echo *.log
echo .env
echo .env.*
echo !.env.example
echo.
echo # 私人本机数据
echo data/*
echo !data/README.md
echo.
echo # 本机编译产物
echo local/cutout
echo local/segment
echo local/clean-paper
echo local/material-palette
) > "%TARGET%\.gitignore"

echo.
echo [4/5] 创建 v0.1.6 提交...
pushd "%TARGET%"
git add -A

git diff --cached --quiet
if errorlevel 1 (
  git config user.name >nul 2>nul || git config user.name "Ringo-Deng"
  git config user.email >nul 2>nul || git config user.email "Ringo-Deng@users.noreply.github.com"
  git commit -m "chore: import journal app v0.1.6 source" || goto :gitfail2
) else (
  echo 没有新的源码变化需要提交。
)

git tag -f v0.1.6 >nul 2>nul

echo.
echo [5/5] 推送 GitHub...
git push origin main
if errorlevel 1 goto :pushfail

git push origin -f v0.1.6
if errorlevel 1 goto :pushfail

echo.
echo ==========================================
echo  完成！
echo  v0.1.6 已推送到 Ringo-Deng/Journal-app
echo  私人 data 内容没有上传
echo ==========================================
start "" "https://github.com/Ringo-Deng/Journal-app"
popd
pause
exit /b 0

:pushfail
echo.
echo [提示] 源码已在本机整理并提交，但 GitHub 登录认证没有完成。
echo 请打开 GitHub Desktop，添加下面这个本地仓库，然后点击 Push origin：
echo %TARGET%
popd
pause
exit /b 2

:gitfail2
popd
:gitfail
echo.
echo [错误] Git 操作失败。请把这个窗口最后几行截图发给我。
pause
exit /b 1
