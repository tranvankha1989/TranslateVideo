#!/usr/bin/env python3
"""
scripts/gen_key.py
────────────────────────────────────────────────────────────────────────
CÔNG CỤ TẠO MÃ KÍCH HOẠT BẢN QUYỀN (DÀNH CHO ADMIN)
Hỗ trợ tạo mã kích hoạt theo ngày cho:
  - Gói Vĩnh Viễn (Lifetime PRO - 8 chữ số)
  - Gói Có Thời Hạn (1 đến 180 ngày)

Cách dùng:
  python scripts/gen_key.py            -> Hiển thị danh sách tất cả các gói hôm nay
  python scripts/gen_key.py 30         -> Tạo mã 30 ngày hôm nay & tự copy vào Clipboard
  python scripts/gen_key.py 90         -> Tạo mã 90 ngày hôm nay
  python scripts/gen_key.py 180        -> Tạo mã 180 ngày hôm nay
  python scripts/gen_key.py pro        -> Tạo mã Vĩnh viễn (Lifetime) hôm nay
────────────────────────────────────────────────────────────────────────
"""

import sys
import time
import subprocess

# Đảm bảo in tiếng Việt và emoji mượt mà trên console Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def compute_base_key(offset_days: int = 0) -> tuple[str, str]:
    """Tính mã cơ sở 8 chữ số cho ngày theo offset."""
    t_struct = time.localtime(time.time() + (offset_days * 86400))
    date_display = time.strftime("%d/%m/%Y", t_struct)
    date_digits = time.strftime("%d%m%Y", t_struct)
    base_key = "".join(str((int(ch) % 4) + 1) for ch in date_digits if ch.isdigit())
    return date_display, base_key


def copy_to_clipboard(text: str) -> bool:
    """Sao chép chuỗi vào Clipboard trên Windows."""
    try:
        process = subprocess.Popen(["clip.exe"], stdin=subprocess.PIPE, close_fds=True)
        process.communicate(input=text.strip().encode("utf-8"))
        return True
    except Exception:
        return False


def main():
    date_today, base_today = compute_base_key(0)

    print("=" * 66)
    print(f"🔑 CÔNG CỤ TẠO KEY BẢN QUYỀN OMNIVOICE STUDIO - ADMIN TOOL")
    print(f"📅 Ngày hôm nay: {date_today}  |  Mã gốc cơ sở: {base_today}")
    print("=" * 66)

    # Nếu truyền tham số dòng lệnh
    if len(sys.argv) > 1:
        arg = sys.argv[1].strip().lower()

        if arg in ["pro", "lifetime", "vinhvien", "vv", "0"]:
            key = base_today
            copied = copy_to_clipboard(key)
            print(f"\n💎 [GÓI VĨNH VIỄN - LIFETIME PRO]")
            print(f"👉 Mã kích hoạt: {key}")
            if copied:
                print("📋 (Đã tự động sao chép mã vào Clipboard!)")
            print("=" * 66)
            return

        try:
            days = int(arg)
            if days <= 0 or days > 180:
                print(f"\n❌ LỖI: Số ngày hợp lệ phải từ 1 đến 180 ngày (Bạn nhập: {days}).")
                print("=" * 66)
                sys.exit(1)

            key = f"{base_today}{days}"
            copied = copy_to_clipboard(key)
            print(f"\n⏳ [GÓI CÓ THỜI HẠN: {days} NGÀY]")
            print(f"👉 Mã kích hoạt: {key}")
            if copied:
                print("📋 (Đã tự động sao chép mã vào Clipboard!)")
            print("=" * 66)
            return
        except ValueError:
            print(f"\n❌ LỖI: Tham số '{arg}' không hợp lệ. Vui lòng nhập số ngày (1-180) hoặc 'pro'.")
            sys.exit(1)

    # Nếu không truyền tham số, in bảng tổng hợp tất cả các gói thông dụng
    print("\n📋 DANH SÁCH MÃ KÍCH HOẠT HỢP LỆ HÔM NAY:")
    print("-" * 66)
    print(f"  {'Gói Bản Quyền':<22} | {'Mã Kích Hoạt':<18} | {'Ghi chú'}")
    print("-" * 66)

    presets = [
        ("Dùng thử 7 ngày", 7),
        ("Dùng thử 15 ngày", 15),
        ("Dùng thử 30 ngày", 30),
        ("Gói 60 ngày (2 tháng)", 60),
        ("Gói 90 ngày (Quý)", 90),
        ("Gói 180 ngày (Nửa năm)", 180),
    ]

    for name, days in presets:
        k = f"{base_today}{days}"
        print(f"  {name:<22} | {k:<18} | Hạn {days} ngày")

    print("-" * 66)
    print(f"  {'👑 VĨNH VIỄN (PRO)':<22} | {base_today:<18} | Không giới hạn")
    print(f"  {'👑 Master Key (Cố định)':<22} | {'AIMABIET':<18} | Dùng mọi lúc")
    print("-" * 66)
    print("\n💡 Mẹo: Chạy 'python scripts/gen_key.py <số ngày>' để lấy nhanh và tự copy.")
    print("   Ví dụ: python scripts/gen_key.py 30\n")
    print("=" * 66)


if __name__ == "__main__":
    main()
