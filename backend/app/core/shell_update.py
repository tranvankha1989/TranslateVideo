"""
app/core/shell_update.py
────────────────────────
Cập nhật phần vỏ Electron (resources/app.asar) qua gói cập nhật trong app.

Bộ cập nhật chỉ giải nén file, mà app.asar luôn bị Electron mở trong lúc app chạy nên không thay được.
Gói cập nhật mang theo resources/app.asar.new + app.asar.new.sha256. Mỗi lần Backend khởi động, nếu thấy
2 file này thì chạy 1 tiến trình PowerShell ẩn (tách khỏi cây tiến trình Python để không bị Electron
tắt theo) chờ Electron thoát, kiểm tra SHA-256 rồi thay app.asar (bản cũ giữ ở app.asar.bak).
Lần mở app kế tiếp chạy vỏ mới. Thay không được (app mở lại quá nhanh...) thì lần khởi động sau thử lại.
"""

import base64
import os
import subprocess
import sys
from pathlib import Path

from app.core.config import logger


def _ps_quote(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _encode_ps(script: str) -> str:
    return base64.b64encode(script.encode("utf-16-le")).decode("ascii")


_scheduled = False


def schedule_shell_update(app_root: Path, wait_pid: int | None = None) -> bool:
    """Lên lịch thay resources/app.asar khi Electron (tiến trình cha) thoát. Trả về True nếu đã lên lịch."""
    global _scheduled
    if sys.platform != "win32" or _scheduled:
        return False
    try:
        res_dir = Path(app_root) / "resources"
        new_file = res_dir / "app.asar.new"
        cur_file = res_dir / "app.asar"
        sha_file = res_dir / "app.asar.new.sha256"
        bak_file = res_dir / "app.asar.bak"
        if not (new_file.is_file() and cur_file.is_file() and sha_file.is_file()):
            return False

        parts = sha_file.read_text(encoding="utf-8", errors="ignore").split()
        expected = parts[0].strip().upper() if parts else ""
        if len(expected) != 64:
            logger.warning("⚠️ [Cập nhật vỏ app] File SHA-256 của app.asar.new không hợp lệ, bỏ qua.")
            return False

        pid = int(wait_pid if wait_pid else os.getppid())
        log_file = Path(app_root) / "logs" / "shell_update.log"
        # Chờ Electron thoát hẳn -> chỉ thay khi app.asar không còn bị khóa -> sao lưu bản cũ -> chép bản mới
        # -> kiểm tra SHA-256; lỗi giữa chừng thì chép lại bản sao lưu. Không thay được thì lần khởi động sau thử lại.
        worker = f"""
$ErrorActionPreference = 'Continue'
$new = {_ps_quote(new_file)}; $cur = {_ps_quote(cur_file)}; $bak = {_ps_quote(bak_file)}
$sha = {_ps_quote(sha_file)}; $exp = {_ps_quote(expected)}; $log = {_ps_quote(log_file)}
function Write-VtLog($m) {{ try {{ Add-Content -LiteralPath $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding UTF8 }} catch {{}} }}
function Get-VtSha256($p) {{ $s = [System.IO.File]::OpenRead($p); try {{ $a = [System.Security.Cryptography.SHA256]::Create(); return [System.BitConverter]::ToString($a.ComputeHash($s)).Replace('-', '') }} finally {{ $s.Dispose() }} }}
function Test-VtAlive($id) {{ try {{ return -not [System.Diagnostics.Process]::GetProcessById($id).HasExited }} catch {{ return $false }} }}
while (Test-VtAlive {pid}) {{ Start-Sleep -Milliseconds 500 }}
Start-Sleep -Milliseconds 800
$mtx = New-Object System.Threading.Mutex($false, 'Local\\VideoTranslateAI_ShellUpdate')
try {{ [void]$mtx.WaitOne() }} catch {{}}
Write-VtLog 'App da tat, bat dau thay vo app (app.asar)'
for ($i = 0; $i -lt 60; $i++) {{
  if (-not (Test-Path -LiteralPath $new)) {{ Write-VtLog 'Khong con app.asar.new, dung'; break }}
  $h = ''
  try {{ $h = Get-VtSha256 $new }} catch {{ $h = ''; $herr = $_.Exception.Message }}
  if (-not $h) {{ Write-VtLog ('Chua doc duoc SHA-256 cua app.asar.new, thu lai: ' + $herr); Start-Sleep -Seconds 1; continue }}
  if ($h -ne $exp) {{ Write-VtLog ('Sai SHA-256, xoa app.asar.new: ' + $h); Remove-Item -LiteralPath $new, $sha -Force -ErrorAction SilentlyContinue; break }}
  try {{ $fs = [System.IO.File]::Open($cur, 'Open', 'ReadWrite', 'None'); $fs.Close() }} catch {{ Write-VtLog 'app.asar dang bi khoa, thu lai'; Start-Sleep -Seconds 1; continue }}
  $stage = 0
  try {{
    [System.IO.File]::Copy($cur, $bak, $true); $stage = 1
    [System.IO.File]::Copy($new, $cur, $true); $stage = 2
    if ((Get-VtSha256 $cur) -ne $exp) {{ throw 'SHA-256 sau khi chep khong khop' }}
    Remove-Item -LiteralPath $new, $sha -Force -ErrorAction SilentlyContinue
    Write-VtLog 'Da thay vo app moi thanh cong'
    break
  }} catch {{
    Write-VtLog ('Loi thay vo app (buoc ' + $stage + '): ' + $_.Exception.Message)
    if ($stage -ge 1) {{ try {{ [System.IO.File]::Copy($bak, $cur, $true); Write-VtLog 'Da khoi phuc vo app cu' }} catch {{ Write-VtLog ('Loi khoi phuc: ' + $_.Exception.Message) }} }}
    Start-Sleep -Seconds 1
  }}
}}
try {{ $mtx.ReleaseMutex() }} catch {{}}
"""
        # Tầng 1 khởi chạy tầng 2 rồi thoát ngay: tầng 2 không còn là con cháu của Python,
        # nên lệnh taskkill /T của Electron khi tắt app không tắt nhầm nó
        launcher = (
            "Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList "
            f"'-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','{_encode_ps(worker)}'"
        )
        # Bỏ PSModulePath kế thừa (vd của PowerShell 7) để Windows PowerShell 5.1 nạp đúng module của nó
        env = {k: v for k, v in os.environ.items() if k.upper() != "PSMODULEPATH"}
        subprocess.Popen(
            [
                "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                "-EncodedCommand", _encode_ps(launcher),
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            close_fds=True,
            env=env,
        )
        _scheduled = True
        logger.info("🧩 [Cập nhật vỏ app] Đã có vỏ app mới, sẽ tự thay khi tắt app (lần mở sau dùng vỏ mới).")
        return True
    except Exception as e:
        logger.warning(f"⚠️ [Cập nhật vỏ app] Không thể lên lịch thay vỏ app: {e}")
        return False
