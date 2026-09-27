# ==============================================================================
# check_online_gpu.ps1 — Kiem tra GPU Online, Tu dong Mo Colab va Cho toi da 60s
# ==============================================================================

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$envFile = Join-Path $projectDir "backend\.env"

if (-not (Test-Path $envFile)) {
    exit 0
}

# 1. Doc cau hinh tu backend/.env
$useRemote = $false
$remoteUrl = ""
$colabUrl = ""

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $k = $parts[0].Trim()
            $v = $parts[1].Trim().Trim('"').Trim("'")
            if ($k -eq "USE_REMOTE_GPU") { $useRemote = ($v.ToLower() -eq "true" -or $v -eq "1" -or $v.ToLower() -eq "yes") }
            if ($k -eq "REMOTE_GPU_URL") { $remoteUrl = $v.Trim() }
            if ($k -eq "COLAB_NOTEBOOK_URL" -and $v) { $colabUrl = $v.Trim() }
        }
    }
}

if (-not $useRemote -or -not $remoteUrl) {
    Write-Host "[GPU] He thong khoi dong o che do GPU/CPU cuc bo (Local Mode)." -ForegroundColor Cyan
    exit 0
}

if (-not $colabUrl) {
    $colabUrl = "https://colab.research.google.com/github/tranvankha1989/VoxCPM-TTS/blob/main/notebooks/OmniVoice_Colab_T4.ipynb"
}

# Ham kiem tra ket noi nhanh toi Remote GPU Endpoint (Timeout 2s)
function Test-GpuConnectionFast([string]$baseUrl) {
    if (-not $baseUrl -or -not ($baseUrl.StartsWith("http://") -or $baseUrl.StartsWith("https://"))) {
        return $false
    }

    $clean = $baseUrl.Trim().TrimEnd('/')
    $endpoints = @(
        "$clean/health",
        "$clean/api/remote/health",
        "$clean/gradio_api/remote/health"
    )

    foreach ($ep in $endpoints) {
        try {
            $req = [System.Net.HttpWebRequest]::Create($ep)
            $req.Timeout = 1800
            $req.ReadWriteTimeout = 1800
            $req.Headers.Add("ngrok-skip-browser-warning", "1")
            $req.UserAgent = "OmniVoice-Launcher/1.0"
            $resp = $req.GetResponse()
            $status = [int]$resp.StatusCode
            $resp.Close()

            if ($status -ge 200 -and $status -lt 400) {
                return $true
            }
        } catch {}
    }

    return $false
}

Write-Host ""
Write-Host "[GPU ONLINE] Dang kiem tra ket noi GPU Online ($remoteUrl)..." -ForegroundColor Cyan

# Kiem tra ngay lap tuc xem GPU Online da chay san tu truoc chua
if (Test-GpuConnectionFast $remoteUrl) {
    Write-Host "✅ [GPU ONLINE SAN SANG] Ket noi thanh cong toi Cloud GPU: $remoteUrl" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# Neu chua ket noi: Tu dong mo Google Colab va cho trong vong 60 giay (1 phut)
Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " 🚀 [GPU ONLINE] Dang mo Google Colab tren trinh duyet..." -ForegroundColor Yellow
Write-Host " • Link GPU Online : $remoteUrl" -ForegroundColor White
Write-Host " • Link Notebook   : $colabUrl" -ForegroundColor White
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host " 👉 Vui long bam nut Play (▶️) tren Google Colab de khoi dong GPU Tesla T4." -ForegroundColor Yellow
Write-Host " ⏳ He thong se cho ket noi trong vong 60 GIAY (1 PHUT)..." -ForegroundColor White
Write-Host " (Neu sau 60s Colab chua san sang, he thong se tu dong chuyen sang GPU may de chay)" -ForegroundColor Gray
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

try {
    Start-Process $colabUrl
} catch {}

$timeoutSeconds = 60
$elapsed = 0
$checkInterval = 2
$isConnected = $false

while ($elapsed -lt $timeoutSeconds) {
    Start-Sleep -Seconds $checkInterval
    $elapsed += $checkInterval
    $remain = $timeoutSeconds - $elapsed

    Write-Host "`r⏳ Dang cho ket noi GPU Online... [Con $remain giay] " -NoNewline -ForegroundColor Yellow

    if (Test-GpuConnectionFast $remoteUrl) {
        $isConnected = $true
        break
    }
}

Write-Host ""

if ($isConnected) {
    Write-Host "🎉 [KET NOI THANH CONG] GPU Online da san sang sau $elapsed giay! ($remoteUrl)" -ForegroundColor Green
    Write-Host "⚡ Toan bo tac vu xu ly se duoc tinh toan tren Cloud GPU." -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "⚠️ [HET GIO 60S] Khong nhan duoc ket noi tu Google Colab." -ForegroundColor Yellow
    Write-Host ">> TU DONG CHUYEN SANG DUNG GPU/CPU CUC BO TREN MAY de khoi dong ung dung!" -ForegroundColor Cyan
    Write-Host ""
}

exit 0
