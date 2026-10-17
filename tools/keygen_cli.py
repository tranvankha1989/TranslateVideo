"""
tools/keygen_cli.py
===================
Công cụ quản trị nội bộ dành cho Developer / Admin:
- Khởi tạo cặp khóa bất đối xứng Ed25519
- Xuất Public Key để nhúng vào mã nguồn Client
- Cấp mã bản quyền (License Key) cho khách hàng ràng buộc theo HWID
- Kiểm tra tính hợp lệ của mã bản quyền

LƯU Ý QUAN TRỌNG:
File khóa bí mật (tools/ed25519_private.pem) chỉ lưu trên máy Developer.
Tuyệt đối KHÔNG commit file .pem này vào Git hoặc đóng gói vào bản cài đặt cho khách hàng.
"""

import os
import sys
import json
import base64
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    from cryptography.hazmat.primitives.asymmetric import ed25519
    from cryptography.hazmat.primitives import serialization
except ImportError:
    print("[ERROR] Thư viện 'cryptography' chưa được cài đặt.")
    print("Vui lòng chạy: pip install cryptography")
    sys.exit(1)

if getattr(sys, "frozen", False):
    TOOLS_DIR = Path(sys.executable).resolve().parent
else:
    TOOLS_DIR = Path(__file__).resolve().parent

PRIVATE_KEY_FILE = TOOLS_DIR / "ed25519_private.pem"
PUBLIC_KEY_FILE = TOOLS_DIR / "ed25519_public.pem"

DEFAULT_FEATURES = ["tts_unlimited", "video_dub", "voice_clone", "auto_caption"]


def ensure_keypair() -> tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey]:
    """Tải hoặc tự động tạo mới cặp khóa Ed25519."""
    if PRIVATE_KEY_FILE.exists():
        with open(PRIVATE_KEY_FILE, "rb") as f:
            private_key = serialization.load_pem_private_key(f.read(), password=None)
            if not isinstance(private_key, ed25519.Ed25519PrivateKey):
                raise ValueError("Khóa trong file không phải là Ed25519PrivateKey")
        public_key = private_key.public_key()
    else:
        print("[INFO] Đang khởi tạo cặp khóa bảo mật Ed25519 mới...")
        private_key = ed25519.Ed25519PrivateKey.generate()
        public_key = private_key.public_key()

        # Lưu Private Key
        with open(PRIVATE_KEY_FILE, "wb") as f:
            f.write(
                private_key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption(),
                )
            )

        # Lưu Public Key
        with open(PUBLIC_KEY_FILE, "wb") as f:
            f.write(
                public_key.public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo,
                )
            )
        print(f"✅ Đã tạo Private Key: {PRIVATE_KEY_FILE}")
        print(f"✅ Đã tạo Public Key: {PUBLIC_KEY_FILE}")

    return private_key, public_key


def get_public_key_raw_bytes(public_key: ed25519.Ed25519PublicKey) -> bytes:
    """Lấy 32 bytes raw của public key."""
    return public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def issue_license(
    hwid: str,
    days: int = 0,
    tier: str = "PRO",
    features: list[str] | None = None,
    client_name: str = "",
) -> str:
    """
    Ký số payload bản quyền và đóng gói thành License String Base64.
    """
    private_key, _ = ensure_keypair()

    clean_hwid = hwid.strip().upper()
    now_utc = datetime.now(timezone.utc)

    if days <= 0:
        expiry_date = "2099-12-31"
        is_lifetime = True
    else:
        exp_dt = now_utc + timedelta(days=days)
        expiry_date = exp_dt.strftime("%Y-%m-%d")
        is_lifetime = False

    payload = {
        "hwid": clean_hwid,
        "expiry_date": expiry_date,
        "tier": tier.upper(),
        "is_lifetime": is_lifetime,
        "features": features or DEFAULT_FEATURES,
        "issued_at": now_utc.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "client": client_name or "Official User",
    }

    payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    payload_bytes = payload_json.encode("utf-8")

    # Ký bằng Ed25519
    signature = private_key.sign(payload_bytes)

    # Đóng gói: ED25519.<b64_payload>.<b64_signature>
    b64_payload = base64.urlsafe_b64encode(payload_bytes).decode("ascii").rstrip("=")
    b64_sig = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")

    license_key = f"ED25519.{b64_payload}.{b64_sig}"
    return license_key


def verify_license(license_key: str, public_key: ed25519.Ed25519PublicKey | None = None) -> dict:
    """Xác thực license key và trả về payload nếu hợp lệ."""
    if public_key is None:
        _, public_key = ensure_keypair()

    clean_key = license_key.strip()
    if not clean_key.startswith("ED25519."):
        raise ValueError("Định dạng license không hợp lệ (thiếu tiền tố ED25519)")

    parts = clean_key.split(".")
    if len(parts) != 3:
        raise ValueError("Cấu trúc license sai lệch (yêu cầu 3 thành phần)")

    _, b64_payload, b64_sig = parts

    def pad_b64(s: str) -> str:
        return s + "=" * (-len(s) % 4)

    payload_bytes = base64.urlsafe_b64decode(pad_b64(b64_payload))
    signature = base64.urlsafe_b64decode(pad_b64(b64_sig))

    # Kiểm tra chữ ký với Public Key
    public_key.verify(signature, payload_bytes)

    payload = json.loads(payload_bytes.decode("utf-8"))
    return payload


def main():
    parser = argparse.ArgumentParser(description="OmniVoice Ed25519 License Keygen CLI")
    parser.add_argument("--init", action="store_true", help="Khởi tạo cặp khóa mới nếu chưa có")
    parser.add_argument("--export-public", action="store_true", help="In ra code bytes Public Key để nhúng vào verifier.py")
    parser.add_argument("--issue", action="store_true", help="Cấp license key mới")
    parser.add_argument("--hwid", type=str, help="Mã máy thiết bị (VD: TTS-XXXX-XXXX-XXXX-XXXX)")
    parser.add_argument("--days", type=int, default=0, help="Số ngày sử dụng (0 = Vĩnh viễn PRO)")
    parser.add_argument("--tier", type=str, default="PRO", help="Gói bản quyền (PRO, ENTERPRISE, TRIAL)")
    parser.add_argument("--client", type=str, default="", help="Tên hoặc ghi chú khách hàng")
    parser.add_argument("--verify", type=str, help="Kiểm tra tính hợp lệ của một License String")
    parser.add_argument("--reset-state", action="store_true", help="Reset mốc thời gian last_run và cờ cảnh báo về hiện tại (cho QA test)")

    args = parser.parse_args()

    private_key, public_key = ensure_keypair()

    if args.export_public:
        raw_bytes = get_public_key_raw_bytes(public_key)
        print("\n" + "=" * 60)
        print("PUBLIC KEY RAW BYTES (Dán vào verifier.py):")
        print("=" * 60)
        print(f"ED25519_PUBLIC_KEY_BYTES = {raw_bytes!r}")
        print("=" * 60 + "\n")
        return

    if args.issue:
        if not args.hwid:
            print("[LỖI] Cần truyền mã máy --hwid (Ví dụ: --hwid TTS-1234-5678-90AB-CDEF)")
            sys.exit(1)

        license_key = issue_license(
            hwid=args.hwid,
            days=args.days,
            tier=args.tier,
            client_name=args.client,
        )

        print("\n" + "=" * 70)
        print("🎉 ĐÃ TẠO MÃ BẢN QUYỀN THÀNH CÔNG")
        print("=" * 70)
        print(f"Mã thiết bị (HWID) : {args.hwid.upper()}")
        print(f"Loại bản quyền     : {args.tier.upper()} ({'Vĩnh viễn' if args.days <= 0 else f'{args.days} ngày'})")
        print(f"Khách hàng         : {args.client or 'N/A'}")
        print("-" * 70)
        print("MÃ KÍCH HOẠT (Copy dòng bên dưới gửi cho khách):")
        print("-" * 70)
        print(license_key)
        print("=" * 70 + "\n")
        return

    if args.verify:
        try:
            payload = verify_license(args.verify, public_key)
            print("\n" + "=" * 60)
            print("✅ LICENSE HỢP LỆ (CHỮ KÝ ĐÚNG)")
            print("=" * 60)
            print(json.dumps(payload, indent=2, ensure_ascii=False))
            print("=" * 60 + "\n")
        except Exception as e:
            print(f"\n❌ LICENSE KHÔNG HỢP LỆ: {e}\n")
            sys.exit(1)
        return

    if args.reset_state:
        import time
        # Thêm backend vào sys.path để import modules bảo mật
        backend_dir = TOOLS_DIR.parent / "backend"
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        try:
            # pyrefly: ignore[missing-import]
            from app.services.license_service import _read_local_store, _save_local_store, get_machine_id
            # pyrefly: ignore[missing-import]
            from app.core.security.persistence import load_trial_state, save_trial_state
            
            hwid = get_machine_id()
            store = _read_local_store()
            trial = load_trial_state(hwid)
            now = time.time()
            
            if store:
                store["last_run_timestamp"] = now
                _save_local_store(store)
            
            if trial:
                trial["tampered"] = False
                trial["last_run_timestamp"] = now
                save_trial_state(hwid, trial)
                
            print("\n" + "=" * 60)
            print("✨ ĐÃ RESET TRẠNG THÁI KIỂM TRA THỜI GIAN VỀ HIỆN TẠI")
            print("=" * 60)
            print(f"HWID                   : {hwid}")
            print(f"Mốc thời gian chuẩn hóa: {time.ctime(now)}")
            print("Cờ tampered            : Đã giải phóng (False)")
            print("=" * 60 + "\n")
        except Exception as e:
            print(f"[LỖI] Không thể reset trạng thái: {e}")
        return

    if args.init:
        print("✅ Hệ thống khóa Ed25519 đã sẵn sàng.")
        return

    parser.print_help()


if __name__ == "__main__":
    main()
