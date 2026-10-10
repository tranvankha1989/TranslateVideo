# VideoTranslate AI - Auto Create OTA Patch Script (PowerShell)
# Dung de dong goi nhanh goi cap nhat Pre-built Patch upload len GitHub Release
param(
    [switch]$SkipBuild = $false
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = if ($PSScriptRoot) { (Resolve-Path "$PSScriptRoot\..").Path } else { (Get-Location).Path }
Set-Location $Root

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "   DONG GOI BAN CAP NHAT PRE-BUILT PATCH CHO VIDEOTRANSLATE AI" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Doc thong tin phien ban tu version.json
$versionFile = Join-Path $Root "version.json"
if (-not (Test-Path $versionFile)) {
    throw "Khong tim thay file version.json tai: $versionFile"
}

$versionJson = Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $versionJson.version
Write-Host "📌 Phien ban dang dong goi: v$version" -ForegroundColor Green
Write-Host "📝 Mo ta: $($versionJson.description)" -ForegroundColor Gray
Write-Host ""

# 2. Bien dich Frontend moi nhat
if (-not $SkipBuild) {
    Write-Host "[1/3] Dang bien dich Frontend Vite (pnpm run build)..." -ForegroundColor Yellow
    Set-Location (Join-Path $Root "frontend")
    & pnpm.cmd run build
    if ($LASTEXITCODE -ne 0) {
        throw "Bien dich Frontend that bai!"
    }
    Set-Location $Root
    Write-Host "[OK] Da bien dich xong Frontend moi nhat!" -ForegroundColor Green
} else {
    Write-Host "[1/3] Bo qua bien dich Frontend (theo tham so -SkipBuild)." -ForegroundColor Yellow
}

# 3. Dong bo thu muc dist goc
$frontendDist = Join-Path $Root "frontend\dist"
$rootDist = Join-Path $Root "dist"
if (Test-Path $frontendDist) {
    if (-not (Test-Path $rootDist)) { New-Item -ItemType Directory -Path $rootDist -Force | Out-Null }
    Copy-Item -Path "$frontendDist\*" -Destination $rootDist -Recurse -Force
}

# 4. Tao thu muc staging va dong goi ZIP
Write-Host ""
Write-Host "[2/3] Dang chuan bi tep tin cho goi Patch..." -ForegroundColor Yellow
$outputDir = Join-Path $Root "installer_output"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }

$patchZip = Join-Path $outputDir "patch_v$version.zip"
if (Test-Path $patchZip) { Remove-Item $patchZip -Force }

$stagingDir = Join-Path $Root "build_staging\patch"
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

# Chep frontend/dist va dist
New-Item -ItemType Directory -Path (Join-Path $stagingDir "frontend\dist") -Force | Out-Null
Copy-Item -Path "$frontendDist\*" -Destination (Join-Path $stagingDir "frontend\dist") -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $stagingDir "dist") -Force | Out-Null
Copy-Item -Path "$rootDist\*" -Destination (Join-Path $stagingDir "dist") -Recurse -Force

# Chep version.json
Copy-Item -Path $versionFile -Destination (Join-Path $stagingDir "version.json") -Force

# Chep backend logic (app)
New-Item -ItemType Directory -Path (Join-Path $stagingDir "backend\app") -Force | Out-Null
Copy-Item -Path (Join-Path $Root "backend\app\*") -Destination (Join-Path $stagingDir "backend\app") -Recurse -Force -Exclude @('__pycache__', '*.pyc', '*.tmp')

# Chep requirements.txt va .env.example neu co
if (Test-Path (Join-Path $Root "backend\requirements.txt")) {
    Copy-Item -Path (Join-Path $Root "backend\requirements.txt") -Destination (Join-Path $stagingDir "backend\requirements.txt") -Force
}
if (Test-Path (Join-Path $Root "backend\.env.example")) {
    Copy-Item -Path (Join-Path $Root "backend\.env.example") -Destination (Join-Path $stagingDir "backend\.env.example") -Force
}

# Don sach __pycache__ va cac file rac
Get-ChildItem -Path $stagingDir -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $stagingDir -Recurse -File -Include @('*.pyc', '*.tmp') | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[3/3] Dang nen tep thanh: $patchZip ..." -ForegroundColor Yellow
Compress-Archive -Path "$stagingDir\*" -DestinationPath $patchZip -CompressionLevel Optimal

# Xoa staging tam
Remove-Item $stagingDir -Recurse -Force -ErrorAction SilentlyContinue

$zipItem = Get-Item $patchZip
$sizeMB = [math]::Round($zipItem.Length / 1MB, 2)

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "   TAO GOI PRE-BUILT PATCH THANH CONG!" -ForegroundColor Green
Write-Host ("   File: " + $patchZip + " (" + $sizeMB + " MB)") -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "HUONG DAN SU DUNG:" -ForegroundColor Yellow
Write-Host ("1. Vao GitHub Release tag: https://github.com/tranvankha1989/TranslateVideo/releases/tag/v" + $version)
Write-Host ("2. Bam Edit Release va keo tha file patch_v" + $version + ".zip vao muc Attach binaries by dropping them here.")
Write-Host "3. Bam Update release."
Write-Host "Sau do, tat ca nguoi dung desktop khi mo App chi can bam Cap Nhat la app tu tai goi nay ve de trong 5 giay!"
Write-Host ""
