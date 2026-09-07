@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Journal v0.1.6 GitHub Setup v5
set "SELF=%~f0"

echo ==============================================
echo  Journal v0.1.6 - Windows GitHub Setup v5
echo  Self-contained - no second download
echo ==============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=$env:SELF; $all=Get-Content -LiteralPath $p; $m=[Array]::IndexOf($all,'#__POWERSHELL_BELOW__'); if($m -lt 0){throw 'Embedded PowerShell section not found'}; $code=($all[($m+1)..($all.Length-1)] -join [Environment]::NewLine); & ([ScriptBlock]::Create($code))"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo.
  echo v5 ended with error code %RC%.
  echo Please send me the screenshot or the Desktop log.
  pause
)
exit /b %RC%

#__POWERSHELL_BELOW__
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$RepoUrl = 'https://github.com/Ringo-Deng/Journal-app.git'
$Target = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Journal-app-GitHub'
$Log = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Journal-app-GitHub-setup-v5.log'
try { Start-Transcript -Path $Log -Force | Out-Null } catch {}

function Finish([string]$Message,[int]$Code) {
  Write-Host ''
  if($Code -eq 0){ Write-Host $Message -ForegroundColor Green } else { Write-Host $Message -ForegroundColor Red }
  Write-Host "Log: $Log"
  try { Stop-Transcript | Out-Null } catch {}
  Read-Host 'Press Enter to close'
  exit $Code
}

function FindGit {
  $c = Get-Command git.exe -ErrorAction SilentlyContinue
  if($c){ return $c.Source }
  $items = @(
    (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe')
  )
  foreach($p in $items){ if(Test-Path -LiteralPath $p){ return $p } }
  return $null
}

function GitRun([string[]]$GitArgs,[string]$WorkingDir,[switch]$AllowFail) {
  Push-Location -LiteralPath $WorkingDir
  try {
    & $script:GitExe @GitArgs
    $rc = $LASTEXITCODE
  } finally { Pop-Location }
  if((-not $AllowFail) -and $rc -ne 0){ throw "git $($GitArgs -join ' ') failed with code $rc" }
  return $rc
}

try {
  Clear-Host
  Write-Host '=============================================='
  Write-Host ' Journal v0.1.6 - Windows GitHub Setup v5'
  Write-Host ' Self-contained / no raw.githubusercontent.com'
  Write-Host '=============================================='
  Write-Host ''

  $script:GitExe = FindGit
  if(-not $script:GitExe){ throw 'Git is not available. Restart Windows once, then run v5 again.' }
  Write-Host "[1/6] Git found: $script:GitExe"

  Add-Type -AssemblyName System.Windows.Forms
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = 'Select the extracted shiguang_v016 folder itself'
  $d.ShowNewFolderButton = $false
  Write-Host '[2/6] Choose the extracted shiguang_v016 folder...'
  if($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK){ throw 'No folder was selected.' }
  $src = $d.SelectedPath
  Write-Host "Selected: $src"

  $package = Join-Path $src 'package.json'
  if(-not (Test-Path -LiteralPath $package)){ throw "package.json not found in: $src" }
  $pkg = Get-Content -Raw -LiteralPath $package | ConvertFrom-Json
  if($pkg.version -ne '0.1.6'){ throw "Detected version '$($pkg.version)', expected '0.1.6'." }
  Write-Host '[2/6] Source version confirmed: v0.1.6'

  if(Test-Path -LiteralPath (Join-Path $Target '.git')){
    Write-Host '[3/6] Updating existing local repository...'
    GitRun @('fetch','origin') $Target | Out-Null
    GitRun @('checkout','main') $Target | Out-Null
    GitRun @('reset','--hard','origin/main') $Target | Out-Null
  } else {
    Write-Host '[3/6] Cloning Journal-app...'
    if(Test-Path -LiteralPath $Target){
      $backup = "$Target-old-$(Get-Date -Format yyyyMMdd-HHmmss)"
      Move-Item -LiteralPath $Target -Destination $backup
      Write-Host "Existing folder moved to: $backup"
    }
    & $script:GitExe clone $RepoUrl $Target
    if($LASTEXITCODE -ne 0){ throw "git clone failed with code $LASTEXITCODE" }
  }

  Write-Host '[4/6] Copying source. Private/runtime data is excluded...'
  $exclude = @('.git','.github','.agents','data','node_modules','.next','.vinext','dist','build')
  $ra = @($src,$Target,'/E','/R:2','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD') + $exclude + @('/XF','.DS_Store')
  & robocopy.exe @ra
  $rr = $LASTEXITCODE
  if($rr -ge 8){ throw "robocopy failed with code $rr" }

  $dataDir = Join-Path $Target 'data'
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  'Private runtime data is intentionally excluded from this public repository.' | Set-Content -LiteralPath (Join-Path $dataDir 'README.md') -Encoding UTF8
  @'
node_modules/
.next/
.vinext/
dist/
build/
.DS_Store
*.log
.env
.env.*
!.env.example
data/*
!data/README.md
local/cutout
local/segment
local/clean-paper
local/material-palette
'@ | Set-Content -LiteralPath (Join-Path $Target '.gitignore') -Encoding UTF8
  Write-Host '[4/6] Source copy complete.'

  Write-Host '[5/6] Creating commit...'
  GitRun @('add','-A') $Target | Out-Null
  $diff = GitRun @('diff','--cached','--quiet') $Target -AllowFail
  if($diff -eq 1){
    if((GitRun @('config','user.name') $Target -AllowFail) -ne 0){ GitRun @('config','user.name','Ringo-Deng') $Target | Out-Null }
    if((GitRun @('config','user.email') $Target -AllowFail) -ne 0){ GitRun @('config','user.email','Ringo-Deng@users.noreply.github.com') $Target | Out-Null }
    GitRun @('commit','-m','chore: import journal app v0.1.6 source') $Target | Out-Null
  } elseif($diff -eq 0){ Write-Host 'No source changes to commit.' } else { throw "git diff failed with code $diff" }

  GitRun @('tag','-f','v0.1.6') $Target | Out-Null
  Write-Host '[6/6] Pushing to GitHub...'
  GitRun @('push','origin','main') $Target | Out-Null
  GitRun @('push','origin','-f','v0.1.6') $Target | Out-Null

  Start-Process 'https://github.com/Ringo-Deng/Journal-app'
  Finish 'SUCCESS: v0.1.6 source is now on GitHub. Private data was NOT uploaded.' 0
} catch {
  Write-Host ''
  Write-Host 'ERROR:' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Finish 'Setup stopped. Send me a screenshot or the Desktop v5 log.' 1
}
