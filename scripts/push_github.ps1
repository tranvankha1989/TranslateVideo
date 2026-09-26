# scripts/push_github.ps1
# Script tu dong Commit va Day toan bo ma nguon len GitHub tranvankha1989/TranslateVideo

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Day code len GitHub (tranvankha1989/TranslateVideo)"

$projectDir = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location -Path $projectDir

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "  DANG DONG BO VA DAY MA NGUON LEN GITHUB CUA BAN" -ForegroundColor Cyan
Write-Host "  Repository: https://github.com/tranvankha1989/TranslateVideo.git" -ForegroundColor Gray
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kiem tra xem git da duoc cai dat chua
$gitCheck = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCheck) {
    Write-Host "[-] Khong tim thay Git tren may tinh cua ban!" -ForegroundColor Red
    Write-Host "    Vui long cai dat Git tai: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Nhan Enter de thoat"
    exit 1
}

# 2. Dam bao branch hien tai la main
$currentBranch = (git rev-parse --abbrev-ref HEAD 2>&1).Trim()
if ($currentBranch -ne "main") {
    Write-Host "[*] Dang chuyen sang nhanh main..." -ForegroundColor Yellow
    git checkout -B main 2>&1 | Out-Null
}

# 3. Kiem tra remote origin
$originUrl = (git remote get-url origin 2>&1).Trim()
if ($originUrl -notlike "*tranvankha1989/TranslateVideo*") {
    Write-Host "[*] Dang cau hinh lai remote origin -> https://github.com/tranvankha1989/TranslateVideo.git" -ForegroundColor Yellow
    git remote remove origin 2>&1 | Out-Null
    git remote add origin https://github.com/tranvankha1989/TranslateVideo.git
}

# 4. Them toan bo file thay doi vao Git Staging
Write-Host "[1/3] Dang kiem tra va gom toan bo thay doi (git add -A)..." -ForegroundColor Yellow
git add -A

# 5. Kiem tra xem co file can commit khong
$gitStatus = (git status --porcelain 2>&1)
if ($gitStatus) {
    $version = "2.5.0"
    $versionFile = Join-Path $projectDir "version.json"
    if (Test-Path $versionFile) {
        try {
            $vObj = Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($vObj.version) { $version = $vObj.version }
        } catch {}
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMsg = "feat: [v$version] dong bo ma nguon OmniVoice TTS ($timestamp)"
    Write-Host "[2/3] Dang tao commit moi: '$commitMsg'..." -ForegroundColor Yellow
    git commit -m $commitMsg
} else {
    Write-Host "[2/3] Ma nguon da duoc commit day du, khong co thay doi moi chua commit." -ForegroundColor Gray
}

# 6. Day len GitHub
Write-Host "[3/3] Dang day toan bo code len GitHub (git push -u origin main --force)..." -ForegroundColor Yellow
Write-Host "     (Neu trinh duyet bat len hop thoai, ban chi can bam 'Sign in with your browser')" -ForegroundColor Gray
Write-Host ""

git push -u origin main --force

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "===================================================================" -ForegroundColor Green
    Write-Host "  [OK] THANH CONG 100%!" -ForegroundColor Green
    Write-Host "  Toan bo ma nguon da duoc day va cap nhat tren GitHub cua ban:" -ForegroundColor Green
    Write-Host "  -> https://github.com/tranvankha1989/TranslateVideo" -ForegroundColor Cyan
    Write-Host "===================================================================" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "===================================================================" -ForegroundColor Red
    Write-Host "  [X] CO LOI XAY RA KHI DAY LEN GITHUB:" -ForegroundColor Red
    Write-Host "  1. Hay kiem tra ket noi mang Internet cua ban." -ForegroundColor Yellow
    Write-Host "  2. Hay kiem tra xem repository 'TranslateVideo' da duoc tao tren tai khoan:" -ForegroundColor Yellow
    Write-Host "     https://github.com/tranvankha1989 chua." -ForegroundColor Yellow
    Write-Host "  3. Xac nhan dang nhap tren trinh duyet neu duoc hoi." -ForegroundColor Yellow
    Write-Host "===================================================================" -ForegroundColor Red
    Write-Host ""
}

Write-Host "Hoan tat. Nhan phim bat ky de dong cua so nay..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
