@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title Journal v0.1.6 GitHub Setup v3

set "REPO=https://github.com/Ringo-Deng/Journal-app.git"
set "TARGET=%USERPROFILE%\Documents\Journal-app-GitHub"
set "GITEXE="
set "SRC="
set "VER="

echo ==============================================
echo  Journal v0.1.6 - Windows GitHub Setup v3
echo ==============================================
echo.

call :MAIN
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo ==============================================
  echo  DONE. The window will stay open for checking.
  echo ==============================================
) else (
  echo ==============================================
  echo  STOPPED with error code %RC%.
  echo  Please send me a screenshot of this window.
  echo ==============================================
)
echo.
pause
exit /b %RC%

:MAIN
call :FINDGIT
if defined GITEXE goto :GITREADY

echo [1/6] Git not found. Installing Git for Windows...
where winget >nul 2>nul
if errorlevel 1 (
  echo ERROR: winget is unavailable.
  start "" "https://desktop.github.com/"
  exit /b 11
)
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo ERROR: automatic Git installation failed.
  exit /b 12
)
call :FINDGIT
if not defined GITEXE (
  echo Git was installed, but this terminal cannot see it yet.
  echo Close this window, then run this v3 BAT once more.
  exit /b 13
)

:GITREADY
echo [1/6] Git found: %GITEXE%

echo.
echo [2/6] A folder picker will open.
echo Select the extracted shiguang_v016 folder itself.
call :PICKSOURCE
if errorlevel 1 exit /b 21

if not exist "%SRC%\package.json" (
  echo ERROR: package.json was not found in:
  echo %SRC%
  echo Please select the shiguang_v016 folder itself.
  exit /b 22
)

set "JOURNAL_SRC=%SRC%"
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "$p=Join-Path $env:JOURNAL_SRC 'package.json'; try { (Get-Content -Raw -LiteralPath $p | ConvertFrom-Json).version } catch { exit 9 }"`) do set "VER=%%V"
if not "%VER%"=="0.1.6" (
  echo ERROR: detected version "%VER%", expected "0.1.6".
  exit /b 23
)
echo [2/6] Source version confirmed: v0.1.6

call :PREPAREREPO
if errorlevel 1 exit /b 31

call :COPYSOURCE
if errorlevel 1 exit /b 41

call :COMMITANDPUSH
if errorlevel 1 exit /b 51

exit /b 0

:FINDGIT
set "GITEXE="
for /f "delims=" %%G in ('where git 2^>nul') do if not defined GITEXE set "GITEXE=%%G"
if defined GITEXE exit /b 0
if exist "%ProgramFiles%\Git\cmd\git.exe" set "GITEXE=%ProgramFiles%\Git\cmd\git.exe"
if defined GITEXE exit /b 0
if exist "%LocalAppData%\Programs\Git\cmd\git.exe" set "GITEXE=%LocalAppData%\Programs\Git\cmd\git.exe"
if defined GITEXE exit /b 0
for /d %%D in ("%LocalAppData%\GitHubDesktop\app-*") do if exist "%%~fD\resources\app\git\cmd\git.exe" set "GITEXE=%%~fD\resources\app\git\cmd\git.exe"
exit /b 0

:PICKSOURCE
set "SRC="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$s=(New-Object -ComObject Shell.Application).BrowseForFolder(0,'Select the extracted shiguang_v016 folder',0,0); if($s){$s.Self.Path}"`) do set "SRC=%%I"
if not defined SRC (
  echo No folder was selected.
  exit /b 1
)
echo Selected: %SRC%
exit /b 0

:PREPAREREPO
if exist "%TARGET%\.git" goto :UPDATEREPO
echo [3/6] Cloning Journal-app...
if exist "%TARGET%" (
  echo Existing non-Git folder found at:
  echo %TARGET%
  echo Renaming it to Journal-app-GitHub-old...
  if exist "%USERPROFILE%\Documents\Journal-app-GitHub-old" rmdir /s /q "%USERPROFILE%\Documents\Journal-app-GitHub-old"
  move "%TARGET%" "%USERPROFILE%\Documents\Journal-app-GitHub-old" >nul
)
"%GITEXE%" clone "%REPO%" "%TARGET%"
if errorlevel 1 (
  echo ERROR: git clone failed.
  exit /b 1
)
exit /b 0

:UPDATEREPO
echo [3/6] Updating existing local repository...
pushd "%TARGET%"
"%GITEXE%" fetch origin
if errorlevel 1 goto :REPFAIL
"%GITEXE%" checkout main
if errorlevel 1 goto :REPFAIL
"%GITEXE%" reset --hard origin/main
if errorlevel 1 goto :REPFAIL
popd
exit /b 0
:REPFAIL
popd
echo ERROR: repository update failed.
exit /b 1

:COPYSOURCE
echo [4/6] Copying source. Private runtime data is excluded...
robocopy "%SRC%" "%TARGET%" /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP /XD ".git" ".github" ".agents" "data" "node_modules" ".next" ".vinext" "dist" "build" /XF ".DS_Store"
set "ROBORC=%ERRORLEVEL%"
if %ROBORC% GEQ 8 (
  echo ERROR: robocopy failed with code %ROBORC%.
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
echo [4/6] Source copy complete.
exit /b 0

:COMMITANDPUSH
echo [5/6] Creating commit...
pushd "%TARGET%"
"%GITEXE%" add -A
"%GITEXE%" diff --cached --quiet
if errorlevel 1 goto :DOCOMMIT
echo No source changes to commit.
goto :TAGIT

:DOCOMMIT
"%GITEXE%" config user.name >nul 2>nul
if errorlevel 1 "%GITEXE%" config user.name "Ringo-Deng"
"%GITEXE%" config user.email >nul 2>nul
if errorlevel 1 "%GITEXE%" config user.email "Ringo-Deng@users.noreply.github.com"
"%GITEXE%" commit -m "chore: import journal app v0.1.6 source"
if errorlevel 1 goto :PUSHFAIL

:TAGIT
"%GITEXE%" tag -f v0.1.6 >nul 2>nul
echo [6/6] Pushing to GitHub...
"%GITEXE%" push origin main
if errorlevel 1 goto :AUTHFAIL
"%GITEXE%" push origin -f v0.1.6
if errorlevel 1 goto :AUTHFAIL
echo SUCCESS: v0.1.6 source is now on GitHub.
echo Private data/ content was NOT uploaded.
start "" "https://github.com/Ringo-Deng/Journal-app"
popd
exit /b 0

:AUTHFAIL
echo.
echo GitHub authentication was not completed.
echo The source is safely committed locally at:
echo %TARGET%
echo Open GitHub Desktop, sign in, add this repository, and click Push origin.
start "" "https://desktop.github.com/"
popd
exit /b 2

:PUSHFAIL
popd
echo ERROR: commit operation failed.
exit /b 1
