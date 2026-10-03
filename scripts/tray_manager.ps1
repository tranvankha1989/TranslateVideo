Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Đảm bảo chỉ có DUY NHẤT một tiến trình Tray Manager hoạt động trên hệ thống
$mutexName = "Global\VoiceSyncAI_TrayManager_SingleInstance"
$createdNew = $false
$script:singleInstanceMutex = $null

for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
        $script:singleInstanceMutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
        if ($createdNew) { break }
    }
    catch {}

    # Nếu mutex đang bị tiến trình cũ chưa kịp giải phóng, dọn dẹp các instance cũ
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessId -ne $PID -and $_.CommandLine -like "*tray_manager.ps1*"
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Start-Sleep -Milliseconds 400
}

if (-not $createdNew) {
    Write-Host "⚡ Đã có một tiến trình Tray Manager đang hoạt động. Chuyển sang chế độ bảo vệ..." -ForegroundColor Yellow
    # TUYỆT ĐỐI KHÔNG exit 0 ở đây vì Concurrently sẽ giết toàn bộ Backend & Frontend!
    while ($true) { Start-Sleep -Seconds 3600 }
}

$cSource = @"
using System;
using System.Runtime.InteropServices;
public class Win32Tray {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@

Add-Type -TypeDefinition $cSource -ErrorAction SilentlyContinue

$projectDir = (Get-Item $PSScriptRoot).Parent.FullName
$iconPath = Join-Path $projectDir "assets\app.ico"

# 1. Tìm Handle của cửa sổ Terminal
function Get-TerminalHWnd {
    $proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*VideoTranslate AI Launcher*' -or $_.MainWindowTitle -like '*VoiceSync AI Launcher*' -or $_.MainWindowTitle -like '*OmniVoice Launcher*' } | Select-Object -First 1
    if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
        return $proc.MainWindowHandle
    }
    
    $h = [Win32Tray]::FindWindow($null, "VideoTranslate AI Launcher")
    if ($h -eq [IntPtr]::Zero) {
        $h = [Win32Tray]::FindWindow($null, "VoiceSync AI Launcher")
    }
    if ($h -eq [IntPtr]::Zero) {
        $h = [Win32Tray]::FindWindow($null, "OmniVoice Launcher (TTS 24kHz)")
    }
    if ($h -ne [IntPtr]::Zero) {
        $root = [Win32Tray]::GetAncestor($h, 2)
        if ($root -ne [IntPtr]::Zero) { return $root }
        return $h
    }

    $wtProcs = Get-Process -Name "WindowsTerminal" -ErrorAction SilentlyContinue
    foreach ($wt in $wtProcs) {
        if ($wt.MainWindowHandle -ne [IntPtr]::Zero) {
            return $wt.MainWindowHandle
        }
    }

    $c = [Win32Tray]::GetConsoleWindow()
    if ($c -ne [IntPtr]::Zero) {
        $root = [Win32Tray]::GetAncestor($c, 2)
        if ($root -ne [IntPtr]::Zero) { return $root }
        return $c
    }

    return [IntPtr]::Zero
}

# 2. Khởi tạo System Tray Icon
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $iconPath) {
    $notifyIcon.Icon = New-Object System.Drawing.Icon($iconPath)
}
else {
    $notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
}

$notifyIcon.Text = "VideoTranslate AI (Đang khởi động...)"
$notifyIcon.Visible = $true

# Biến trạng thái ẩn/hiện
$script:isWindowHidden = $false
$script:firstHideNotificationShown = $false
$script:targetHWnd = [IntPtr]::Zero

function Restore-TerminalWindow {
    if ($script:targetHWnd -eq [IntPtr]::Zero) {
        $script:targetHWnd = Get-TerminalHWnd
    }
    if ($script:targetHWnd -ne [IntPtr]::Zero) {
        [Win32Tray]::ShowWindow($script:targetHWnd, 9) # 9 = SW_RESTORE
        [Win32Tray]::SetForegroundWindow($script:targetHWnd) | Out-Null
        $script:isWindowHidden = $false
    }
}

function Hide-TerminalWindow {
    if ($script:targetHWnd -eq [IntPtr]::Zero) {
        $script:targetHWnd = Get-TerminalHWnd
    }
    if ($script:targetHWnd -ne [IntPtr]::Zero) {
        [Win32Tray]::ShowWindow($script:targetHWnd, 0) # 0 = SW_HIDE
        $script:isWindowHidden = $true

        if (-not $script:firstHideNotificationShown) {
            $notifyIcon.BalloonTipTitle = "VideoTranslate AI"
            $notifyIcon.BalloonTipText = "Ứng dụng đang chạy ngầm. Click đúp vào biểu tượng để mở lại Terminal."
            $notifyIcon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
            $notifyIcon.ShowBalloonTip(3000)
            $script:firstHideNotificationShown = $true
        }
    }
}

$notifyIcon.add_DoubleClick({
        if ($script:isWindowHidden) {
            Restore-TerminalWindow
        }
        else {
            Hide-TerminalWindow
        }
    })

# 3. Context Menu khi chuột phải vào Tray Icon
$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
# Cài đặt font chuẩn hỗ trợ Tiếng Việt
$contextMenu.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$menuOpenWeb = $contextMenu.Items.Add("Mở Giao diện Web (Localhost:5173)")
$menuOpenWeb.add_Click({
        Start-Process "http://localhost:5173"
    })

$menuOpenLogs = $contextMenu.Items.Add("Mở Thư Mục Logs Báo Lỗi")
$menuOpenLogs.add_Click({
        $logsPath = Join-Path $projectDir "logs"
        if (-not (Test-Path $logsPath)) { New-Item -ItemType Directory -Path $logsPath -Force | Out-Null }
        Start-Process "explorer.exe" $logsPath
    })

$menuToggle = $contextMenu.Items.Add("Hiện / Ẩn Terminal")
$menuToggle.add_Click({
        if ($script:isWindowHidden) {
            Restore-TerminalWindow
        }
        else {
            Hide-TerminalWindow
        }
    })

$contextMenu.Items.Add("-") | Out-Null

function Get-LauncherProcess {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -ErrorAction SilentlyContinue
    while ($current -and $current.ParentProcessId) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($current.ParentProcessId)" -ErrorAction SilentlyContinue
        if ($parent -and ($parent.Name -match "cmd\.exe" -or $parent.CommandLine -like "*start.bat*")) {
            return $parent
        }
        $current = $parent
    }
    return (Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*start.bat*" -or ($_.Name -eq "cmd.exe" -and $_.MainWindowTitle -like "*OmniVoice Launcher*") } | Select-Object -First 1)
}

$script:ExitApplication = {
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()

    # 1. Đóng Backend và Frontend theo port (8000 & 5173 & 5174)
    $ports = @(8000, 5173, 5174)
    foreach ($port in $ports) {
        $pids = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | Select-Object -ExpandProperty OwningProcess -Unique)
        foreach ($p in $pids) {
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }

    # 2. Dừng các tiến trình thuộc dự án nhưng TUYỆT ĐỐI KHÔNG chạm vào trình duyệt
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*$projectDir*" -and 
        $_.Name -notmatch "msedge|chrome|firefox|brave|opera" -and
        $_.ProcessId -ne $PID
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

    # 3. Đóng cửa sổ Terminal của ứng dụng
    if ($script:targetHWnd -eq [IntPtr]::Zero) {
        $script:targetHWnd = Get-TerminalHWnd
    }
    if ($script:targetHWnd -ne [IntPtr]::Zero) {
        [Win32Tray]::ShowWindow($script:targetHWnd, 9) | Out-Null
        [Win32Tray]::PostMessage($script:targetHWnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    }

    # 4. Dừng tiến trình cmd.exe cha của start.bat để Terminal đóng ngay lập tức
    $launcher = Get-LauncherProcess
    if ($launcher -and $launcher.ProcessId -ne $PID) {
        Stop-Process -Id $launcher.ProcessId -Force -ErrorAction SilentlyContinue
    }

    [System.Windows.Forms.Application]::Exit()
    Stop-Process -Id $PID -Force
}

$menuExit = $contextMenu.Items.Add("Thoát hoàn toàn VideoTranslate AI")
$menuExit.add_Click({
        & $script:ExitApplication
    })


$notifyIcon.ContextMenuStrip = $contextMenu

# 4. Timer kiểm tra trạng thái (3000ms = 3 giây/lần giúp giảm tải CPU hệ thống)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000

$script:browserOpened = $false
$script:isTickRunning = $false
$script:backendDeadSeconds = 0

$timer.add_Tick({
        if ($script:isTickRunning) { return }
        $script:isTickRunning = $true
        try {
            if (-not $script:browserOpened) {
                try {
                    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2 -ErrorAction Stop
                    if ($r.status -eq 'ok') {
                        # Đánh dấu đã mở NGAY LẬP TỨC để tránh bất kỳ event timer nào gọi trùng lặp
                        $script:browserOpened = $true
                        Write-Host "VideoTranslate AI da san sang! Dang mo trinh duyet..." -ForegroundColor Green
                        Start-Process "http://localhost:5173"
                        $notifyIcon.Text = "VideoTranslate AI (Đang hoạt động)"
                        # Tự động thu nhỏ / ẩn Terminal xuống khay hệ thống để tránh bấm nhầm dấu X
                        Start-Sleep -Milliseconds 800
                        Hide-TerminalWindow
                    }
                }
                catch {}
            }

            # KHI TRÌNH DUYỆT ĐÃ MỞ: Duy trì icon System Tray và hỗ trợ ẩn/hiện Terminal
            if ($script:targetHWnd -eq [IntPtr]::Zero) {
                $script:targetHWnd = Get-TerminalHWnd
            }

            if ($script:targetHWnd -ne [IntPtr]::Zero -and -not $script:isWindowHidden) {
                if ([Win32Tray]::IsIconic($script:targetHWnd)) {
                    Hide-TerminalWindow
                }
            }
        }
        finally {
            $script:isTickRunning = $false
        }
    })

$timer.Start()

Write-Host "Tray Manager da khoi dong. Khi thu nho Terminal se tu dong an xuong khay he thong!" -ForegroundColor Cyan

try {
    [System.Windows.Forms.Application]::Run()
}
finally {
    $notifyIcon.Visible = $false
    $notifyIcon.Dispose()
}
