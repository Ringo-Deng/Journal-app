$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoUrl = 'https://github.com/Ringo-Deng/Journal-app.git'
$Target = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Journal-app-GitHub'
$Log = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Journal-app-GitHub-setup-v4.log'

try { Start-Transcript -Path $Log -Force | Out-Null } catch {}

function Pause-End([string]$Message, [int]$Code = 0) {
    Write-Host ''
    Write-Host $Message -ForegroundColor $(if ($Code -eq 0) { 'Green' } else { 'Red' })
    Write-Host "Log: $Log"
    Read-Host 'Press Enter to close'
    try { Stop-Transcript | Out-Null } catch {}
    exit $Code
}

function Find-Git {
    $cmd = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Git\cmd\git.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd\git.exe')
    )
    foreach ($p in $candidates) { if (Test-Path -LiteralPath $p) { return $p } }
    return $null
}

function Run-Git([string[]]$Args, [string]$WorkingDir = $null, [switch]$AllowFail) {
    $old = Get-Location
    try {
        if ($WorkingDir) { Set-Location -LiteralPath $WorkingDir }
        & $script:GitExe @Args
        $rc = $LASTEXITCODE
        if (-not $AllowFail -and $rc -ne 0) { throw "git $($Args -join ' ') failed with code $rc" }
        return $rc
    } finally {
        Set-Location $old
    }
}

try {
    Clear-Host
    Write-Host '=============================================='
    Write-Host ' Journal v0.1.6 - Windows GitHub Setup v4'
    Write-Host '=============================================='
    Write-Host ''

    $script:GitExe = Find-Git
    if (-not $script:GitExe) {
        Write-Host '[1/6] Git not found. Installing Git for Windows...'
        $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
        if (-not $winget) { throw 'winget is unavailable. Please install GitHub Desktop or Git for Windows first.' }
        & $winget.Source install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) { throw "Git installation failed with code $LASTEXITCODE" }
        $script:GitExe = Find-Git
        if (-not $script:GitExe) { throw 'Git installed, but Windows has not refreshed it yet. Close this window and run v4 again.' }
    }
    Write-Host "[1/6] Git found: $script:GitExe"

    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = '请选择解压后的 shiguang_v016 文件夹本身'
    $dialog.ShowNewFolderButton = $false
    Write-Host '[2/6] Choose the extracted shiguang_v016 folder...'
    $result = $dialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) { throw 'No folder was selected.' }
    $src = $dialog.SelectedPath
    Write-Host "Selected: $src"

    $package = Join-Path $src 'package.json'
    if (-not (Test-Path -LiteralPath $package)) { throw "package.json not found in: $src" }
    $pkg = Get-Content -Raw -LiteralPath $package | ConvertFrom-Json
    if ($pkg.version -ne '0.1.6') { throw "Detected version '$($pkg.version)', expected '0.1.6'." }
    Write-Host '[2/6] Source version confirmed: v0.1.6'

    if (Test-Path -LiteralPath (Join-Path $Target '.git')) {
        Write-Host '[3/6] Updating existing local repository...'
        Run-Git @('fetch','origin') $Target | Out-Null
        Run-Git @('checkout','main') $Target | Out-Null
        Run-Git @('reset','--hard','origin/main') $Target | Out-Null
    } else {
        Write-Host '[3/6] Cloning Journal-app...'
        if (Test-Path -LiteralPath $Target) {
            $backup = "$Target-old-$(Get-Date -Format yyyyMMdd-HHmmss)"
            Move-Item -LiteralPath $Target -Destination $backup
            Write-Host "Existing folder moved to: $backup"
        }
        & $script:GitExe clone $RepoUrl $Target
        if ($LASTEXITCODE -ne 0) { throw "git clone failed with code $LASTEXITCODE" }
    }

    Write-Host '[4/6] Copying source. Private runtime data is excluded...'
    $excludeDirs = @('.git','.github','.agents','data','node_modules','.next','.vinext','dist','build')
    $robocopyArgs = @($src,$Target,'/E','/R:2','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD') + $excludeDirs + @('/XF','.DS_Store')
    & robocopy.exe @robocopyArgs
    $robo = $LASTEXITCODE
    if ($robo -ge 8) { throw "robocopy failed with code $robo" }

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
    Run-Git @('add','-A') $Target | Out-Null
    $diffRc = Run-Git @('diff','--cached','--quiet') $Target -AllowFail
    if ($diffRc -eq 1) {
        $nameRc = Run-Git @('config','user.name') $Target -AllowFail
        if ($nameRc -ne 0) { Run-Git @('config','user.name','Ringo-Deng') $Target | Out-Null }
        $emailRc = Run-Git @('config','user.email') $Target -AllowFail
        if ($emailRc -ne 0) { Run-Git @('config','user.email','Ringo-Deng@users.noreply.github.com') $Target | Out-Null }
        Run-Git @('commit','-m','chore: import journal app v0.1.6 source') $Target | Out-Null
    } elseif ($diffRc -eq 0) {
        Write-Host 'No source changes to commit.'
    } else {
        throw "git diff failed with code $diffRc"
    }

    Run-Git @('tag','-f','v0.1.6') $Target | Out-Null

    Write-Host '[6/6] Pushing to GitHub...'
    Run-Git @('push','origin','main') $Target | Out-Null
    Run-Git @('push','origin','-f','v0.1.6') $Target | Out-Null

    Start-Process 'https://github.com/Ringo-Deng/Journal-app'
    Pause-End 'SUCCESS: v0.1.6 source is now on GitHub. Private data was NOT uploaded.' 0
}
catch {
    Write-Host ''
    Write-Host 'ERROR:' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Pause-End 'Setup stopped. Send me a screenshot, or send the desktop log file shown above.' 1
}
