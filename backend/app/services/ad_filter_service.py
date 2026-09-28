"""
app/services/ad_filter_service.py
───────────────────────────────────
Dịch vụ Quét & Triệt Tiêu Phụ Đề Rác / Quảng Cáo / Watermark / Hallucination:
- Quét và loại bỏ tự động các câu quảng cáo từ Whisper (YouTube CTAs, Subtitle Credits, Spam links, Contact info).
- Tự động lọc sạch các câu cảm ơn/chào kết ảo giác do AI sinh ra trên nền nhạc.
- Tính năng Dạy AI (Custom Blocklist): Cho phép người dùng bổ sung các từ/câu tùy chỉnh cần loại bỏ vĩnh viễn.
"""

import os
import re
import json
from pathlib import Path
from typing import Any
from app.core.config import PRESETS_DIR, logger

RULES_FILE = PRESETS_DIR / "ad_filter_rules.json"

# Danh sách mẫu quảng cáo & watermark mặc định (Đa ngôn ngữ: Vi, En, Zh)
DEFAULT_AD_PATTERNS = [
    # ── 1. Kêu gọi hành động (CTA / Subscribe / Like / Share) ───────────────────
    r"(?i)\b(?:hãy|nhớ|đừng quên|xin)?\s*(?:like|thích|share|chia sẻ|đăng ký|subscribe|sub|theo dõi|follow)\s*(?:kênh|channel|trang|page|video|chúng tôi|mình|nhé|nha|ạ)?",
    r"(?i)\b(?:bấm|ấn|nhấn|click|chạm)\s*(?:vào|chuông|nút|link|biểu tượng)\s*(?:thông báo|đăng ký|bên dưới|để nhận|theo dõi)?",
    r"(?i)\b(?:please\s+)?(?:like|share|comment|subscribe|follow)\s*(?:to\s+our\s+channel|this\s+video|for\s+more)?",
    r"(?i)\b(?:don'?t\s+forget\s+to\s+)?(?:hit\s+the\s+bell|turn\s+on\s+notifications|subscribe)",
    r"(?i)\b(?:thanks\s+for\s+watching|thank\s+you\s+for\s+watching|see\s+you\s+(?:in\s+the\s+)?next\s+video)",
    r"[\u4e00-\u9fff]*(?:请|记得)?(?:点赞|关注|转发|投币|收藏|一键三连|订阅)[\u4e00-\u9fff]*",
    r"[\u4e00-\u9fff]*(?:感谢(?:您|大家)?(?:的)?(?:收看|观看)|下期再见|欢迎订阅)[\u4e00-\u9fff]*",

    # ── 2. Watermark / Bản quyền nhóm dịch / Credits ───────────────────────────
    r"(?i)\b(?:phụ đề|biên dịch|vietsub|thuyết minh|lồng tiếng|nhóm dịch|dịch bởi|thực hiện bởi|bản quyền thuộc về)\b.*",
    r"(?i)\b(?:subtitles?\s+by|translated?\s+by|captioned?\s+by|subbed?\s+by|synced?\s+by|ripped?\s+by|encoded?\s+by)\b.*",
    r"[\u4e00-\u9fff]*(?:字幕(?:制作|组)?|翻译|压制|校对|时间轴|片源)[\u4e00-\u9fff]*[:：].*",

    # ── 3. Liên kết mạng xã hội, Nhóm & Liên hệ quảng cáo ───────────────────────
    r"(?i)\b(?:https?://|www\.)[^\s]+",
    r"(?i)\b(?:t\.me|zalo\.me|fb\.com|facebook\.com|tiktok\.com|youtube\.com|cutt\.ly|bit\.ly)/[^\s]+",
    r"(?i)\b(?:liên hệ|nhận|book)\s*(?:quảng cáo|hợp tác|tài trợ|job)\s*(?:qua|hotline|zalo|tele|telegram|email|sđt)?.*",
    r"(?i)\b(?:link\s*(?:tải|download|mua|ở|dưới)|tham gia\s*nhóm|inbox\s*ngay)\s*(?:phần\s*mô\s*tả|bình\s*luận|comment|bio)?",
    r"(?i)\b(?:mọi\s*thắc\s*mắc|chi\s*tiết\s*liên\s*hệ|quét\s*mã\s*qr)\b.*",

    # ── 4. Ảo giác câu cảm ơn / kết thúc rác trên nền nhạc ─────────────────────
    r"(?i)^(?:cảm ơn|cảm ơn các bạn|cảm ơn đã theo dõi|cảm ơn đã xem|chúc các bạn xem (?:phim|video) vui vẻ)[\.\!\?\,]*$",
    r"(?i)^(?:hẹn gặp lại|tạm biệt|chúc một ngày tốt lành|bye bye|goodbye)[\.\!\?\,]*$",
    r"(?i)^(?:ừm|ờ|à|ơ|hoàn|ừ|hử|ha|nha|nhé|a|ô|ồ)[\.\!\?\,]*$",
]

COMPILED_DEFAULT_PATTERNS = [re.compile(p, re.IGNORECASE) for p in DEFAULT_AD_PATTERNS]


class AdFilterService:
    """Dịch vụ nhận diện, loại bỏ quảng cáo và quản lý danh sách từ/câu dạy cho AI bỏ qua."""

    @classmethod
    def _ensure_rules_file(cls) -> Path:
        if not RULES_FILE.exists():
            RULES_FILE.parent.mkdir(parents=True, exist_ok=True)
            # Khởi tạo danh sách từ/câu mẫu tùy chỉnh ban đầu
            initial_rules = [
                "Cảm ơn các bạn đã theo dõi",
                "Hãy like và đăng ký kênh",
                "Chúc các bạn xem phim vui vẻ",
                "Nhớ bấm chuông thông báo",
                "Phụ đề thực hiện bởi",
                "Link tải dưới phần mô tả",
                "Liên hệ quảng cáo",
            ]
            RULES_FILE.write_text(json.dumps(initial_rules, ensure_ascii=False, indent=2), encoding="utf-8")
        return RULES_FILE

    @classmethod
    def get_custom_rules(cls) -> list[str]:
        """Lấy danh sách các câu / cụm từ tùy chỉnh do người dùng dạy cho AI bỏ qua."""
        cls._ensure_rules_file()
        try:
            raw = RULES_FILE.read_text(encoding="utf-8")
            data = json.loads(raw)
            if isinstance(data, list):
                return [str(item).strip() for item in data if str(item).strip()]
            return []
        except Exception as e:
            logger.error(f"Lỗi đọc file ad_filter_rules.json: {e}")
            return []

    @classmethod
    def save_custom_rules(cls, rules: list[str]) -> bool:
        """Lưu toàn bộ danh sách câu / cụm từ tùy chỉnh vào file cấu hình."""
        cls._ensure_rules_file()
        try:
            clean_rules = []
            seen = set()
            for r in rules:
                r_str = str(r).strip()
                if r_str and r_str.lower() not in seen:
                    clean_rules.append(r_str)
                    seen.add(r_str.lower())

            RULES_FILE.write_text(json.dumps(clean_rules, ensure_ascii=False, indent=2), encoding="utf-8")
            logger.info(f"💾 Đã lưu {len(clean_rules)} quy tắc lọc quảng cáo/từ bỏ qua.")
            return True
        except Exception as e:
            logger.error(f"Lỗi khi lưu ad_filter_rules.json: {e}")
            return False

    @classmethod
    def add_custom_rule(cls, phrase: str) -> bool:
        """Dạy thêm một câu hoặc từ mới mà AI cần bỏ qua trong phụ đề."""
        p = phrase.strip()
        if not p:
            return False
        rules = cls.get_custom_rules()
        if not any(r.lower() == p.lower() for r in rules):
            rules.append(p)
            return cls.save_custom_rules(rules)
        return True

    @classmethod
    def delete_custom_rule(cls, phrase: str) -> bool:
        """Xóa một câu hoặc từ khỏi danh sách bỏ qua."""
        p = phrase.strip().lower()
        rules = cls.get_custom_rules()
        new_rules = [r for r in rules if r.lower() != p]
        return cls.save_custom_rules(new_rules)

    @classmethod
    def clean_text_ads(cls, text: str) -> str:
        """Làm sạch các đường link URL hoặc thông tin quảng cáo nằm xen kẽ bên trong câu."""
        if not text:
            return ""
        # Xóa URLs
        t = re.sub(r"(?i)\b(?:https?://|www\.)[^\s]+", "", text)
        t = re.sub(r"(?i)\b(?:t\.me|zalo\.me|fb\.com|cutt\.ly|bit\.ly)/[^\s]+", "", t)
        # Chuẩn hóa khoảng trắng
        t = re.sub(r"\s+", " ", t).strip()
        return t

    @classmethod
    def is_ad_or_spam(cls, text: str) -> tuple[bool, str | None]:
        """
        Kiểm tra xem câu phụ đề có phải là quảng cáo, watermark hoặc câu người dùng muốn bỏ qua không.
        Trả về (True, lý_do) nếu là quảng cáo, ngược lại (False, None).
        """
        if not text or not text.strip():
            return True, "Chuỗi rỗng"

        clean_t = text.strip()
        lower_t = clean_t.lower()

        # 1. Kiểm tra danh sách từ/câu tùy chỉnh do người dùng dạy (Custom Rules)
        custom_rules = cls.get_custom_rules()
        for rule in custom_rules:
            r_low = rule.lower().strip()
            if not r_low:
                continue
            # Nếu câu khớp chính xác hoặc chứa toàn bộ cụm từ cấm
            if r_low == lower_t or r_low in lower_t:
                return True, f"Khớp quy tắc tùy chỉnh: '{rule}'"

        # 2. Kiểm tra các mẫu regex quảng cáo & watermark chuẩn
        for pattern in COMPILED_DEFAULT_PATTERNS:
            if pattern.search(clean_t):
                # Nếu câu chỉ toàn là lời quảng cáo hoặc CTA
                return True, f"Khớp mẫu quảng cáo tự động"

        # 3. Kiểm tra câu quá ngắn là ký tự rác hoặc dấu câu đơn lẻ
        alpha_only = re.sub(r"[^\w\s]", "", clean_t).strip()
        if len(alpha_only) <= 1 and not clean_t.isdigit():
            return True, "Ký tự rác đơn lẻ"

        return False, None

    @classmethod
    def filter_subtitle_segments(
        cls,
        segments: list[dict[str, Any]],
        enable_ad_filter: bool = True,
    ) -> tuple[list[dict[str, Any]], int]:
        """
        Quét qua toàn bộ danh sách câu phụ đề, loại bỏ các phân đoạn quảng cáo / spam / câu bỏ qua.
        Tự động đánh lại chỉ số ID liên tục (1, 2, 3...) và trả về (danh_sách_sạch, số_câu_đã_lọc).
        """
        if not segments or not enable_ad_filter:
            return segments, 0

        clean_segments: list[dict[str, Any]] = []
        removed_count = 0

        for seg in segments:
            raw_text = str(seg.get("text", "")).strip()
            if not raw_text:
                removed_count += 1
                continue

            # Kiểm tra xem phân đoạn có phải là quảng cáo không
            is_spam, reason = cls.is_ad_or_spam(raw_text)
            if is_spam:
                logger.info(
                    f"🛡️ [Ad Filter] Đã loại bỏ phân đoạn #{seg.get('id', '?')} [{seg.get('start', 0):.2f}s -> {seg.get('end', 0):.2f}s] ({reason}): '{raw_text}'"
                )
                removed_count += 1
                continue

            # Làm sạch các link quảng cáo nhỏ lẻ trong câu nếu có
            cleaned_content = cls.clean_text_ads(raw_text)
            if not cleaned_content:
                removed_count += 1
                continue

            # Sao chép và cập nhật nội dung sạch
            seg_copy = dict(seg)
            seg_copy["text"] = cleaned_content
            seg_copy["id"] = len(clean_segments) + 1
            clean_segments.append(seg_copy)

        if removed_count > 0:
            logger.info(f"✨ [Ad Filter] Tổng kết: Đã triệt tiêu {removed_count} phân đoạn quảng cáo/rác.")

        return clean_segments, removed_count
