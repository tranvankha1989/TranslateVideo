#!/usr/bin/env python3
"""
bump_version.py
Script cập nhật số phiên bản tập trung duy nhất cho VideoTranslate AI.
Nguồn gốc duy nhất (Single Source of Truth): version.json tại thư mục gốc.

Cách dùng:
    python scripts/bump_version.py 3.10.3 "Mô tả tính năng mới ở phiên bản này"
"""

import sys
import json
import re
from pathlib import Path
from datetime import datetime

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT_DIR = Path(__file__).resolve().parent.parent

def bump_version(new_version: str, description: str = ""):
    new_version = new_version.strip().lstrip("v")
    if not re.match(r"^\d+\.\d+\.\d+", new_version):
        print(f"[X] Lỗi: Định dạng phiên bản '{new_version}' không hợp lệ (Ví dụ hợp lệ: 3.10.3)")
        sys.exit(1)

    today = datetime.now().strftime("%Y-%m-%d")

    # 1. Cập nhật version.json (Single Source of Truth)
    version_json_file = ROOT_DIR / "version.json"
    v_data = {}
    if version_json_file.exists():
        try:
            with open(version_json_file, "r", encoding="utf-8") as f:
                v_data = json.load(f)
        except Exception:
            pass

    old_version = v_data.get("version", "N/A")
    v_data["version"] = new_version
    v_data["release_date"] = today
    if description:
        v_data["description"] = description
    elif not v_data.get("description"):
        v_data["description"] = f"Nâng cấp phiên bản v{new_version}"

    with open(version_json_file, "w", encoding="utf-8") as f:
        json.dump(v_data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"✅ Đã cập nhật version.json: {old_version} -> {new_version}")

    # 2. Cập nhật frontend/package.json
    pkg_json_file = ROOT_DIR / "frontend" / "package.json"
    if pkg_json_file.exists():
        try:
            with open(pkg_json_file, "r", encoding="utf-8") as f:
                pkg_data = json.load(f)
            pkg_data["version"] = new_version
            with open(pkg_json_file, "w", encoding="utf-8") as f:
                json.dump(pkg_data, f, ensure_ascii=False, indent=2)
                f.write("\n")
            print(f"✅ Đã cập nhật frontend/package.json -> {new_version}")
        except Exception as e:
            print(f"[!] Cảnh báo khi cập nhật package.json: {e}")

    # 3. Cập nhật scripts/installer.iss
    iss_file = ROOT_DIR / "scripts" / "installer.iss"
    if iss_file.exists():
        try:
            iss_text = iss_file.read_text(encoding="utf-8")
            iss_text = re.sub(r'#define\s+MyAppVersion\s+"[^"]+"', f'#define MyAppVersion "{new_version}"', iss_text)
            iss_text = re.sub(r';\s*Phien ban:\s*[\d\.]+', f'; Phien ban: {new_version}', iss_text)
            iss_file.write_text(iss_text, encoding="utf-8")
            print(f"✅ Đã cập nhật scripts/installer.iss -> {new_version}")
        except Exception as e:
            print(f"[!] Cảnh báo khi cập nhật installer.iss: {e}")

    print("\n🎉 HOÀN TẤT NÂNG CẤP PHIÊN BẢN!")
    print(f"   Toàn bộ Backend, Frontend & Bộ cài đặt hiện đã đồng bộ tự động theo version: v{new_version}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Sử dụng: python scripts/bump_version.py <new_version> [\"description\"]")
        sys.exit(1)
    new_ver = sys.argv[1]
    desc = sys.argv[2] if len(sys.argv) > 2 else ""
    bump_version(new_ver, desc)
