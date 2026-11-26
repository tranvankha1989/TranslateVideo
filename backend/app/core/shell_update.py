"""
app/core/shell_update.py
────────────────────────
Cập nhật phần vỏ Electron (resources/app.asar) qua gói cập nhật trong app.

Bộ cập nhật chỉ giải nén file, mà app.asar luôn bị Electron mở trong lúc app chạy nên không thay được.
Gói cập nhật mang theo resources/app.asar.new + app.asar.new.sha256. Mỗi lần Backend khởi động, nếu thấy
2 file này thì chạy 1 tiến trình Python ẩn (chính Python đi kèm app, tách khỏi cây tiến trình để không bị
Electron tắt theo) chờ Electron thoát, kiểm tra SHA-256 rồi thay app.asar (bản cũ giữ ở app.asar.bak).
Lần mở app kế tiếp chạy vỏ mới. Thay không được (app mở lại quá nhanh...) thì lần khởi động sau thử lại.

Trước 3.14.10 dùng PowerShell ẩn với lệnh mã hóa (-EncodedCommand): phần mềm diệt virus (Bitdefender ATD)
coi đó là dấu hiệu mã độc, nên đổi sang Python.
"""

import os
import subprocess
import sys
from pathlib import Path

from app.core.config import logger

# Tầng 2: chờ Electron thoát -> khóa liên tiến trình (mutex) -> sao lưu bản cũ -> chép bản mới -> kiểm tra SHA-256.
# Lỗi giữa chừng thì chép lại bản sao lưu. Tham số: new cur bak sha expected log pid
_WORKER = r'''
import ctypes, hashlib, os, shutil, sys, time
new, cur, bak, sha, exp, log, pid = sys.argv[1:8]
k32 = ctypes.windll.kernel32
k32.OpenProcess.restype = ctypes.c_void_p
k32.CreateMutexW.restype = ctypes.c_void_p
k32.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
k32.CloseHandle.argtypes = [ctypes.c_void_p]
k32.ReleaseMutex.argtypes = [ctypes.c_void_p]

def note(m):
    try:
        with open(log, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S") + " " + m + "\n")
    except Exception:
        pass

def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest().upper()

k32.CreateFileW.restype = ctypes.c_void_p
k32.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]

def in_use(p):
    # Mở độc quyền (không chia sẻ): thất bại = app vừa mở lại đang dùng app.asar -> chưa được chép đè
    # (Electron mở file có chia sẻ ghi nên chép đè vẫn "thành công" và làm hỏng app đang chạy)
    h = k32.CreateFileW(p, 0xC0000000, 0, None, 3, 0x80, None)  # GENERIC_READ|WRITE, share 0, OPEN_EXISTING
    if h is None or h == ctypes.c_void_p(-1).value:
        return True
    k32.CloseHandle(h)
    return False

def drop(*paths):
    for p in paths:
        try:
            os.remove(p)
        except OSError:
            pass

h = k32.OpenProcess(0x00100000, False, int(pid))  # SYNCHRONIZE: chờ tiến trình Electron thoát
if h:
    k32.WaitForSingleObject(h, 0xFFFFFFFF)
    k32.CloseHandle(h)
time.sleep(0.8)
mtx = k32.CreateMutexW(None, False, "Local\\VideoTranslateAI_ShellUpdate")
if mtx:
    k32.WaitForSingleObject(mtx, 0xFFFFFFFF)
note("App da tat, bat dau thay vo app (app.asar)")
try:
    for _ in range(60):
        if not os.path.isfile(new):
            note("Khong con app.asar.new, dung")
            break
        try:
            got = sha256(new)
        except Exception as e:
            note("Chua doc duoc SHA-256 cua app.asar.new, thu lai: %s" % e)
            time.sleep(1)
            continue
        if got != exp:
            note("Sai SHA-256, xoa app.asar.new: " + got)
            drop(new, sha)
            break
        if in_use(cur):
            note("app.asar dang bi khoa, thu lai")
            time.sleep(1)
            continue
        stage = 0
        try:
            shutil.copyfile(cur, bak)
            stage = 1
            shutil.copyfile(new, cur)
            stage = 2
            if sha256(cur) != exp:
                raise RuntimeError("SHA-256 sau khi chep khong khop")
            drop(new, sha)
            note("Da thay vo app moi thanh cong")
            break
        except Exception as e:
            note("Loi thay vo app (buoc %d): %s" % (stage, e))
            if stage >= 1:  # đang/đã chép bản mới đè lên -> chép lại bản sao lưu
                try:
                    shutil.copyfile(bak, cur)
                    note("Da khoi phuc vo app cu")
                except Exception as e2:
                    note("Loi khoi phuc: %s" % e2)
            time.sleep(1)
finally:
    if mtx:
        k32.ReleaseMutex(mtx)
        k32.CloseHandle(mtx)
'''

# Tầng 1: khởi chạy tầng 2 rồi thoát ngay -> tầng 2 không còn là con cháu của Python backend,
# nên lệnh taskkill /T của Electron khi tắt app không tắt nhầm nó.
_LAUNCHER = r'''
import subprocess, sys
f = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
try:
    subprocess.Popen(sys.argv[1:], creationflags=f | 0x01000000, close_fds=True)  # + CREATE_BREAKAWAY_FROM_JOB
except OSError:
    subprocess.Popen(sys.argv[1:], creationflags=f, close_fds=True)
'''

_scheduled = False


def _python_for_helper() -> str:
    """pythonw.exe (không cửa sổ) cạnh python đang chạy backend; không có thì dùng chính python đó."""
    exe = Path(sys.executable)
    pyw = exe.with_name("pythonw.exe")
    return str(pyw if pyw.is_file() else exe)


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
        py = _python_for_helper()
        args = [
            py, "-I", "-c", _LAUNCHER,
            py, "-I", "-c", _WORKER,
            str(new_file), str(cur_file), str(bak_file), str(sha_file), expected, str(log_file), str(pid),
        ]
        subprocess.Popen(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            close_fds=True,
        )
        _scheduled = True
        logger.info("🧩 [Cập nhật vỏ app] Đã có vỏ app mới, sẽ tự thay khi tắt app (lần mở sau dùng vỏ mới).")
        return True
    except Exception as e:
        logger.warning(f"⚠️ [Cập nhật vỏ app] Không thể lên lịch thay vỏ app: {e}")
        return False
