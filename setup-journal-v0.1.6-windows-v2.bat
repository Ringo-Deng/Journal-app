@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Journal v0.1.6 GitHub Setup

set "REPO=https://github.com/Ringo-Deng/Journal-app.git"
set "TARGET=%USERPROFILE%\Documents\Journal-app-GitHub"
set "GITEXE="

echo ==============================================
echo  Journal v0.1.6 - Windows GitHub Setup
echo ==============================================
echo.

call :findgit
if not defined GITEXE (
  echo [1/6] Git not found. Installing Git for Windows...
  where winget >nul 2>nul
  if errorlevel 1 goto :nogit
  winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto :nogit
  call :findgit
  if not defined GITEXE (
    echo.
    echo Git was installed. Close this window and run this BAT again.
    pause
    exit /b 0
  )
) else (
  echo [1/6] Git found: !GITEXE!
)

set "SRC=%~1"
if not defined SRC (
  echo.
  echo [2/6] Paste the full path of the extracted shiguang_v016 folder.
  echo Example: C:\Users\...\shiguang_v016
  echo.
  set /p "SRC=Source folder: "
)
set "SRC=%SRC:"=%"

if not exist "%SRC%\package.json" (
  echo.
  echo ERROR: package.json not found in:
  echo %SRC%
  echo Please choose the extracted shiguang_v016 folder, not a .command file.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw -LiteralPath '%SRC%\package.json' ^| ConvertFrom-Json).version"`) do set "VER=%%V"
if not "%VER%"=="0.1.6" (
  echo.
  echo ERROR: detected version %VER%, expected 0.1.6.
  pause
  exit /b 1
)

echo [2/6] Source version confirmed: v0.1.6

if exist "%TARGET%\.git" (
  echo [3/6] Updating local repository...
  pushd "%TARGET%"
  "!GITEXE!" fetch origin || goto :gitfail_inrepo
  "!GITEXE!" checkout main || goto :gitfail_inrepo
  "!GITEXE!" reset --hard origin/main || goto :gitfail_inrepo
  popd
) else (
  echo [3/6] Cloning Journal-app...
  if exist "%TARGET%" rmdir /s /q "%TARGET%"
  "!GITEXE!" clone "%REPO%" "%TARGET%" || goto :gitfail
)

echo [4/6] Copying source and excluding private runtime data...
robocopy "%SRC%" "%TARGET%" /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP ^
 /XD "%SRC%\.git" "%SRC%\.github" "%SRC%\data" "%SRC%\node_modules" "%SRC%\.next" "%SRC%\.vinext" "%SRC%\dist" "%SRC%\build" ^
 /XF ".DS_Store"
if errorlevel 8 (
  echo ERROR: source copy failed.
  pause
  exit /b 1
)

if not exist "%TARGET%\data" mkdir "%TARGET%\data"
> "%TARGET%\data\README.md" echo Private runtime data is intentionally excluded from this public repository.

> "%TARGET%\.gitignore" (
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
  echo data/*
  echo !data/README.md
  echo local/cutout
  echo local/segment
  echo local/clean-paper
  echo local/material-palette
)

echo [5/6] Creating commit...
pushd "%TARGET%"
"!GITEXE!" add -A
"!GITEXE!" diff --cached --quiet
if errorlevel 1 (
  "!GITEXE!" config user.name >nul 2>nul || "!GITEXE!" config user.name "Ringo-Deng"
  "!GITEXE!" config user.email >nul 2>nul || "!GITEXE!" config user.email "Ringo-Deng@users.noreply.github.com"
  "!GITEXE!" commit -m "chore: import journal app v0.1.6 source" || goto :gitfail_inrepo
) else (
  echo No source changes to commit.
)
"!GITEXE!" tag -f v0.1.6 >nul 2>nul

echo [6/6] Pushing to GitHub...
"!GITEXE!" push origin main
if errorlevel 1 goto :pushfail
"!GITEXE!" push origin -f v0.1.6
if errorlevel 1 goto :pushfail

echo.
echo ==============================================
echo SUCCESS: v0.1.6 source pushed to GitHub.
echo Private data/ content was NOT uploaded.
echo ==============================================
start "" "https://github.com/Ringo-Deng/Journal-app"
popd
pause
exit /b 0

:findgit
set "GITEXE="
for /f "delims=" %%G in ('where git 2^>nul') do if not defined GITEXE set "GITEXE=%%G"
if defined GITEXE goto :eof
if exist "%ProgramFiles%\Git\cmd\git.exe" set "GITEXE=%ProgramFiles%\Git\cmd\git.exe"
if defined GITEXE goto :eof
if exist "%LocalAppData%\Programs\Git\cmd\git.exe" set "GITEXE=%LocalAppData%\Programs\Git\cmd\git.exe"
if defined GITEXE goto :eof
for /d %%D in ("%LocalAppData%\GitHubDesktop\app-*") do if exist "%%~fD\resources\app\git\cmd\git.exe" set "GITEXE=%%~fD\resources\app\git\cmd\git.exe"
goto :eof

:nogit
echo.
echo Automatic Git installation failed or winget is unavailable.
echo Opening GitHub Desktop download page...
start "" "https://desktop.github.com/"
pause
exit /b 1

:pushfail
echo.
echo Source is prepared locally, but GitHub authentication is not complete.
echo Local repository: %TARGET%
echo Open GitHub Desktop, sign in, add this local repository, then click Push origin.
popd
start "" "https://desktop.github.com/"
pause
exit /b 2

:gitfail_inrepo
popd
:gitfail
echo.
echo Git operation failed. Please send me a screenshot of the last 10 lines.
pause
exit /b 1
