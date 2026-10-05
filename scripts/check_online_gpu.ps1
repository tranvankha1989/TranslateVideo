# ==============================================================================
# check_online_gpu.ps1 — Kiem tra & Tu dong Danh thuc Hugging Face ZeroGPU / Colab
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
$hfToken = ""
$hfRepo = ""

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
            if ($k -eq "HF_TOKEN" -and $v) { $hfToken = $v.Trim() }
            if ($k -eq "HF_SPACE_REPO" -and $v) { $hfRepo = $v.Trim() }
        }
    }
}

if (-not $useRemote -or -not $remoteUrl) {
    Write-Host "[GPU] He thong khoi dong o che do GPU/CPU cuc bo (Local Mode)." -ForegroundColor Cyan
    exit 0
}

# Tu dong nhan dien HF Space Repo neu chua khai bao
if (-not $hfRepo -and ($remoteUrl -match "huggingface\.co/spaces/([^/]+)/([^/?#]+)")) {
    $hfRepo = "$($Matches[1])/$($Matches[2])"
} elseif (-not $hfRepo -and ($remoteUrl -match "https?://([^-]+)-([^.]+)\.hf\.space")) {
    $hfRepo = "$($Matches[1])/$($Matches[2])"
}

$isHfSpace = ($remoteUrl -like "*hf.space*" -or $remoteUrl -like "*huggingface.co*" -or ($hfRepo -ne ""))

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
            $req.Timeout = 2500
            $req.ReadWriteTimeout = 2500
            $req.Headers.Add("ngrok-skip-browser-warning", "1")
            $req.UserAgent = "OmniVoice-Launcher/1.0"
            if ($hfToken) {
                $req.Headers.Add("Authorization", "Bearer $hfToken")
            }
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
Write-Host "[GPU ONLINE] Dang kiem tra ket noi Cloud GPU ($remoteUrl)..." -ForegroundColor Cyan

# Kiem tra ngay lap tuc xem GPU Online da chay san tu truoc chua
if (Test-GpuConnectionFast $remoteUrl) {
    Write-Host "[OK] Ket noi thanh cong toi Cloud GPU: $remoteUrl" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# ==============================================================================
# TRUONG HOP 1: HUGGING FACE SPACES (Tu dong gui API Wake-up/Restart)
# ==============================================================================
if ($isHfSpace) {
    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host " [HUGGING FACE ZEROGPU] May chu dang ngu (Sleep). Dang tu dong danh thuc..." -ForegroundColor Yellow
    Write-Host " - Space Repo  : $hfRepo" -ForegroundColor White
    Write-Host " - URL Worker  : $remoteUrl" -ForegroundColor White
    Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Gray

    if ($hfToken -and $hfRepo) {
        try {
            $headers = @{ "Authorization" = "Bearer $hfToken" }
            $restartUrl = "https://huggingface.co/api/spaces/$hfRepo/restart"
            $null = Invoke-RestMethod -Uri $restartUrl -Method Post -Headers $headers -ErrorAction Stop
            Write-Host " >> Da gui lenh API Restart/Wake-up toi Hugging Face thanh cong!" -ForegroundColor Green
        } catch {
            Write-Host " >> [Thong bao] Gui lenh danh thuc: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    } else {
        Write-Host " >> Dang ping URL de danh thuc Space..." -ForegroundColor Gray
    }

    Write-Host " Dang cho Hugging Face Space khoi dong (Toi da 60s)..." -ForegroundColor White
    Write-Host "================================================================================" -ForegroundColor Cyan
    Write-Host ""

    $timeoutSeconds = 60
    $elapsed = 0
    $checkInterval = 3
    $isConnected = $false

    while ($elapsed -lt $timeoutSeconds) {
        Start-Sleep -Seconds $checkInterval
        $elapsed += $checkInterval
        $remain = $timeoutSeconds - $elapsed

        Write-Host "`r[DANG CHO] Space dang khoi dong... [Con $remain giay] " -NoNewline -ForegroundColor Yellow

        if (Test-GpuConnectionFast $remoteUrl) {
            $isConnected = $true
            break
        }
    }

    Write-Host ""

    if ($isConnected) {
        Write-Host "[HOAN TAT] Hugging Face ZeroGPU da san sang sau $elapsed giay!" -ForegroundColor Green
        Write-Host "[INFO] Toan bo tac vu xu ly se duoc tinh toan tren Cloud GPU A100/A10G." -ForegroundColor Green
        Write-Host ""
    } else {
        Write-Host "[TIMEOUT] Space chua san sang hoan toan sau 60s." -ForegroundColor Yellow
        Write-Host ">> He thong se tu dong fallback ve GPU/CPU local va tiep tuc thu ket noi khi Space online!" -ForegroundColor Cyan
        Write-Host ""
    }

    exit 0
}

# ==============================================================================
# TRUONG HOP 2: GOOGLE COLAB (Mo trinh duyet)
# ==============================================================================
if (-not $colabUrl) {
    $colabUrl = "https://colab.research.google.com/github/tranvankha1989/VoxCPM-TTS/blob/main/notebooks/OmniVoice_Colab_T4.ipynb"
}

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " [GPU ONLINE] Dang mo Google Colab tren trinh duyet..." -ForegroundColor Yellow
Write-Host " - Link GPU Online : $remoteUrl" -ForegroundColor White
Write-Host " - Link Notebook   : $colabUrl" -ForegroundColor White
Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host " >> Vui long bam nut Play tren Google Colab de khoi dong GPU Tesla T4." -ForegroundColor Yellow
Write-Host " >> He thong se cho ket noi trong vong 60 GIAY..." -ForegroundColor White
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

    Write-Host "`r[DANG CHO] Dang cho ket noi GPU Online... [Con $remain giay] " -NoNewline -ForegroundColor Yellow

    if (Test-GpuConnectionFast $remoteUrl) {
        $isConnected = $true
        break
    }
}

Write-Host ""

if ($isConnected) {
    Write-Host "[HOAN TAT] GPU Online da san sang sau $elapsed giay! ($remoteUrl)" -ForegroundColor Green
    Write-Host "[INFO] Toan bo tac vu xu ly se duoc tinh toan tren Cloud GPU." -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[TIMEOUT] Khong nhan duoc ket noi tu Google Colab." -ForegroundColor Yellow
    Write-Host ">> TU DONG CHUYEN SANG DUNG GPU/CPU CUC BO TREN MAY de khoi dong ung dung!" -ForegroundColor Cyan
    Write-Host ""
}

exit 0
