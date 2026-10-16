"""
backend/app/core/security/clock_monitor.py
==========================================
Module chống lùi ngày hệ thống (Anti-Clock Rollback Engine).
Bảo vệ đa tầng chống gian lận thời gian dùng thử (Trial):
1. Monotonic Tick Counter (GetTickCount64) theo dõi uptime độc lập với đồng hồ OS.
2. Background Heartbeat Thread (120s) ghi nhận mốc thời gian tịnh tiến.
3. Cross-check File System Timestamp (C:\Windows\System32\winevt\Logs\System.evtx).
"""

import os
import sys
import time
import ctypes
import threading
import logging
from typing import Optional, Callable

logger = logging.getLogger("Security.ClockMonitor")

_IS_TAMPERED: bool = False
_TAMPER_REASON: str = ""
_MONITOR_THREAD: Optional[threading.Thread] = None
_STOP_EVENT = threading.Event()

# Khởi tạo điểm mốc khi module được nạp
_INIT_WALL_TIME = time.time()
_INIT_TICK_COUNT = 0

if sys.platform == "win32":
    try:
        _INIT_TICK_COUNT = ctypes.windll.kernel32.GetTickCount64()
    except Exception:
        _INIT_TICK_COUNT = int(time.monotonic() * 1000)
else:
    _INIT_TICK_COUNT = int(time.monotonic() * 1000)


def get_system_uptime_ms() -> int:
    """Trả về số mili-giây uptime của máy tính (Monotonic, không bị ảnh hưởng bởi đổi giờ OS)."""
    if sys.platform == "win32":
        try:
            return ctypes.windll.kernel32.GetTickCount64()
        except Exception:
            pass
    return int(time.monotonic() * 1000)


def check_monotonic_drift() -> bool:
    """
    Kiểm tra xem đồng hồ hệ thống có bị lùi trong lúc tiến trình đang chạy hay không.
    Trả về True nếu bị can thiệp (Tampered).
    """
    global _IS_TAMPERED, _TAMPER_REASON
    if _IS_TAMPERED:
        return True

    now_wall = time.time()
    now_tick = get_system_uptime_ms()

    # Tính độ chênh lệch thời gian từ lúc mở app
    elapsed_wall = now_wall - _INIT_WALL_TIME
    elapsed_tick = (now_tick - _INIT_TICK_COUNT) / 1000.0

    # Nếu thời gian hệ thống đi lùi quá 30 giây trong khi tick count vẫn tăng
    if elapsed_wall < -30 or (elapsed_tick > 60 and elapsed_wall < (elapsed_tick - 180)):
        _IS_TAMPERED = True
        _TAMPER_REASON = f"Phát hiện điều chỉnh lùi giờ hệ thống khi ứng dụng đang chạy (Wall={elapsed_wall:.1f}s, Tick={elapsed_tick:.1f}s)."
        logger.warning(f"🚨 [Anti-Tamper] {_TAMPER_REASON}")
        return True

    return False


def check_filesystem_timestamps() -> bool:
    """
    Kiểm tra chéo thời gian sửa đổi gần nhất của các file nhật ký Windows.
    Nếu giờ hiện tại nhỏ hơn thời gian sửa đổi của System.evtx quá 300s -> Phát hiện chỉnh lùi giờ trước khi mở máy.
    """
    global _IS_TAMPERED, _TAMPER_REASON
    if _IS_TAMPERED:
        return True

    now = time.time()
    system_log_candidates = [
        r"C:\Windows\System32\winevt\Logs\System.evtx",
        r"C:\Windows\System32\winevt\Logs\Application.evtx",
        r"C:\Windows\System32\config\SOFTWARE",
    ]

    for log_path in system_log_candidates:
        if os.path.exists(log_path):
            try:
                mtime = os.path.getmtime(log_path)
                # Nếu thời gian hệ thống nhỏ hơn mtime của file nhật ký Windows quá 300 giây (5 phút)
                if now < (mtime - 300):
                    diff_hours = (mtime - now) / 3600.0
                    _IS_TAMPERED = True
                    _TAMPER_REASON = (
                        f"Phát hiện đồng hồ hệ thống bị lùi {diff_hours:.1f} giờ so với thời điểm ghi nhận "
                        f"của file hệ thống Windows ({os.path.basename(log_path)})."
                    )
                    logger.warning(f"🚨 [Anti-Tamper] {_TAMPER_REASON}")
                    return True
            except Exception as e:
                logger.debug(f"Không thể đọc mtime {log_path}: {e}")

    return False


def verify_against_last_run(last_run_timestamp: float) -> bool:
    """
    Kiểm tra thời gian hiện tại với mốc chạy gần nhất được lưu trong hệ thống.
    Nếu now < last_run - 180s -> Đánh dấu gian lận.
    """
    global _IS_TAMPERED, _TAMPER_REASON
    if _IS_TAMPERED:
        return True

    if last_run_timestamp <= 0:
        return False

    now = time.time()
    if now < (last_run_timestamp - 180):
        diff_hours = (last_run_timestamp - now) / 3600.0
        _IS_TAMPERED = True
        _TAMPER_REASON = f"Phát hiện đồng hồ hệ thống bị lùi {diff_hours:.1f} giờ so với mốc phiên chạy trước đó."
        logger.warning(f"🚨 [Anti-Tamper] {_TAMPER_REASON}")
        return True

    return False


def is_clock_tampered() -> bool:
    """Kiểm tra tổng hợp trạng thái an toàn thời gian."""
    if _IS_TAMPERED:
        return True
    if check_monotonic_drift():
        return True
    if check_filesystem_timestamps():
        return True
    return False


def get_tamper_reason() -> str:
    """Trả về thông điệp chi tiết lý do bị đánh dấu gian lận giờ."""
    return _TAMPER_REASON or "Phát hiện thời gian hệ điều hành không hợp lệ. Vui lòng đồng bộ lại ngày giờ internet."


def start_heartbeat_monitor(
    read_last_run_func: Callable[[], float],
    update_last_run_func: Callable[[float], None],
    interval_seconds: int = 120,
) -> None:
    """
    Khởi động luồng Heartbeat Monitor chạy ngầm.
    Mỗi interval_seconds (120s):
    - Kiểm tra lùi ngày giờ
    - Ghi đè last_run_timestamp mới nhất
    """
    global _MONITOR_THREAD, _STOP_EVENT
    if _MONITOR_THREAD and _MONITOR_THREAD.is_alive():
        return

    _STOP_EVENT.clear()

    def _worker():
        logger.info(f"🛡️ [Clock Monitor] Heartbeat Thread đã khởi động (chu kỳ {interval_seconds}s).")
        while not _STOP_EVENT.wait(interval_seconds):
            try:
                # 1. Kiểm tra lùi giờ
                if is_clock_tampered():
                    break

                last_run = read_last_run_func()
                if verify_against_last_run(last_run):
                    break

                # 2. Cập nhật mốc mới
                update_last_run_func(time.time())
            except Exception as e:
                logger.debug(f"Lỗi trong Heartbeat Monitor worker: {e}")

    _MONITOR_THREAD = threading.Thread(target=_worker, daemon=True, name="AntiClockRollbackWorker")
    _MONITOR_THREAD.start()


def stop_heartbeat_monitor() -> None:
    """Dừng luồng Heartbeat Monitor."""
    global _STOP_EVENT
    _STOP_EVENT.set()
