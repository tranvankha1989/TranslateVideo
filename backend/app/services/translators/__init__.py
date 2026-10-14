"""
app/services/translators/__init__.py
────────────────────────────────────
Package dịch thuật đa kênh (Google, OpenAI/DeepSeek, Gemini).
"""

from app.services.translators.constants import (
    SUPPORTED_LANGUAGES,
    GOOGLE_LANG_MAP,
    LANGUAGE_NAMES,
    VIETNAMESE_DIACRITICS_PATTERN,
    TECHNICAL_TERM_FIXES,
)
from app.services.translators.cleaner import (
    clean_translated_text,
    get_language_name,
    get_supported_languages,
    clean_technical_terms,
)
from app.services.translators.google_translator import GoogleTranslator
from app.services.translators.openai_translator import OpenAITranslator
from app.services.translators.gemini_translator import GoogleAIStudioTranslator
from app.services.translators.service import TranslationService

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
