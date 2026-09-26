param (
    [switch]$Silent
)

$WshShell = New-Object -ComObject WScript.Shell

$desktopDir = [Environment]::GetFolderPath('Desktop')
$projectDir = (Get-Item $PSScriptRoot).Parent.FullName
$batPath = Join-Path $projectDir "start.bat"
$iconPath = Join-Path $projectDir "assets\app1.ico"
$shortcutPath = Join-Path $desktopDir "VoiceSync AI.lnk"

# Nếu chạy chế độ Silent từ start.bat và shortcut đã tồn tại thì bỏ qua ngay
if ($Silent -and (Test-Path $shortcutPath)) {
    exit 0
}

# Luôn xóa shortcut cũ để Windows không lấy cache
if (Test-Path $shortcutPath) {
    Remove-Item $shortcutPath -Force
}

# Xóa các shortcut cũ khác nếu có
$oldShortcuts = @(
    (Join-Path $desktopDir "start.bat - Shortcut.lnk"),
    (Join-Path $desktopDir "OmniVoice TTS.lnk")
)
foreach ($old in $oldShortcuts) {
    if (Test-Path $old) {
        Remove-Item $old -Force
    }
}

# Tạo shortcut mới: VoiceSync AI.lnk
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = "VoiceSync AI Studio"
$shortcut.Save()

# Kích hoạt Windows Explorer làm mới bộ đệm Icon (Icon Cache Refresh)
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinShell {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[WinShell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_ASSOCCHANGED

if (-not $Silent) {
    Write-Host "Da tao thanh cong Shortcut app tren Desktop: $shortcutPath" -ForegroundColor Green
    Write-Host "Da lam moi bo nho dem Icon cua Windows (Icon Cache Refreshed)!" -ForegroundColor Cyan
}

