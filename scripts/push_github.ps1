# scripts/push_github.ps1
# Script tu dong Commit va Day code len GitHub theo dung nhanh con (branch) dang lam viec

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Day code len GitHub (tranvankha1989/TranslateVideo)"

$projectDir = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location -Path $projectDir

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "   DONG BO VA DAY MA NGUON LEN GITHUB (THEO NHANH CON HIEN TAI)" -ForegroundColor Cyan
Write-Host "   Repository: https://github.com/tranvankha1989/TranslateVideo.git" -ForegroundColor Gray
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

# 2. Xac dinh nhanh (branch) hien tai nguoi dung dang lam viec
$currentBranch = (git rev-parse --abbrev-ref HEAD 2>&1).Trim()
if (-not $currentBranch -or $currentBranch -like "*fatal*") {
    $currentBranch = "main"
}

Write-Host "[*] Nhanh dang lam viec hien tai: " -NoNewline -ForegroundColor White
Write-Host "$currentBranch" -ForegroundColor Green
Write-Host ""

# 3. Kiem tra remote origin
$originUrl = (git remote get-url origin 2>&1).Trim()
if ($originUrl -notlike "*tranvankha1989/TranslateVideo*") {
    Write-Host "[*] Dang cau hinh lai remote origin -> https://github.com/tranvankha1989/TranslateVideo.git" -ForegroundColor Yellow
    git remote remove origin 2>&1 | Out-Null
    git remote add origin https://github.com/tranvankha1989/TranslateVideo.git
}

# 4. Kiem tra file thay doi
Write-Host "[1/3] Dang kiem tra thay doi ma nguon..." -ForegroundColor Yellow
$gitStatus = (git status --porcelain 2>&1)

if ($gitStatus) {
    git add -A

    # Lay phien ban tu version.json neu co
    $version = "3.13.0"
    $versionFile = Join-Path $projectDir "version.json"
    if (Test-Path $versionFile) {
        try {
            $vObj = Get-Content $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($vObj.version) { $version = $vObj.version }
        } catch {}
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $defaultMsg = "feat: [$currentBranch] cap nhat ma nguon v$version ($timestamp)"

    Write-Host ""
    Write-Host "Nhap ghi chu commit (Nhan Enter de lay mac dinh):" -ForegroundColor Cyan
    Write-Host "Mac dinh: '$defaultMsg'" -ForegroundColor Gray
    $userMsg = Read-Host "Commit message"

    if ([string]::IsNullOrWhiteSpace($userMsg)) {
        $commitMsg = $defaultMsg
    } else {
        $commitMsg = $userMsg.Trim()
    }

    Write-Host ""
    Write-Host "[2/3] Dang tao commit: '$commitMsg'..." -ForegroundColor Yellow
    git commit -m $commitMsg
} else {
    Write-Host "[2/3] Ma nguon da sach se, khong co thay doi moi chua commit." -ForegroundColor Gray
}

# 5. Day len GitHub theo dung nhanh dang lam viec
Write-Host ""
Write-Host "[3/3] Dang day code len nhanh '$currentBranch' tren GitHub..." -ForegroundColor Yellow
Write-Host "     Command: git push -u origin $currentBranch" -ForegroundColor Gray
Write-Host ""

git push -u origin $currentBranch

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "===================================================================" -ForegroundColor Green
    Write-Host "  [OK] THANH CONG 100%!" -ForegroundColor Green
    Write-Host "  Code da duoc day len nhanh: $currentBranch" -ForegroundColor Green
    Write-Host "===================================================================" -ForegroundColor Green

    if ($currentBranch -ne "main") {
        $prUrl = "https://github.com/tranvankha1989/TranslateVideo/pull/new/$currentBranch"
        Write-Host ""
        Write-Host "👉 LINK TAO PULL REQUEST DE GOP VAO MAIN:" -ForegroundColor Yellow
        Write-Host "   $prUrl" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "   (Ban co the click hoac copy link tren de mo trang Pull Request tren GitHub)" -ForegroundColor Gray
    }
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "===================================================================" -ForegroundColor Red
    Write-Host "  [X] CO LOI XAY RA KHI DAY LEN GITHUB:" -ForegroundColor Red
    Write-Host "  1. Hay kiem tra ket noi mang Internet cua ban." -ForegroundColor Yellow
    Write-Host "  2. Kiem tra quyen ghi vao repository tranvankha1989/TranslateVideo." -ForegroundColor Yellow
    Write-Host "  3. Neu nhanh tren remote bi lech, hay dung git pull truoc khi push." -ForegroundColor Yellow
    Write-Host "===================================================================" -ForegroundColor Red
    Write-Host ""
}

Write-Host "Hoan tat. Nhan phim bat ky de dong cua so nay..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
