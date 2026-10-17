# tools/build_keygen_setup.ps1
# Dong goi KeyGen Admin Desktop thanh bo cai dat Setup.exe bang PyInstaller va Inno Setup

$ErrorActionPreference = "Stop"
$toolsDir = $PSScriptRoot
Set-Location $toolsDir

$pyinstallerExe = Join-Path $toolsDir "..\backend\venv\Scripts\pyinstaller.exe"
$isccExe = "C:\Program Files\Inno Setup 7\ISCC.exe"

if (-not (Test-Path $pyinstallerExe)) {
    Write-Error "[ERROR] Khong tim thay PyInstaller tai: $pyinstallerExe"
}

if (-not (Test-Path $isccExe)) {
    Write-Error "[ERROR] Khong tim thay Inno Setup 7 tai: $isccExe"
}

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "   DONG GOI KEYGEN VIDEOTRANSLATEAI - SETUP INSTALLER" -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan

# 1. Don dep thu muc build cu
Write-Host "[1/3] Don dep thu muc build cu..." -ForegroundColor Yellow
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "dist\KeyGen VideoTranslateAI") { Remove-Item -Recurse -Force "dist\KeyGen VideoTranslateAI" }
if (Test-Path "dist\KeyGen Admin") { Remove-Item -Recurse -Force "dist\KeyGen Admin" }

# 2. Bien dich bang PyInstaller
Write-Host "[2/3] Bien dich Python sang Windows Executable bang PyInstaller..." -ForegroundColor Yellow
& $pyinstallerExe --noconsole `
    --name="KeyGen VideoTranslateAI" `
    --icon="license-key-icon.ico" `
    --clean `
    --distpath="dist" `
    --workpath="build" `
    --hidden-import="cryptography" `
    --hidden-import="keygen_cli" `
    keygen_gui.py

if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] PyInstaller gap loi! Ma thoat: $LASTEXITCODE"
}

# 3. Bien dich Inno Setup
Write-Host "[3/3] Tao bo cai dat Setup bang Inno Setup..." -ForegroundColor Yellow
$outputDir = Join-Path $toolsDir "..\installer_output"
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

& $isccExe keygen_installer.iss

if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] Inno Setup compiler gap loi! Ma thoat: $LASTEXITCODE"
}

Write-Host "===================================================================" -ForegroundColor Green
Write-Host "[THANH CONG] File cai dat da duoc tao tai:" -ForegroundColor Green
Write-Host "installer_output\KeyGen_VideoTranslateAI_Setup.exe" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Green
