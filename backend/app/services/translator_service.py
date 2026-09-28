"""
app/services/translator_service.py
───────────────────────────────────
Dịch vụ dịch thuật đa kênh tối ưu cho phụ đề video:
- Google Translate (client=dict-chrome-ex) siêu tốc, không cần key.
- MyMemory API (kênh dự phòng miễn phí).
- OpenAI-compatible LLM (ChatGPT, DeepSeek, Gemini, Ollama...) cho dịch ngữ cảnh cao.
"""

import os
import re
import json
import asyncio
import urllib.parse
from typing import Any
import httpx

from app.core.config import logger
from app.services.translation_memory_service import TranslationMemoryService

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


def get_language_name(code: str) -> str:
    if not code:
        return "Tự động nhận diện"
    c = code.lower().strip()
    return LANGUAGE_NAMES.get(c, LANGUAGE_NAMES.get(c.split("-")[0], code))


VIETNAMESE_DIACRITICS_PATTERN = re.compile(
    r"[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]",
    re.IGNORECASE,
)


def get_supported_languages() -> list[dict[str, str]]:
    return SUPPORTED_LANGUAGES


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


class OpenAITranslator:
    """Dịch phụ đề video bằng LLM (DeepSeek, ChatGPT, Gemini, Ollama...) giữ chuẩn ngữ cảnh."""

    @classmethod
    async def translate_batch_texts(
        cls,
        texts: list[str],
        source_lang: str,
        target_lang: str,
        api_key: str,
        base_url: str | None = None,
        model: str | None = None,
    ) -> list[str]:
        if not texts:
            return []

        endpoint = (base_url or "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
        model_name = model or "gpt-4o-mini"

        # Lấy bài học kinh nghiệm từ bộ nhớ dịch thuật
        relevant_mems = TranslationMemoryService.get_relevant_memories(
            source_texts=texts,
            source_lang=source_lang,
            target_lang=target_lang,
            limit=8,
        )
        memory_instruction = TranslationMemoryService.format_prompt_memory_section(relevant_mems)

        tgt_code = target_lang.lower().strip() if target_lang else "vi"
        src_code = source_lang.lower().strip() if source_lang else "auto"
        tgt_name = get_language_name(tgt_code)
        src_name = get_language_name(src_code)

        if tgt_code.startswith("vi"):
            system_prompt = (
                f"Bạn là một chuyên gia biên dịch kịch bản phim và xử lý phụ đề chuyên nghiệp ({src_name} -> Tiếng Việt).\n"
                f"Dịch từng phân đoạn thoại sang Tiếng Việt chuẩn kịch bản lồng tiếng TTS.\n\n"
                f"CÁC NGUYÊN TẮC BẮT BUỘC (MỀM DẺO & CHUẨN NGỮ CẢNH):\n"
                f"1. SỬA LỖI ĐỒNG ÂM ASR: Tự suy luận và ngầm sửa các từ đồng âm/gần âm nghe nhầm theo ngữ cảnh. Dịch bản đã hiểu đúng sang Tiếng Việt.\n"
                f"2. KHÔNG DỊCH THÔ (WORD-BY-WORD): Thoát ý theo ngữ cảnh khẩu ngữ phim ảnh. Điều chỉnh đại từ nhân xưng (anh, em, cô, chú...) tự nhiên.\n"
                f"3. XỬ LÝ NHẠC NỀN & TỪ ĐỆM (NHẸ NHÀNG): Nếu phân đoạn chỉ toàn tiếng nhạc đệm vô nghĩa (như 'bloop bloop'), hãy lược bỏ từ rác; nhưng nếu là câu thoại của nhân vật thì LUÔN DỊCH ĐẦY ĐỦ, tự nhiên theo ngữ cảnh.\n"
                f"4. THOẠI ĐÈ & CẮT CÂU: Gom nghĩa cả cụm câu trước khi dịch, dùng dấu gạch ngang (-) nếu 2 người nói chen nhau.\n"
                f"5. GIỚI HẠN ĐỘ DÀI: Tiếng Việt ngắn gọn, súc tích; vừa nhịp đọc TTS (~3.5 từ/giây) để đọc vừa khung thời lượng.\n"
                f"6. NHỊP ĐIỆU TTS: Câu ngắn (<1.5s) dùng từ đơn gọn gàng; câu dài ít chữ dùng từ kéo dài, trợ từ ngữ khí tự nhiên.\n"
                f"{memory_instruction}\n"
                f"7. ĐỊNH DẠNG: Giữ nguyên 100% số lượng dòng và ID. Toàn bộ trường 'text' là Tiếng Việt chuẩn. CHỈ TRẢ VỀ JSON array: [{{\"id\": 1, \"text\": \"bản dịch tiếng Việt\"}}]."
            )
        elif tgt_code.startswith("en"):
            system_prompt = (
                f"You are an expert film/video subtitle translator and dubbing scriptwriter ({src_name} -> English).\n"
                f"Translate each dialogue segment into NATURAL SPOKEN ENGLISH for TTS voiceover and subtitles.\n\n"
                f"MANDATORY RULES:\n"
                f"1. STRICT TARGET LANGUAGE: The 'text' field of EVERY segment MUST BE IN ENGLISH. Do NOT output Vietnamese or the original language.\n"
                f"2. NATURAL SPOKEN DIALOGUE: Use natural English contractions (don't, I'm, let's, can't, won't) and conversational phrasing. Translate Vietnamese pronouns (anh, em, chị, cô...) to appropriate English pronouns (I, you, he, she...) according to context.\n"
                f"3. TIMING & SPEED: Keep lines concise so they can be spoken at ~2.5-3.5 words/second to fit the subtitle timing.\n"
                f"4. NOISE: Filter out meaningless background sound effects.\n"
                f"{memory_instruction}\n"
                f"5. FORMAT: Preserve 100% of IDs. ONLY return a valid JSON array: [{{\"id\": 1, \"text\": \"English translation\"}}]."
            )
        else:
            system_prompt = (
                f"You are a professional subtitle translator ({src_name} -> {tgt_name}).\n"
                f"Translate each dialogue segment into natural {tgt_name} ({target_lang}) for voiceover dubbing and subtitles.\n\n"
                f"MANDATORY RULES:\n"
                f"1. The 'text' field MUST be in {tgt_name} ({target_lang}).\n"
                f"2. Natural conversational dialogue fitting the subtitle timing.\n"
                f"{memory_instruction}\n"
                f"3. Preserve 100% of IDs. ONLY return a valid JSON array: [{{\"id\": 1, \"text\": \"translation in {tgt_name}\"}}]."
            )

        input_payload = [{"id": i + 1, "text": t} for i, t in enumerate(texts)]
        user_prompt = json.dumps(input_payload, ensure_ascii=False)

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(endpoint, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()

            try:
                json_match = re.search(r"(\[.*\]|\{.*\})", content, re.DOTALL)
                parsed = json.loads(json_match.group(1)) if json_match else json.loads(content)
                items = parsed if isinstance(parsed, list) else parsed.get("translations", parsed.get("subtitles", []))

                id_to_text = {item.get("id"): item.get("text", "") for item in items if isinstance(item, dict)}
                out = []
                for i in range(len(texts)):
                    trans_text = id_to_text.get(i + 1, "").strip()
                    # Kiểm tra an toàn: nếu đích là tiếng Anh mà còn dấu tiếng Việt thì fallback Google
                    if tgt_code.startswith("en") and VIETNAMESE_DIACRITICS_PATTERN.search(trans_text):
                        logger.warning(f"[OpenAITranslator] ID {i+1} còn tiếng Việt khi đích là tiếng Anh: '{trans_text}'. Fallback Google...")
                        fallback = await GoogleTranslator.translate_single_text(texts[i], source_lang=source_lang, target_lang=target_lang)
                        out.append(clean_technical_terms(fallback, target_lang=target_lang))
                    elif not trans_text:
                        fallback = await GoogleTranslator.translate_single_text(texts[i], source_lang=source_lang, target_lang=target_lang)
                        out.append(clean_technical_terms(fallback, target_lang=target_lang))
                    else:
                        out.append(clean_technical_terms(trans_text, target_lang=target_lang))
                return out
            except Exception as e:
                logger.error(f"[OpenAITranslator] Lỗi parse kết quả JSON LLM: {e}. Fallback sang Google...")
                return await GoogleTranslator.translate_batch_texts(texts, source_lang, target_lang)


class GoogleAIStudioTranslator:
    """
    Dịch phụ đề video bằng Google AI Studio (Gemini API: gemini-1.5-flash, gemini-2.0-flash).
    Tốc độ cực nhanh, ngữ cảnh tự nhiên, cấu trúc JSON chính xác cho phụ đề video.
    """

    @classmethod
    async def verify_api_key(cls, api_key: str) -> dict[str, Any]:
        """Kiểm tra kết nối, tính hợp lệ và hạn mức chi tiết của API Key Google AI Studio."""
        if not api_key or not api_key.strip():
            return {"valid": False, "message": "API Key không được để trống."}

        key = api_key.strip()

        # Bước 1: Kiểm tra kết nối mạng và tính hợp lệ của Key qua GET /models
        get_endpoint = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
        available_models: list[str] = []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                get_resp = await client.get(get_endpoint)
                if get_resp.status_code == 200:
                    models_data = get_resp.json().get("models", [])
                    available_models = [
                        m["name"].replace("models/", "")
                        for m in models_data
                        if "generateContent" in m.get("supportedGenerationMethods", [])
                    ]
                elif get_resp.status_code in [400, 401]:
                    err_msg = get_resp.json().get("error", {}).get("message", "Mã API Key không đúng.")
                    return {
                        "valid": False,
                        "message": f"❌ API Key không hợp lệ: {err_msg}. Vui lòng kiểm tra lại mã đã dán.",
                    }
                elif get_resp.status_code == 403:
                    return {
                        "valid": False,
                        "message": "❌ Lỗi 403: API Key bị cấm truy cập hoặc dự án Google Cloud chưa kích hoạt Generative Language API.",
                    }
                elif get_resp.status_code == 429:
                    return {
                        "valid": False,
                        "message": "⚠️ API KEY ĐÃ HẾT HẠN MỨC (Lỗi 429 Quota Exceeded): Tài khoản này đã dùng hết lượt gọi miễn phí hôm nay. Vui lòng tạo Key mới từ Gmail khác hoặc dùng 'Google Dịch (Miễn phí)'.",
                    }
        except httpx.TimeoutException:
            return {"valid": False, "message": "❌ Không thể kết nối đến Google AI Studio (Timeout). Vui lòng kiểm tra lại mạng Internet."}
        except Exception as e:
            return {"valid": False, "message": f"❌ Lỗi kết nối mạng đến Google AI Studio: {str(e)}"}

        # Bước 2: Test từng model chính thức và đo lường hạn mức
        standard_models = [
            {
                "id": "gemini-3.8-flash",
                "name": "Gemini 3.8 Flash (Thế hệ mới nhất)",
                "rpd": "1.500 lượt/ngày",
                "rpm": "15 lượt/phút",
                "tpm": "1.000.000 tokens/phút",
            },
            {
                "id": "gemini-3.7-flash",
                "name": "Gemini 3.7 Flash",
                "rpd": "1.500 lượt/ngày",
                "rpm": "15 lượt/phút",
                "tpm": "1.000.000 tokens/phút",
            },
            {
                "id": "gemini-3.1-pro-preview",
                "name": "Gemini 3.1 Pro (Bản Pro thông minh)",
                "rpd": "50 lượt/ngày",
                "rpm": "2 lượt/phút",
                "tpm": "32.000 tokens/phút",
            },
            {
                "id": "gemma-4-26b-a4b-it",
                "name": "Gemma 4 26B (Google AI Mở rộng)",
                "rpd": "1.500 lượt/ngày",
                "rpm": "30 lượt/phút",
                "tpm": "1.000.000 tokens/phút",
            },
        ]

        models_quota_info = []
        is_any_model_working = False
        tested_working_model = None

        for m_info in standard_models:
            m_id = m_info["id"]
            post_endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{m_id}:generateContent?key={key}"
            payload = {
                "contents": [{"parts": [{"text": "Hi"}]}],
                "generationConfig": {"maxOutputTokens": 3},
            }
            m_status = "unknown"
            m_status_text = ""

            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.post(post_endpoint, json=payload)
                    if resp.status_code == 200:
                        m_status = "ready"
                        m_status_text = "✅ Sẵn sàng hoạt động (Còn hạn mức)"
                        is_any_model_working = True
                        if not tested_working_model:
                            tested_working_model = m_id
                    elif resp.status_code == 429:
                        m_status = "quota_exceeded"
                        m_status_text = "⚠️ Hết hạn mức / Đang nghẽn (429 Quota Exceeded)"
                    elif resp.status_code == 404:
                        m_status = "not_available"
                        m_status_text = "Chưa mở trên vùng của bạn"
                    else:
                        m_status = "error"
                        m_status_text = f"HTTP {resp.status_code}"
            except Exception as e:
                m_status = "error"
                m_status_text = "Timeout kết nối"

            models_quota_info.append({
                **m_info,
                "status": m_status,
                "status_text": m_status_text,
            })

        if is_any_model_working:
            return {
                "valid": True,
                "model": tested_working_model,
                "message": f"✅ Kết nối Google AI Studio thành công! Đã kiểm tra hạn ngạch các mô hình.",
                "quota_details": models_quota_info,
            }
        else:
            return {
                "valid": False,
                "message": "⚠️ API KEY HỢP LỆ NHƯNG TẤT CẢ MÔ HÌNH ĐÃ HẾT HẠN MỨC TRONG NGÀY (429 Quota Exceeded). Vui lòng tạo Key mới từ Gmail khác.",
                "quota_details": models_quota_info,
            }

    @classmethod
    async def translate_batch_texts(
        cls,
        texts: list[str],
        source_lang: str,
        target_lang: str,
        api_key: str,
        model: str | None = None,
        temperature: float = 0.2,
        batch_size: int = 40,
        durations: list[float] | None = None,
        style: str = "auto",
        progress_callback: Any | None = None,
    ) -> tuple[list[str], list[str]]:
        if not texts:
            return [], []

        # Danh sách mô hình ưu tiên, đưa model người dùng chọn lên đầu tiên
        candidate_models = []
        if model and model.strip():
            candidate_models.append(model.strip())
        for m in [
            "gemini-3.8-flash",
            "gemini-3.7-flash",
            "gemini-flash-latest",
            "gemini-3.1-pro-preview",
            "gemini-3.5-flash",
            "gemma-4-26b-a4b-it",
            "gemma-4-31b-it",
        ]:
            if m not in candidate_models:
                candidate_models.append(m)

        tgt_code = target_lang.lower().strip() if target_lang else "vi"
        src_code = source_lang.lower().strip() if source_lang else "auto"
        tgt_name = get_language_name(tgt_code)
        src_name = get_language_name(src_code)

        style_instruction = ""
        if tgt_code.startswith("vi"):
            if style == "romance":
                style_instruction = "\n* ĐẶC BIỆT YÊU CẦU THỂ LOẠI NGÔN TÌNH / ĐÔ THỊ: Xưng hô nam nữ yêu nhau: 'Anh' - 'Em', lời thoại ngọt ngào, hờn dỗi hoặc trầm lắng theo mạch cảm xúc."
            elif style == "school":
                style_instruction = "\n* ĐẶC BIỆT YÊU CẦU THỂ LOẠI THANH XUÂN / HỌC ĐƯỜNG: Xưng hô học sinh, bạn bè: 'Cậu' - 'Tớ', 'Mày' - 'Tao' (nếu bạn bè thân trêu đùa), 'Thầy'/'Cô' - 'Em'."
            elif style == "wuxia":
                style_instruction = "\n* ĐẶC BIỆT YÊU CẦU THỂ LOẠI KIẾM HIỆP / CỔ TRANG / TIÊN HIỆP: Xưng hô chuẩn phong vị kiếm hiệp: 'Tại hạ', 'Các hạ', 'Huynh' - 'Đệ', 'Sư phụ' - 'Đồ nhi', 'Bổn tọa', 'Cô nương'."
            elif style == "workplace":
                style_instruction = "\n* ĐẶC BIỆT YÊU CẦU THỂ LOẠI CÔNG SỞ / TỔNG TÀI: Xưng hô cấp trên - cấp dưới: 'Sếp' - 'Tôi/Em ạ', 'Tôi' - 'Cô/Cậu', lịch thiệp và dứt khoát."
            elif style == "family":
                style_instruction = "\n* ĐẶC BIỆT YÊU CẦU THỂ LOẠI GIA ĐÌNH / ĐỜI SỐNG: Xưng hô người thân: 'Bố/Mẹ' - 'Con', 'Vợ' - 'Chồng', 'Ông/Bà' - 'Cháu'."
            elif style == "narration":
                style_instruction = "\n* ĐẶC BIỆT YÊU CẦU THỂ LOẠI KỂ CHUYỆN / REVIEW / TIN TỨC: Xưng hô tự nhiên với người xem: 'Mình' - 'Các bạn', 'Tôi' - 'Quý vị'."
        elif tgt_code.startswith("en"):
            if style == "romance":
                style_instruction = "\n* GENRE: ROMANCE / DRAMA: Warm, romantic, emotional dialogue. Use affectionate and natural phrasing between lovers."
            elif style == "school":
                style_instruction = "\n* GENRE: YOUTH / CAMPUS: Casual dialogue between young students/friends, natural banter and modern expressions."
            elif style == "wuxia":
                style_instruction = "\n* GENRE: MARTIAL ARTS / HISTORICAL: Period-appropriate, dignified dialogue (e.g. Master, Disciple, Sir, Lady)."
            elif style == "workplace":
                style_instruction = "\n* GENRE: WORKPLACE / DRAMA: Professional, crisp, respectful workplace dialogue."
            elif style == "family":
                style_instruction = "\n* GENRE: FAMILY / DOMESTIC: Warm, conversational, natural family conversations."
            elif style == "narration":
                style_instruction = "\n* GENRE: NARRATION / DOCUMENTARY: Engaging, articulate tone for audience narration."

        results = list(texts)
        speakers = [""] * len(texts)

        for start_idx in range(0, len(texts), batch_size):
            chunk = texts[start_idx : start_idx + batch_size]
            chunk_durs = durations[start_idx : start_idx + batch_size] if durations else None

            if progress_callback:
                try:
                    cur_count = start_idx + 1
                    total_count = len(texts)
                    msg = f"Đang gửi AI dịch batch câu {cur_count}-{min(start_idx + len(chunk), total_count)}/{total_count}..."
                    if asyncio.iscoroutinefunction(progress_callback):
                        await progress_callback(cur_count, total_count, msg)
                    else:
                        progress_callback(cur_count, total_count, msg)
                except Exception:
                    pass

            input_items = []
            for i, t in enumerate(chunk):
                item = {"id": i + 1, "text": t}
                if chunk_durs and i < len(chunk_durs):
                    item["duration_sec"] = round(chunk_durs[i], 1)
                input_items.append(item)

            # Lấy các bài học kinh nghiệm liên quan từ bộ nhớ dịch thuật người dùng đã dạy
            relevant_mems = TranslationMemoryService.get_relevant_memories(
                source_texts=chunk,
                source_lang=source_lang,
                target_lang=target_lang,
                limit=8,
            )
            memory_section = TranslationMemoryService.format_prompt_memory_section(relevant_mems)

            if tgt_code.startswith("vi"):
                prompt = (
                    f"Bạn là một chuyên gia biên dịch kịch bản phim và xử lý phụ đề chuyên nghiệp ({src_name} -> Tiếng Việt).\n"
                    f"Nhiệm vụ của bạn là nhận các phân đoạn thoại phụ đề từ '{src_name}' sang Tiếng Việt chuẩn kịch bản lồng tiếng.\n\n"
                    f"HÃY THỰC HIỆN THEO CÁC NGUYÊN TẮC QUY TRÌNH NÀY CHỦ ĐỘNG CHO MỌI VIDEO:\n\n"
                    f"1. TỰ ĐỘNG PHÁT HIỆN VÀ NGẦM SỬA LỖI CHÍNH TẢ / ĐỒNG ÂM ASR TRƯỚC KHI DỊCH:\n"
                    f"   - Phụ đề đầu vào do công cụ nhận dạng âm thanh (ASR) tạo ra nên có thể chứa từ đồng âm/gần âm bị sai chữ.\n"
                    f"   - Nhiệm vụ: Đọc toàn bộ ngữ cảnh mạch chuyện, tự suy luận và NGẦM SỬA CHÍNH TẢ / ĐỒNG ÂM trước khi dịch.\n"
                    f"   - Dịch bản đã hiểu đúng sang tiếng Việt chuẩn kịch bản.\n"
                    f"   - Khôi phục tên riêng (nếu bị biến dạng), chuyển khẩu ngữ/từ lóng về đúng ngữ cảnh.\n\n"
                    f"2. BIÊN DỊCH VIÊN PHIM ẢNH - KHÔNG DỊCH THÔ (WORD-BY-WORD):\n"
                    f"   - Tuyệt đối KHÔNG dịch thô (word-by-word). Hãy đóng vai một biên dịch viên phim ảnh chuyên nghiệp, dịch thoát ý, giàu cảm xúc và tự nhiên.\n"
                    f"   - Hiểu đúng khẩu ngữ, tiếng lóng mạng và phim ảnh.\n"
                    f"   - Chủ động điều chỉnh đại từ nhân xưng (anh, em, cô, chú, bác, sếp, giám đốc, mẹ, con...) cho mượt mà, tự nhiên và đúng văn phong giao tiếp của người Việt.\n"
                    f"   - Nhất quán xưng hô của từng cặp nhân vật từ đầu đến cuối toàn bộ file.\n"
                    f"   - Tên riêng và danh xưng nhân vật: Tự động chuyển đổi sang phiên âm Hán-Việt tự nhiên nếu là phim Trung, hoặc giữ tên chuẩn xuôi tai. Ghi vai/người nói suy luận được vào trường 'speaker'.{style_instruction}\n\n"
                    f"3. XỬ LÝ LỜI BÀI HÁT / NHẠC NỀN & TỪ ĐỆM (TỰ ĐỘNG PHÂN BIỆT THOẠI VÀ LYRIC):\n"
                    f"   - Phân biệt rõ giữa LỜI THOẠI CỦA NHÂN VẬT (Dialogue) và LỜI BÀI HÁT / CA TỪ DO CA SĨ HÁT NHẠC NỀN (Song Lyrics / Background Singing).\n"
                    f"   - NẾU LÀ LỜI BÀI HÁT / CA TỪ NHẠC NỀN (không phải lời đối thoại của nhân vật trong phim): Đặt 'text': \"\" (chuỗi rỗng) để hệ thống tự động bỏ qua không đọc lồng tiếng đè lên bài hát gốc.\n"
                    f"   - Nếu một phân đoạn chỉ là tiếng nhạc đệm lặp vô nghĩa (như 'la la la', 'bloop bloop'), đặt 'text': \"\".\n"
                    f"   - NẾU LÀ CÂU THOẠI CỦA NHÂN VẬT: Luôn dịch đầy đủ, tự nhiên theo ngữ cảnh, tuyệt đối không cắt bớt lời thoại.\n"
                    f"   - Khi một câu thoại bị ngắt làm nhiều dòng do timestamp, hãy đọc gom nghĩa cả cụm câu trước khi dịch từng dòng lẻ để tránh mất ngữ cảnh và cụt câu.\n"
                    f"   - Nếu một dòng chứa thoại của 2 người nói chen ngang, hãy dùng dấu gạch ngang (-) để phân tách rõ ràng.\n\n"
                    f"4. GIỚI HẠN ĐỘ DÀI CÂU DỊCH (ĐỂ LỒNG TIẾNG VỪA KHUNG THỜI GIAN):\n"
                    f"   - Hãy ưu tiên dùng các từ đơn, từ ngắn, dịch súc tích, đúng ý cốt lõi nhưng KHÔNG ĐƯỢC DÀI DÒNG.\n"
                    f"   - Căn chỉnh độ dài theo thời lượng (duration_sec): Câu tiếng Việt phải vừa vặn nhịp đọc (~3.5 - 4.0 từ/giây), ngắt câu tự nhiên theo nhịp nói khẩu ngữ để phần mềm lồng tiếng (TTS) đọc vừa kịp thời gian của dòng phụ đề, tránh bị dồn toa trễ giọng.\n\n"
                    f"5. TỐI ƯU CẢM XÚC VÀ NHỊP ĐOẠN THOẠI (DÀNH CHO LỒNG TIẾNG TTS):\n"
                    f"   - Nhận diện tâm trạng câu thoại (giận dữ, vội vã, buồn bã, mỉa mai, nói thầm) qua từ cảm thán và dấu câu.\n"
                    f"   - Khi khoảng thời gian của câu ngắn (dưới 1.5 giây): Sử dụng từ đơn, câu lẹm, lược bỏ từ đệm để nói gọn, nhanh gọn đúng nhịp.\n"
                    f"   - Khi khoảng thời gian của câu dài nhưng ít chữ: Dùng từ có âm tiết kéo dài, thêm từ biểu cảm (à, ừm, nha, này...) để giọng đọc trải dài tự nhiên mà không bị ngập ngừng.\n"
                    f"   - Đảm bảo bản dịch giữ nguyên cấu trúc ngữ điệu, giúp giọng đọc TTS truyền tải đúng cảm xúc nhân vật.\n\n"
                    f"{memory_section}"
                    f"6. ĐỊNH DẠNG ĐẦU RA BẮT BUỘC:\n"
                    f"   - BẮT BUỘC TRẢ VỀ ĐẦY ĐỦ 100% TẤT CẢ {len(chunk)} PHÂN ĐOẠN (từ id: 1 đến id: {len(chunk)}).\n"
                    f"   - Giữ nguyên cấu trúc mã định danh (id).\n"
                    f"   - Tuyệt đối KHÔNG ĐƯỢC gộp các ID thành 1, KHÔNG ĐƯỢC bỏ sót bất kỳ ID nào!\n"
                    f"   - Trường 'text' của các ID thoại là bản dịch TIẾNG VIỆT tự nhiên, phù hợp với ngữ cảnh hội thoại.\n"
                    f"   - CHỈ TRẢ VỀ JSON array hợp lệ gồm các object với 'id', 'speaker', và 'text'. Không kèm bất kỳ lời mở đầu, giải thích hay ghi chú nào.\n"
                    f"Ví dụ cấu trúc đầu ra: [{{\"id\": 1, \"speaker\": \"Người nói 1\", \"text\": \"Câu thoại tiếng Việt tự nhiên...\"}}]\n\n"
                    f"Danh sách phân đoạn đầu vào:\n"
                    f"{json.dumps(input_items, ensure_ascii=False)}"
                )
            elif tgt_code.startswith("en"):
                prompt = (
                    f"You are an expert film/video subtitle translator and dubbing scriptwriter ({src_name} -> English).\n"
                    f"Your task is to translate subtitle dialogue segments from '{src_name}' into NATURAL, IDIOMATIC SPOKEN ENGLISH for voiceover dubbing and subtitles.\n\n"
                    f"CRITICAL REQUIREMENTS:\n\n"
                    f"1. STRICT OUTPUT LANGUAGE REQUIREMENT:\n"
                    f"   - The 'text' field of EVERY segment MUST BE TRANSLATED INTO ENGLISH.\n"
                    f"   - NEVER keep Vietnamese or the original language in the 'text' field. Every line must be English.\n\n"
                    f"2. NATURAL SPOKEN FILM DIALOGUE (NOT WORD-BY-WORD):\n"
                    f"   - Do NOT translate literally or word-by-word. Translate meaning, emotion, and conversational tone.\n"
                    f"   - Use natural conversational English contractions (e.g., \"don't\", \"can't\", \"I'm\", \"it's\", \"you'll\", \"let's\").\n"
                    f"   - Accurately translate Vietnamese hierarchical pronouns and terms of address (anh, em, chị, cô, chú, bác, sếp, mẹ, con...) into natural English pronouns (I, you, he, she, we, they) or names based on conversational context and relationship.\n"
                    f"   - Keep character naming consistent throughout all segments. Infer the speaker's role or character name and put it in the 'speaker' field (in English).{style_instruction}\n\n"
                    f"3. DUBBING & SUBTITLE TIMING CONSTRAINTS:\n"
                    f"   - Normal English speech pace for voiceover/subtitles is approximately 2.5 - 3.5 words per second.\n"
                    f"   - Use 'duration_sec' as a guide: keep English lines concise and punchy so the TTS voiceover can read them clearly within the allocated time without rushing.\n"
                    f"   - For short duration clips (<1.5s): use brief, punchy words.\n"
                    f"   - If two people speak over each other in one segment, use a hyphen (-) to separate their lines.\n\n"
                    f"4. NOISE & NON-SPEECH:\n"
                    f"   - If a segment is clearly just background sound effects or nonsensical audio noise (like 'bloop', 'ting'), output an empty string \"\" or omit noise.\n"
                    f"   - If it is actual character dialogue, ALWAYS translate it fully and faithfully.\n\n"
                    f"{memory_section}"
                    f"5. MANDATORY JSON OUTPUT FORMAT:\n"
                    f"   - Return EXACTLY {len(chunk)} segments (ids 1 to {len(chunk)}).\n"
                    f"   - Preserve every ID exactly. Do NOT combine IDs, do NOT skip any ID.\n"
                    f"   - The 'text' field MUST contain the translated ENGLISH text.\n"
                    f"   - ONLY output a valid JSON array of objects with 'id', 'speaker', and 'text'. No explanations, no markdown wrapper other than raw JSON.\n"
                    f"Example Output: [{{\"id\": 1, \"speaker\": \"Speaker 1\", \"text\": \"Natural English movie line here...\"}}]\n\n"
                    f"Input segments to translate:\n"
                    f"{json.dumps(input_items, ensure_ascii=False)}"
                )
            else:
                prompt = (
                    f"You are a professional film/video subtitle translator ({src_name} -> {tgt_name}).\n"
                    f"Your task is to translate subtitle segments from '{src_name}' into NATURAL {tgt_name} ({target_lang}) for voiceover dubbing and subtitles.\n\n"
                    f"CRITICAL REQUIREMENTS:\n"
                    f"1. The 'text' field of EVERY segment MUST BE TRANSLATED INTO {tgt_name} ({target_lang}).\n"
                    f"2. Translate naturally for conversational dialogue, keeping tone, emotion and subtitle timing intact.\n"
                    f"3. Adjust sentence length to fit 'duration_sec' for TTS voice reading.\n"
                    f"4. Preserve all {len(chunk)} segments with matching 'id' numbers.\n"
                    f"{memory_section}"
                    f"5. ONLY output a valid JSON array of objects with 'id', 'speaker', and 'text' in {tgt_name}.\n"
                    f"Example: [{{\"id\": 1, \"speaker\": \"Speaker 1\", \"text\": \"Dialogue in {tgt_name}...\"}}]\n\n"
                    f"Input segments:\n"
                    f"{json.dumps(input_items, ensure_ascii=False)}"
                )

            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": float(temperature),
                    "response_mime_type": "application/json",
                },
            }

            headers = {"Content-Type": "application/json"}
            translated_ok = False

            for cur_model in candidate_models:
                endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{cur_model}:generateContent?key={api_key}"
                try:
                    async with httpx.AsyncClient(timeout=45.0) as client:
                        resp = await client.post(endpoint, headers=headers, json=payload)
                        if resp.status_code == 429:
                            logger.warning(f"Mô hình {cur_model} bị nghẽn tốc độ (429), đợi 2.5 giây và thử lại...")
                            await asyncio.sleep(2.5)
                            resp = await client.post(endpoint, headers=headers, json=payload)

                        if resp.status_code in [404, 503, 429]:
                            logger.warning(f"Mô hình {cur_model} trả về HTTP {resp.status_code}, thử mô hình tiếp theo...")
                            continue

                        resp.raise_for_status()
                        data = resp.json()

                        candidates = data.get("candidates", [])
                        if candidates and "content" in candidates[0]:
                            parts = candidates[0]["content"].get("parts", [])
                            if parts:
                                raw_content = parts[0].get("text", "").strip()
                                json_match = re.search(r"(\[.*\]|\{.*\})", raw_content, re.DOTALL)
                                parsed = json.loads(json_match.group(1)) if json_match else json.loads(raw_content)
                                items = parsed if isinstance(parsed, list) else parsed.get("translations", parsed.get("subtitles", []))
                                id_to_text = {item.get("id"): item.get("text", "") for item in items if isinstance(item, dict)}
                                id_to_spk = {item.get("id"): item.get("speaker", "") for item in items if isinstance(item, dict)}

                                for i in range(len(chunk)):
                                    if (i + 1) in id_to_text:
                                        trans_text = id_to_text[i + 1].strip()
                                        needs_fallback = False

                                        # 1. Nếu dịch sang tiếng Việt mà còn chữ Trung (từ phim Trung)
                                        if tgt_code.startswith("vi") and src_code.startswith("zh") and any('\u4e00' <= char <= '\u9fff' for char in trans_text):
                                            logger.warning(f"ID {i+1} còn chữ Trung khi đích là tiếng Việt: '{trans_text}'. Đang fallback qua Google...")
                                            needs_fallback = True

                                        # 2. Nếu dịch sang tiếng Anh mà output vẫn chứa dấu tiếng Việt (AI chưa dịch hoặc trả lại câu gốc)
                                        elif tgt_code.startswith("en") and VIETNAMESE_DIACRITICS_PATTERN.search(trans_text):
                                            logger.warning(f"ID {i+1} vẫn còn tiếng Việt khi đích là tiếng Anh: '{trans_text}'. Đang fallback qua Google...")
                                            needs_fallback = True

                                        if needs_fallback:
                                            fallback_text = await GoogleTranslator.translate_single_text(chunk[i], source_lang=source_lang, target_lang=target_lang)
                                            results[start_idx + i] = clean_translated_text(fallback_text)
                                        else:
                                            results[start_idx + i] = clean_translated_text(trans_text)
                                    else:
                                        logger.warning(f"ID {i+1} bị thiếu trong JSON. Đang fallback...")
                                        fallback_text = await GoogleTranslator.translate_single_text(chunk[i], source_lang=source_lang, target_lang=target_lang)
                                        results[start_idx + i] = clean_translated_text(fallback_text)

                                    if (i + 1) in id_to_spk and id_to_spk[i + 1]:
                                        speakers[start_idx + i] = id_to_spk[i + 1]

                                logger.info(f"✅ [Google AI Studio] Dịch thành công batch {start_idx + 1}-{start_idx + len(chunk)} sang {tgt_name} qua Gemini ({cur_model}) với phân vai & biểu cảm")
                                translated_ok = True
                                break
                except Exception as e:
                    logger.warning(f"[GoogleAIStudioTranslator] Lỗi với {cur_model}: {e}")
                    continue

            if not translated_ok:
                logger.error(f"[GoogleAIStudioTranslator] Tất cả mô hình Gemini đều bận (batch {start_idx}). Chuyển sang fallback Google...")
                # Fallback cục bộ cho chunk này qua GoogleTranslator
                fallback_chunk = await GoogleTranslator.translate_batch_texts(
                    chunk, source_lang=source_lang, target_lang=target_lang
                )
                for i, fb_text in enumerate(fallback_chunk):
                    results[start_idx + i] = fb_text

            await asyncio.sleep(0.1)

        cleaned_results = [clean_technical_terms(r, target_lang=target_lang) for r in results]
        return cleaned_results, speakers


class TranslationService:
    """Điều phối dịch thuật cho toàn bộ hệ thống."""

    @classmethod
    async def translate_text(
        cls,
        text: str,
        source_lang: str = "auto",
        target_lang: str = "vi",
        provider: str = "google",
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> str:
        # Tự động lấy key từ môi trường nếu không truyền trực tiếp
        gemini_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_AI_STUDIO_API_KEY")

        if provider.lower() in ["gemini", "google_ai_studio", "google-ai-studio"] and gemini_key:
            res_texts, _ = await GoogleAIStudioTranslator.translate_batch_texts(
                texts=[text],
                source_lang=source_lang,
                target_lang=target_lang,
                api_key=gemini_key,
                model=model,
            )
            return res_texts[0] if res_texts else text

        if provider.lower() in ["openai", "deepseek"] and api_key:
            res = await OpenAITranslator.translate_batch_texts(
                texts=[text],
                source_lang=source_lang,
                target_lang=target_lang,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
            return res[0] if res else text

        return await GoogleTranslator.translate_single_text(text, source_lang=source_lang, target_lang=target_lang)

    @classmethod
    async def translate_segments(
        cls,
        segments: list[dict[str, Any]],
        source_lang: str = "auto",
        target_lang: str = "vi",
        provider: str = "google",
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        temperature: float = 0.2,
        style: str = "auto",
        progress_callback: Any | None = None,
    ) -> list[dict[str, Any]]:
        if not segments:
            return []

        texts = [s.get("text", "").strip() for s in segments]
        durations = [
            round(float(s.get("end", 0.0)) - float(s.get("start", 0.0)), 2)
            for s in segments
        ]
        gemini_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_AI_STUDIO_API_KEY")
        translated_speakers = [""] * len(texts)

        if provider.lower() in ["gemini", "google_ai_studio", "google-ai-studio"] and gemini_key:
            selected_model = model or "gemini-3.8-flash"
            logger.info(f"🌐 Sử dụng Google AI Studio (Model={selected_model}, Temp={temperature}) dịch {len(texts)} câu phụ đề (Style={style})...")
            translated_texts, translated_speakers = await GoogleAIStudioTranslator.translate_batch_texts(
                texts=texts,
                source_lang=source_lang,
                target_lang=target_lang,
                api_key=gemini_key,
                model=selected_model,
                temperature=temperature,
                durations=durations,
                style=style,
                progress_callback=progress_callback,
            )
        elif provider.lower() in ["openai", "deepseek"] and api_key:
            logger.info(f"🌐 Sử dụng {provider} LLM dịch {len(texts)} câu phụ đề...")
            translated_texts = await OpenAITranslator.translate_batch_texts(
                texts=texts,
                source_lang=source_lang,
                target_lang=target_lang,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
        else:
            logger.info(f"🌐 Sử dụng Google Translate tốc độ cao dịch {len(texts)} câu phụ đề...")
            translated_texts = await GoogleTranslator.translate_batch_texts(
                texts=texts,
                source_lang=source_lang,
                target_lang=target_lang,
            )

        new_segments = []
        for i, seg in enumerate(segments):
            raw_trans = translated_texts[i] if i < len(translated_texts) else seg.get("text", "")
            translated_text = clean_translated_text(raw_trans)
            seg_copy = dict(seg)
            seg_copy["text"] = translated_text
            # Ghi nhớ câu gốc để phục vụ song ngữ hoặc đối chiếu
            seg_copy["original_text"] = seg.get("text", "")
            if i < len(translated_speakers) and translated_speakers[i]:
                seg_copy["speaker"] = translated_speakers[i]
            new_segments.append(seg_copy)

        return new_segments
