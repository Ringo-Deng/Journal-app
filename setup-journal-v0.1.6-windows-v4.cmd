@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Journal v0.1.6 GitHub Setup v4 Launcher

set "URL=https://raw.githubusercontent.com/Ringo-Deng/Journal-app/main/setup-journal-v0.1.6-windows-v4.ps1"
set "PS1=%TEMP%\setup-journal-v0.1.6-windows-v4.ps1"

echo ==============================================
echo  Journal v0.1.6 - Windows GitHub Setup v4
echo ==============================================
echo.
echo Downloading the robust PowerShell setup...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%URL%' -OutFile '%PS1%'"
if errorlevel 1 (
  echo.
  echo ERROR: could not download the PowerShell setup.
  echo Please send me a screenshot of this window.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%ERRORLEVEL%"
echo.
echo v4 finished with code %RC%.
echo This window will stay open.
pause
exit /b %RC%
