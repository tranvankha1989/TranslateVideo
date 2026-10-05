param (
    [string]$RootDir = "$PSScriptRoot\.."
)

$RootDir = (Resolve-Path $RootDir).Path
$DistDir = Join-Path $RootDir "dist_installer"
$Staging = Join-Path $DistDir "OmniVoice_TTS_macOS_Setup"
$ZipPath = Join-Path $DistDir "OmniVoice_TTS_macOS_Setup_v2.2.0.zip"

Write-Host "Bat dau dong goi macOS Setup..." -ForegroundColor Cyan

if (Test-Path $Staging) {
    Remove-Item $Staging -Recurse -Force
}
New-Item -ItemType Directory -Path $Staging -Force | Out-Null

Get-ChildItem -Path $RootDir -Filter "*.command" | Copy-Item -Destination $Staging
Copy-Item (Join-Path $RootDir "start.sh") $Staging
Copy-Item (Join-Path $RootDir "HUONG_DAN_CAI_DAT_MAC.txt") $Staging
Copy-Item (Join-Path $RootDir "README.md") $Staging

if (Test-Path (Join-Path $RootDir "assets")) {
    Copy-Item (Join-Path $RootDir "assets") $Staging -Recurse
}

if (Test-Path (Join-Path $RootDir "notebooks")) {
    Copy-Item (Join-Path $RootDir "notebooks") $Staging -Recurse
}

if (Test-Path (Join-Path $RootDir "HDSD")) {
    Copy-Item (Join-Path $RootDir "HDSD") $Staging -Recurse
}

New-Item -ItemType Directory -Path (Join-Path $Staging "frontend") -Force | Out-Null
if (Test-Path (Join-Path $RootDir "frontend\dist")) {
    Copy-Item (Join-Path $RootDir "frontend\dist") (Join-Path $Staging "frontend\dist") -Recurse
}

New-Item -ItemType Directory -Path (Join-Path $Staging "backend") -Force | Out-Null
Get-ChildItem (Join-Path $RootDir "backend") -Exclude 'venv', 'outputs', '__pycache__', 'scratch*' | Copy-Item -Destination (Join-Path $Staging "backend") -Recurse

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Write-Host "Dang nen file zip: $ZipPath..." -ForegroundColor Yellow
Compress-Archive -Path "$Staging\*" -DestinationPath $ZipPath -CompressionLevel Optimal
Remove-Item $Staging -Recurse -Force

Write-Host "Da dong goi thanh cong bo cai macOS tai: $ZipPath" -ForegroundColor Green
