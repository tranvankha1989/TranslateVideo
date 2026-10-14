"""
app/services/translators/constants.py
─────────────────────────────────────
Bảng mã ngôn ngữ, danh mục hỗ trợ và regex chuẩn hóa thuật ngữ dịch thuật.
"""

import re

SUPPORTED_LANGUAGES = [
    {"code": "vi", "name": "Tiếng Việt (Vietnamese)"},
    {"code": "en", "name": "English (Tiếng Anh)"},
    {"code": "zh-cn", "name": "中文 (简体) (Trung giản thể)"},
    {"code": "zh-tw", "name": "中文 (繁體) (Trung phồn thể)"},
    {"code": "ja", "name": "日本語 (Tiếng Nhật)"},
    {"code": "ko", "name": "한국어 (Tiếng Hàn)"},
    {"code": "fr", "name": "Français (Tiếng Pháp)"},
    {"code": "de", "name": "Deutsch (Tiếng Đức)"},
    {"code": "es", "name": "Español (Tây Ban Nha)"},
    {"code": "ru", "name": "Русский (Tiếng Nga)"},
    {"code": "th", "name": "ไทย (Tiếng Thái)"},
    {"code": "id", "name": "Bahasa Indonesia"},
    {"code": "pt", "name": "Português (Bồ Đào Nha)"},
    {"code": "it", "name": "Italiano (Ý)"},
    {"code": "hi", "name": "हिन्दी (Hindi)"},
    {"code": "ar", "name": "العربية (Ả Rập)"},
]

# Chuẩn hoá mã ngôn ngữ sang chuẩn Google Translate
GOOGLE_LANG_MAP = {
    "zh": "zh-CN",
    "zh-cn": "zh-CN",
    "zh-tw": "zh-TW",
    "vi": "vi",
    "en": "en",
    "ja": "ja",
    "ko": "ko",
    "fr": "fr",
    "de": "de",
    "es": "es",
    "ru": "ru",
    "th": "th",
    "id": "id",
    "pt": "pt",
    "it": "it",
    "hi": "hi",
    "ar": "ar",
    "auto": "auto",
}

LANGUAGE_NAMES = {
    "vi": "Tiếng Việt",
    "en": "English",
    "zh": "Tiếng Trung (中文)",
    "zh-cn": "Tiếng Trung giản thể (Simplified Chinese)",
    "zh-tw": "Tiếng Trung phồn thể (Traditional Chinese)",
    "ja": "Tiếng Nhật (日本語)",
    "ko": "Tiếng Hàn (한국어)",
    "fr": "Tiếng Pháp (Français)",
    "de": "Tiếng Đức (Deutsch)",
    "es": "Tiếng Tây Ban Nha (Español)",
    "ru": "Tiếng Nga (Русский)",
    "th": "Tiếng Thái (ไทย)",
    "id": "Bahasa Indonesia",
    "pt": "Tiếng Bồ Đào Nha (Português)",
    "it": "Tiếng Ý (Italiano)",
    "hi": "Tiếng Hindi (हिन्दी)",
    "ar": "Tiếng Ả Rập (العربية)",
    "auto": "Tự động nhận diện",
}

VIETNAMESE_DIACRITICS_PATTERN = re.compile(
    r"[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]",
    re.IGNORECASE,
)

TECHNICAL_TERM_FIXES = [
    (re.compile(r"\bmáy bay phản lực video\b", re.IGNORECASE), "máy in Videojet"),
    (re.compile(r"\bvideo jet\b", re.IGNORECASE), "Videojet"),
    (re.compile(r"\bgói tetra\b", re.IGNORECASE), "hệ thống Tetra Pak"),
    (re.compile(r"\btetra pack\b", re.IGNORECASE), "Tetra Pak"),
    (re.compile(r"\bbodrate\b", re.IGNORECASE), "Baud rate"),
    (re.compile(r"\bbaudrate\b", re.IGNORECASE), "Baud rate"),
    # Chuẩn hóa tên nhân vật Hán-Việt tự nhiên
    (re.compile(r"\bcô\s+xu\b", re.IGNORECASE), "Hứa tiểu thư"),
    # Lược nhẹ từ tượng thanh rác lọt vào
    (re.compile(r"\b(bloop[\s,]*)+", re.IGNORECASE), ""),
]
