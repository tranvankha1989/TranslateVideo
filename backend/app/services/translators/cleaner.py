"""
app/services/translators/cleaner.py
───────────────────────────────────
Hàm làm sạch bản dịch, xử lý markdown, dấu câu và thuật ngữ chuyên ngành.
"""

import re
from app.services.translators.constants import (
    LANGUAGE_NAMES,
    SUPPORTED_LANGUAGES,
    TECHNICAL_TERM_FIXES,
)


def clean_translated_text(text: str) -> str:
    """Loại bỏ toàn bộ mã trích dẫn / citation của AI (như [cite: 11], [1], 【...】) và markdown rác."""
    if not text:
        return ""
    # 1. Bỏ trích dẫn AI [cite: 11], [cite: 1, 2], [citation: ...]
    text = re.sub(r"\[cite:\s*[\d,\s]+\]", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\[citation:\s*[\d,\s]+\]", "", text, flags=re.IGNORECASE)
    text = re.sub(r"【\d+†source】", "", text)
    text = re.sub(r"\[\d+\]", "", text)
    # 2. Bỏ markdown in đậm/nghiêng nếu có
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    # 3. Chuẩn hóa khoảng trắng và dấu câu
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s+([,\.\?!;:])", r"\1", text)
    return text.strip()


def get_language_name(code: str) -> str:
    if not code:
        return "Tự động nhận diện"
    c = code.lower().strip()
    return LANGUAGE_NAMES.get(c, LANGUAGE_NAMES.get(c.split("-")[0], code))


def get_supported_languages() -> list[dict[str, str]]:
    return SUPPORTED_LANGUAGES


def clean_technical_terms(text: str, target_lang: str = "vi") -> str:
    if not text:
        return text
    tl = target_lang.lower().strip() if target_lang else "vi"
    if tl.startswith("vi"):
        for pattern, replacement in TECHNICAL_TERM_FIXES:
            text = pattern.sub(replacement, text)
    else:
        text = re.sub(r"\b(bloop[\s,]*)+", "", text, flags=re.IGNORECASE)
    return text.strip()
