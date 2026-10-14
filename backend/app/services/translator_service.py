"""
app/services/translator_service.py
───────────────────────────────────
Facade module chuyển tiếp toàn bộ chức năng dịch thuật sang app.services.translators.
Đảm bảo tính tương thích ngược 100% cho mọi file đang import từ translator_service.
"""

from app.services.translators import (
    SUPPORTED_LANGUAGES,
    GOOGLE_LANG_MAP,
    LANGUAGE_NAMES,
    VIETNAMESE_DIACRITICS_PATTERN,
    TECHNICAL_TERM_FIXES,
    clean_translated_text,
    get_language_name,
    get_supported_languages,
    clean_technical_terms,
    GoogleTranslator,
    OpenAITranslator,
    GoogleAIStudioTranslator,
    TranslationService,
)

__all__ = [
    "SUPPORTED_LANGUAGES",
    "GOOGLE_LANG_MAP",
    "LANGUAGE_NAMES",
    "VIETNAMESE_DIACRITICS_PATTERN",
    "TECHNICAL_TERM_FIXES",
    "clean_translated_text",
    "get_language_name",
    "get_supported_languages",
    "clean_technical_terms",
    "GoogleTranslator",
    "OpenAITranslator",
    "GoogleAIStudioTranslator",
    "TranslationService",
]
