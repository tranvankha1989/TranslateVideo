[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = (Get-Item $PSScriptRoot).Parent.FullName
$runtimeDir = Join-Path $root "python_runtime"
$zipPath = Join-Path $root "python_embed.zip"
$zipUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "       THIET LAP PYTHON PORTABLE EMBEDDABLE RUNTIME       " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# 1. Tao thu muc runtime neu chua co
if (-not (Test-Path $runtimeDir)) {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
}

# 2. Tai Python Embeddable neu chua co python.exe
$pythonExe = Join-Path $runtimeDir "python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "[1/4] Dang tai Python 3.11.9 Embeddable..." -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    
    Write-Host "[2/4] Dang giai nen vao python_runtime/..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $runtimeDir -Force
    Remove-Item $zipPath -Force
} else {
    Write-Host "[INFO] Da co san python.exe trong python_runtime." -ForegroundColor Green
}

# 3. Cau hinh file ._pth de kich hoat site-packages va import site
$pthFile = Join-Path $runtimeDir "python311._pth"
$pthContent = "python311.zip`r`n.`r`nLib\site-packages`r`n..\backend`r`nimport site`r`n"
Set-Content -Path $pthFile -Value $pthContent -Encoding ASCII
Write-Host "[3/4] Da cau hinh python311._pth (Kich hoat 'import site')." -ForegroundColor Green

# 4. Dong bo site-packages tu backend\venv
$sitePackagesTarget = Join-Path $runtimeDir "Lib\site-packages"
$sitePackagesSource = Join-Path $root "backend\venv\Lib\site-packages"

if (-not (Test-Path $sitePackagesTarget)) {
    New-Item -ItemType Directory -Path $sitePackagesTarget -Force | Out-Null
}

if (Test-Path $sitePackagesSource) {
    Write-Host "[4/4] Dang dong bo toan bo thu vien site-packages..." -ForegroundColor Yellow
    # Sao chep nhanh bang robocopy
    $null = robocopy $sitePackagesSource $sitePackagesTarget /E /NDL /NFL /NJH /NJS /nc /ns /np
    Write-Host "[SUCCESS] Da dong bo xong site-packages vao python_runtime!" -ForegroundColor Green
} else {
    Write-Host "[WARN] Khong tim thay backend\venv\Lib\site-packages, se tien hanh cai pip..." -ForegroundColor Yellow
    $getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
    $getPipPath = Join-Path $root "get-pip.py"
    Invoke-WebRequest -Uri $getPipUrl -OutFile $getPipPath -UseBasicParsing
    & $pythonExe $getPipPath
    Remove-Item $getPipPath -Force
    & $pythonExe -m pip install -r (Join-Path $root "backend\requirements.txt") --target $sitePackagesTarget
}

# 5. Kiem tra thu nghiem runtime
Write-Host "`n--- KIEM TRA PYTHON RUNTIME TEST ---" -ForegroundColor Cyan
& $pythonExe -c "import sys, fastapi, uvicorn, torch; print('✅ Python Runtime Hoat Dong Tot: Python', sys.version.split()[0], '| Torch CUDA:', torch.cuda.is_available())"
Write-Host "=========================================================`n" -ForegroundColor Green
