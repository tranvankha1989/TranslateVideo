"""
backend/app/core/licensing/verifier.py
======================================
Module xác thực bản quyền số bằng Ed25519 (Client Verifier).
Nhúng cố định Public Key byte-array của hệ thống.
Xác thực tính toàn vẹn và hợp lệ của License Key do Admin cấp:
- Kiểm tra tính hợp lệ của chữ ký mật mã Ed25519
- So khớp HWID của máy tính hiện tại
- Kiểm tra hạn dùng (Expiry Date) hoặc vĩnh viễn (Lifetime)
"""

import json
import base64
import logging
from datetime import datetime, timezone
from typing import Tuple, Optional, Dict, Any

from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.exceptions import InvalidSignature

logger = logging.getLogger("Licensing.Verifier")

# 32 bytes Raw Public Key của hệ thống (Do tools/keygen_cli.py sinh ra)
ED25519_PUBLIC_KEY_BYTES = b"i\x9cstB\xa1|0Fx\r\xf2\xf0\x80\xf4\x15\xc2\xed\xa5\x08%s\xf6{\xab\\g\xfdD\xb8w\x01"


def _get_public_key() -> ed25519.Ed25519PublicKey:
    return ed25519.Ed25519PublicKey.from_public_bytes(ED25519_PUBLIC_KEY_BYTES)


def get_public_key_fingerprint() -> str:
    """Trả về fingerprint SHA-256 của Public Key dùng cho cơ chế Interleaving bảo vệ model."""
    import hashlib
    return hashlib.sha256(ED25519_PUBLIC_KEY_BYTES).hexdigest()


def verify_license_key(
    license_key: str,
    expected_hwid: Optional[str] = None,
) -> Tuple[bool, Optional[Dict[str, Any]], str]:
    """
    Xác thực chuỗi bản quyền Ed25519.
    Trả về: (is_valid, payload_dict, message)
    """
    if not license_key:
        return False, None, "Chuỗi mã bản quyền trống."

    clean_key = license_key.strip()
    if not clean_key.startswith("ED25519."):
        return False, None, "Định dạng mã bản quyền không đúng tiêu chuẩn (thiếu tiền tố ED25519)."

    parts = clean_key.split(".")
    if len(parts) != 3:
        return False, None, "Cấu trúc mã bản quyền bị sai lệch hoặc thiếu thành phần."

    _, b64_payload, b64_sig = parts

    def pad_b64(s: str) -> str:
        return s + "=" * (-len(s) % 4)

    try:
        payload_bytes = base64.urlsafe_b64decode(pad_b64(b64_payload))
        signature_bytes = base64.urlsafe_b64decode(pad_b64(b64_sig))
    except Exception:
        return False, None, "Mã bản quyền chứa ký tự Base64 không hợp lệ."

    # 1. Kiểm tra chữ ký số mật mã Ed25519
    pub_key = _get_public_key()
    try:
        pub_key.verify(signature_bytes, payload_bytes)
    except InvalidSignature:
        logger.warning("⚠️ Chữ ký Ed25519 của License không hợp lệ hoặc dữ liệu đã bị can thiệp!")
        return False, None, "Chữ ký số bản quyền không hợp lệ hoặc mã đã bị sửa đổi."
    except Exception as e:
        return False, None, f"Lỗi xác thực chữ ký: {e}"

    # 2. Giải mã Payload JSON
    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        return False, None, "Dữ liệu bản quyền không thể giải mã thành JSON hợp lệ."

    # 3. So khớp Hardware ID
    if expected_hwid:
        norm_expected = expected_hwid.strip().upper()
        norm_target = str(payload.get("hwid", "")).strip().upper()
        if norm_target != norm_expected:
            return (
                False,
                payload,
                f"Mã bản quyền này được cấp riêng cho thiết bị khác ({norm_target}), không khớp với máy này ({norm_expected}).",
            )

    # 4. Kiểm tra ngày hết hạn
    is_lifetime = payload.get("is_lifetime", False)
    expiry_date_str = payload.get("expiry_date", "")

    if not is_lifetime and expiry_date_str:
        try:
            exp_date = datetime.strptime(expiry_date_str, "%Y-%m-%d").date()
            today_utc = datetime.now(timezone.utc).date()
            if today_utc > exp_date:
                days_over = (today_utc - exp_date).days
                return (
                    False,
                    payload,
                    f"Mã bản quyền đã hết hạn vào ngày {expiry_date_str} (quá hạn {days_over} ngày). Vui lòng gia hạn thêm.",
                )
        except ValueError:
            return False, payload, "Định dạng ngày hết hạn trong bản quyền không hợp lệ."

    tier = payload.get("tier", "PRO")
    msg = "🎉 Bản quyền VĨNH VIỄN (PRO) hợp lệ!" if is_lifetime else f"🎉 Bản quyền hợp lệ đến ngày {expiry_date_str}!"
    return True, payload, msg
