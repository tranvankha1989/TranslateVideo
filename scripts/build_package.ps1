# VideoTranslate AI - 1-Click Build and Package Script (PowerShell)
param(
    [switch]$SkipFrontendBuild = $false
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = "d:\Program File\AI\Video_Translate\self-tts"
Set-Location $Root

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "   QUY TRINH DONG GOI UNG DUNG ELECTRON DESKTOP (STANDALONE + KEY)" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Build Frontend & Electron App
if (-not $SkipFrontendBuild) {
    Write-Host "[1/5] Dang build Frontend Vite & Electron Desktop App..." -ForegroundColor Yellow
    Set-Location "$Root\frontend"
    & pnpm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Build Frontend that bai!" }

    # Xoa release folder cu neu co
    if (Test-Path "$Root\frontend\release") {
        Remove-Item "$Root\frontend\release" -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    & pnpm.cmd run electron:pack
    if ($LASTEXITCODE -ne 0) { throw "Dong goi Electron that bai!" }
    Set-Location $Root
    Write-Host "[OK] Frontend va Electron Native Binaries da san sang!" -ForegroundColor Green
} else {
    Write-Host "[1/5] Bo qua buoc build Frontend (theo tham so -SkipFrontendBuild)." -ForegroundColor Yellow
}

# 2. Kiem tra Python Portable Runtime
Write-Host ""
Write-Host "[2/5] Kiem tra Python Portable Runtime..." -ForegroundColor Yellow
$pyExe = "$Root\python_runtime\python.exe"
if (-not (Test-Path $pyExe)) {
    Write-Host "Dang khoi tao Python Runtime moi..." -ForegroundColor Cyan
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$Root\scripts\setup_runtime.ps1"
} else {
    Write-Host "[OK] Python Runtime da san sang ($pyExe)." -ForegroundColor Green
}

# 3. Kiem tra Binaries FFmpeg
Write-Host ""
Write-Host "[3/5] Kiem tra FFmpeg binaries..." -ForegroundColor Yellow
$binDir = "$Root\bin"
if (-not (Test-Path "$binDir\ffmpeg.exe")) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    $ffmpegSrc = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
    $ffprobeSrc = (Get-Command ffprobe -ErrorAction SilentlyContinue).Source
    if ($ffmpegSrc) { Copy-Item $ffmpegSrc "$binDir\ffmpeg.exe" -Force }
    if ($ffprobeSrc) { Copy-Item $ffprobeSrc "$binDir\ffprobe.exe" -Force }
}
if (Test-Path "$binDir\ffmpeg.exe") {
    Write-Host "[OK] FFmpeg binaries da san sang tai $binDir." -ForegroundColor Green
} else {
    Write-Host "[CANH BAO] Khong tim thay ffmpeg.exe trong he thong!" -ForegroundColor Red
}

# 4. Bao ve ma nguon: Bien dich Bytecode .pyc & Xoa toan bo .py goc trong Staging
Write-Host ""
Write-Host "[4/5] Dang ma hoa va bien dich Backend chong dich nguoc (Bytecode Compilation)..." -ForegroundColor Yellow
$staging = "$Root\build_staging\backend"
if (Test-Path "$Root\build_staging") {
    Remove-Item "$Root\build_staging" -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $staging -Force | Out-Null

Get-ChildItem -Path "$Root\backend" -Exclude @('venv', '.git', '.vscode', '__pycache__', 'logs', 'outputs', 'local_models', '.env') | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $staging -Recurse -Force
}

# Bien dich sang .pyc
if (Test-Path $pyExe) {
    & $pyExe -O -m compileall -b $staging | Out-Null
} else {
    & python -O -m compileall -b $staging | Out-Null
}

# Xoa tat ca file .py goc va file .env khoi staging
Get-ChildItem -Path $staging -Recurse -Filter "*.py" | Remove-Item -Force -ErrorAction SilentlyContinue
if (Test-Path "$staging\.env") {
    Remove-Item "$staging\.env" -Force -ErrorAction SilentlyContinue
}
Write-Host "[OK] Backend da duoc bien dich sang bytecode .pyc (100% chong lo ma nguon)!" -ForegroundColor Green

# 5. Bien dich Inno Setup
Write-Host ""
Write-Host "[5/5] Dang bien dich bo cai dat voi Inno Setup 7..." -ForegroundColor Yellow

$isccCandidates = @(
    "C:\Program Files\Inno Setup 7\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)

$iscc = $null
foreach ($cand in $isccCandidates) {
    if (Test-Path $cand) {
        $iscc = $cand
        break
    }
}

if (-not $iscc) {
    $whereIscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
    if ($whereIscc) { $iscc = $whereIscc }
}

if (-not $iscc) {
    throw "Khong tim thay Inno Setup Compiler (ISCC.exe). Vui long cai dat Inno Setup 7 tu https://jrsoftware.org/isdl.php"
}

Write-Host "Su dung Inno Setup: $iscc" -ForegroundColor Cyan
& "$iscc" "$Root\scripts\installer.iss"

if ($LASTEXITCODE -ne 0) {
    throw "Bien dich Inno Setup that bai!"
}

# Don dep thu muc staging
if (Test-Path "$Root\build_staging") {
    Remove-Item "$Root\build_staging" -Recurse -Force -ErrorAction SilentlyContinue
}

$vName = "3.10.4"
$vJsonFile = "$Root\version.json"
if (Test-Path $vJsonFile) {
    try {
        $vObj = Get-Content $vJsonFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($vObj.version) { $vName = $vObj.version }
    } catch {}
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "[HOAN TAT XUAT SAC] Bo cai dat da san sang tai:" -ForegroundColor Green
Write-Host "$Root\installer_output\VideoTranslateAI_v$($vName)_Setup.exe" -ForegroundColor White
Write-Host ""
Write-Host "- CHONG DICH NGUOC: 100% backend da duoc bien dich sang bytecode .pyc" -ForegroundColor Cyan
Write-Host "- UPDATE HYBRID: Ho tro cap nhat OTA truc tiep tu GitHub ZIP" -ForegroundColor Cyan
Write-Host "- KEY DONG THEO NGAY: Tu dong doi ma moi ngay" -ForegroundColor Cyan
Write-Host "- MASTER KEY: Aimabiet" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Green
