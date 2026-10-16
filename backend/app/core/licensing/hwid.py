"""
backend/app/core/licensing/hwid.py
==================================
Module định danh phần cứng bất biến (Hardware Identification Engine).
Tạo mã định danh duy nhất theo thiết bị vật lý dựa trên:
1. CPU Processor ID
2. Motherboard BaseBoard Serial
3. System Disk 0 Serial

Hỗ trợ tự động fallback linh hoạt:
- Ưu tiên PowerShell CIM (chuẩn hiện đại trên Windows 10/11)
- Fallback WMIC (cho các bản Windows cũ)
- Fallback Windows Registry (BIOS, CPU, MachineGuid)
- Bộ nhớ đệm (In-memory Cache) giúp truy xuất tức thì < 0.001s
"""

import os
import re
import sys
import hashlib
import logging
import subprocess

logger = logging.getLogger("Licensing.HWID")

HWID_SALT = "OMNIVOICE_STUDIO_HWID_SALT_2026_OFFLINE_IMMUTABLE_CORE"
_CACHED_HWID: str | None = None
_CACHED_HWID_RAW: str | None = None


def _clean_str(val: str | None) -> str:
    """Làm sạch chuỗi, loại bỏ khoảng trắng và ký tự đặc biệt, chuyển chữ hoa."""
    if not val:
        return ""
    # Giữ lại các ký tự chữ và số
    cleaned = re.sub(r"[^A-Za-z0-9]", "", str(val)).strip().upper()
    # Loại trừ các giá trị rác mặc định của nhà sản xuất (VD: To be filled by O.E.M., Default string, 00000)
    invalid_defaults = {
        "TOBEFILLEDBYOEM",
        "DEFAULTSTRING",
        "NONE",
        "UNKNOWN",
        "NULL",
        "NOTAVAILABLE",
        "00000000",
        "12345678",
    }
    if cleaned in invalid_defaults:
        return ""
    return cleaned


def _get_hardware_via_powershell() -> tuple[str, str, str]:
    """Lấy thông số qua PowerShell CIM (Chuẩn Windows 10 & 11)."""
    cpu_id = ""
    mb_serial = ""
    disk_serial = ""

    ps_script = """
    $Output = @{
        cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessorId -First 1);
        mb  = (Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | Select-Object -ExpandProperty SerialNumber -First 1);
        disk = (Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | Where-Object { $_.Index -eq 0 } | Select-Object -ExpandProperty SerialNumber -First 1);
    }
    Write-Output "$($Output.cpu)|$($Output.mb)|$($Output.disk)"
    """
    try:
        startupinfo = None
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NO_WINDOW

        res = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=4,
            creationflags=creationflags,
        )
        if res.returncode == 0 and res.stdout:
            parts = res.stdout.strip().split("|")
            if len(parts) >= 3:
                cpu_id = _clean_str(parts[0])
                mb_serial = _clean_str(parts[1])
                disk_serial = _clean_str(parts[2])
    except Exception as e:
        logger.debug(f"Không thể đọc HWID qua PowerShell CIM: {e}")

    return cpu_id, mb_serial, disk_serial


def _get_hardware_via_wmic() -> tuple[str, str, str]:
    """Fallback: Lấy thông số qua WMIC (Windows 7/8/10 cũ)."""
    cpu_id = ""
    mb_serial = ""
    disk_serial = ""

    def run_cmd(cmd: str) -> str:
        try:
            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            res = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=3,
                creationflags=creationflags,
            )
            if res.returncode == 0:
                lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
                if len(lines) >= 2:
                    return lines[1]
        except Exception:
            pass
        return ""

    cpu_id = _clean_str(run_cmd("wmic cpu get processorid"))
    mb_serial = _clean_str(run_cmd("wmic baseboard get serialnumber"))
    disk_serial = _clean_str(run_cmd('wmic diskdrive where "Index=0" get serialnumber'))
    return cpu_id, mb_serial, disk_serial


def _get_hardware_via_registry() -> tuple[str, str, str]:
    """Fallback an toàn: Đọc trực tiếp từ Windows Registry mà không cần gọi sub-process."""
    cpu_id = ""
    mb_serial = ""
    disk_serial = ""

    if sys.platform != "win32":
        return cpu_id, mb_serial, disk_serial

    try:
        import winreg

        # 1. CPU Identifier
        try:
            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
            ) as k:
                val, _ = winreg.QueryValueEx(k, "Identifier")
                cpu_id = _clean_str(val)
        except Exception:
            pass

        # 2. Mainboard / BIOS Serial
        try:
            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\BIOS",
            ) as k:
                for reg_name in ["BaseBoardSerialNumber", "SystemSerialNumber", "BaseBoardProduct"]:
                    try:
                        val, _ = winreg.QueryValueEx(k, reg_name)
                        clean_v = _clean_str(val)
                        if clean_v:
                            mb_serial = clean_v
                            break
                    except Exception:
                        pass
        except Exception:
            pass

        # 3. Disk Serial hoặc MachineGuid
        try:
            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Cryptography",
            ) as k:
                val, _ = winreg.QueryValueEx(k, "MachineGuid")
                disk_serial = _clean_str(val)
        except Exception:
            pass

    except Exception as e:
        logger.debug(f"Không thể đọc registry hardware: {e}")

    return cpu_id, mb_serial, disk_serial


def get_hardware_id() -> str:
    """
    Trả về chuỗi HWID chuẩn hoá dạng: TTS-XXXX-XXXX-XXXX-XXXX
    Có cơ chế cache để chỉ tính toán 1 lần duy nhất trong toàn bộ vòng đời tiến trình.
    """
    global _CACHED_HWID, _CACHED_HWID_RAW
    if _CACHED_HWID:
        return _CACHED_HWID

    # B1: Lấy qua PowerShell CIM
    cpu, mb, disk = _get_hardware_via_powershell()

    # B2: Nếu thiếu, fallback sang WMIC
    if not (cpu and mb and disk):
        w_cpu, w_mb, w_disk = _get_hardware_via_wmic()
        cpu = cpu or w_cpu
        mb = mb or w_mb
        disk = disk or w_disk

    # B3: Nếu vẫn thiếu, fallback sang Registry
    if not (cpu and mb and disk):
        r_cpu, r_mb, r_disk = _get_hardware_via_registry()
        cpu = cpu or r_cpu
        mb = mb or r_mb
        disk = disk or r_disk

    # Fallback cuối cùng nếu máy ảo hoặc thiếu quyền tuyệt đối
    if not cpu:
        import uuid
        cpu = f"NODE{uuid.getnode()}"
    if not mb:
        mb = os.environ.get("COMPUTERNAME", "PC_DEFAULT")
    if not disk:
        disk = os.environ.get("USERNAME", "USER_DEFAULT")

    _CACHED_HWID_RAW = f"{cpu}:{mb}:{disk}:{HWID_SALT}"
    hwid_hash = hashlib.sha256(_CACHED_HWID_RAW.encode("utf-8")).hexdigest().upper()

    # Định dạng hiển thị: TTS-XXXX-XXXX-XXXX-XXXX
    formatted_hwid = f"TTS-{hwid_hash[:4]}-{hwid_hash[4:8]}-{hwid_hash[8:12]}-{hwid_hash[12:16]}"
    _CACHED_HWID = formatted_hwid

    logger.info(f"🔒 [HWID Engine] Định danh thiết bị: {_CACHED_HWID}")
    return _CACHED_HWID


def get_hwid_full_hash() -> str:
    """Trả về toàn bộ chuỗi băm SHA-256 (64 ký tự) dùng cho việc dẫn xuất khóa AES."""
    get_hardware_id()
    assert _CACHED_HWID_RAW is not None
    return hashlib.sha256(_CACHED_HWID_RAW.encode("utf-8")).hexdigest().upper()
