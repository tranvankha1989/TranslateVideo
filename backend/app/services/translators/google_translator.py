"""
app/services/translators/google_translator.py
─────────────────────────────────────────────
Xử lý dịch qua Google Translate với client dict-chrome-ex & Fallback MyMemory.
"""

import re
import asyncio
import urllib.parse
import httpx

from app.core.config import logger
from app.services.translators.constants import GOOGLE_LANG_MAP
from app.services.translators.cleaner import clean_technical_terms


class GoogleTranslator:
    """Xử lý dịch qua Google Translate với client dict-chrome-ex & Fallback MyMemory."""

    @classmethod
    async def translate_single_text(cls, text: str, source_lang: str = "auto", target_lang: str = "vi") -> str:
        if not text or not text.strip():
            return ""

        sl = GOOGLE_LANG_MAP.get(source_lang.lower(), source_lang)
        tl = GOOGLE_LANG_MAP.get(target_lang.lower(), target_lang)

        # 1. Kênh chính: Google Translate qua client=dict-chrome-ex
        url_dict = f"https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl={sl}&tl={tl}&dt=t&q={urllib.parse.quote(text)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                resp = await client.get(url_dict, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
                        translated = "".join(part[0] for part in data[0] if part and len(part) > 0 and part[0])
                        if translated.strip():
                            return translated.strip()
            except Exception as e:
                logger.warning(f"[GoogleTranslator dict-chrome-ex] Thất bại: {e}. Thử Fallback MyMemory...")

            # 2. Kênh dự phòng: MyMemory API
            try:
                src_code = "autodetect" if sl == "auto" else sl
                url_mm = f"https://api.mymemory.translated.net/get?q={urllib.parse.quote(text)}&langpair={src_code}|{tl}"
                resp2 = await client.get(url_mm)
                if resp2.status_code == 200:
                    data2 = resp2.json()
                    res_text = data2.get("responseData", {}).get("translatedText")
                    if res_text and not res_text.startswith("MYMEMORY WARNING"):
                        return res_text.strip()
            except Exception as e2:
                logger.error(f"[MyMemory Fallback] Lỗi: {e2}")

        # Trường hợp xấu nhất: trả lại text gốc kèm cảnh báo
        logger.warning(f"Không thể dịch câu: {text[:40]}... Giữ nguyên câu gốc.")
        return text

    @classmethod
    async def translate_batch_texts(
        cls, texts: list[str], source_lang: str = "auto", target_lang: str = "vi", batch_size: int = 25
    ) -> list[str]:
        """
        Dịch hàng loạt danh sách câu phụ đề bằng kỹ thuật gom nhóm delimiter.
        Giúp dịch hàng trăm câu trong 1-2 giây.
        """
        if not texts:
            return []

        results = [""] * len(texts)
        delimiter = "\n[[--SPLIT--]]\n"

        for start_idx in range(0, len(texts), batch_size):
            chunk = texts[start_idx : start_idx + batch_size]
            combined_text = delimiter.join(chunk)

            try:
                translated_combined = await cls.translate_single_text(
                    combined_text, source_lang=source_lang, target_lang=target_lang
                )
                split_parts = re.split(r"\n?\[\[--SPLIT--\]\]\n?|\s*\[\[--SPLIT--\]\]\s*", translated_combined)

                if len(split_parts) == len(chunk):
                    for i, part in enumerate(split_parts):
                        results[start_idx + i] = part.strip()
                else:
                    # Nếu delimiter bị ảnh hưởng, dịch từng câu trong chunk này
                    for i, single_text in enumerate(chunk):
                        results[start_idx + i] = await cls.translate_single_text(
                            single_text, source_lang=source_lang, target_lang=target_lang
                        )
            except Exception as e:
                logger.error(f"[GoogleTranslator] Lỗi khi dịch batch {start_idx}: {e}")
                for i, single_text in enumerate(chunk):
                    results[start_idx + i] = await cls.translate_single_text(
                        single_text, source_lang=source_lang, target_lang=target_lang
                    )

            await asyncio.sleep(0.1)

        return [clean_technical_terms(t, target_lang=target_lang) for t in results]
