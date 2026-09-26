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

        return [clean_technical_terms(t) for t in results]


TECHNICAL_TERM_FIXES = [
    (re.compile(r"\bmáy bay phản lực video\b", re.IGNORECASE), "máy in Videojet"),
    (re.compile(r"\bvideo jet\b", re.IGNORECASE), "Videojet"),
    (re.compile(r"\bgói tetra\b", re.IGNORECASE), "hệ thống Tetra Pak"),
    (re.compile(r"\btetra pack\b", re.IGNORECASE), "Tetra Pak"),
    (re.compile(r"\bbodrate\b", re.IGNORECASE), "Baud rate"),
    (re.compile(r"\bbaudrate\b", re.IGNORECASE), "Baud rate"),
]


def clean_technical_terms(text: str) -> str:
    if not text:
        return text
    for pattern, replacement in TECHNICAL_TERM_FIXES:
        text = pattern.sub(replacement, text)
    return text


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

        system_prompt = (
            f"Bạn là một chuyên gia biên dịch kịch bản phim và xử lý phụ đề chuyên nghiệp ({source_lang} -> {target_lang}).\n"
            f"Dịch từng phân đoạn thoại sang {target_lang} chuẩn kịch bản lồng tiếng TTS.\n\n"
            f"CÁC NGUYÊN TẮC BẮT BUỘC:\n"
            f"1. SỬA LỖI ĐỒNG ÂM ASR: Đọc ngữ cảnh, tự suy luận và ngầm sửa các từ đồng âm/gần âm sai chữ Hán (ví dụ: 假方 -> 甲方, 善 -> 删...). Dịch bản đã hiểu đúng sang tiếng Việt.\n"
            f"2. KHÔNG DỊCH THÔ (WORD-BY-WORD): Đóng vai biên dịch viên phim ảnh, dịch thoát ý, điều chỉnh đại từ nhân xưng (anh, em, cô, chú, sếp, giám đốc...) tự nhiên và nhất quán.\n"
            f"3. THOẠI ĐÈ & CẮT CÂU: Gom nghĩa cả cụm câu trước khi dịch, dùng dấu gạch ngang (-) nếu 2 người nói chen nhau. Lọc bỏ từ rác nhạc nền.\n"
            f"4. GIỚI HẠN ĐỘ DÀI: Tiếng Việt ngắn gọn, súc tích; số chữ tiếng Việt KHÔNG vượt quá 1.3 lần số chữ gốc để đọc vừa khung thời lượng.\n"
            f"5. NHỊP ĐIỆU TTS: Câu ngắn (<1.5s) dùng từ đơn gọn gàng; câu dài ít chữ dùng từ kéo dài, trợ từ ngữ khí tự nhiên.\n"
            f"{memory_instruction}\n"
            f"6. ĐỊNH DẠNG: Giữ nguyên 100% số lượng dòng và ID. CHỈ TRẢ VỀ JSON array: [{{\"id\": 1, \"text\": \"bản dịch\"}}]."
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
                return [clean_technical_terms(id_to_text.get(i + 1, texts[i])) for i in range(len(texts))]
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
        """Kiểm tra kết nối và tính hợp lệ của API Key Google AI Studio."""
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
                        "message": "⚠️ API KEY ĐÚNG NHƯNG ĐÃ HẾT HẠN MỨC (Lỗi 429 Quota Exceeded): Tài khoản Google này đã dùng hết 20 lượt gọi miễn phí hôm nay. Vui lòng tạo Key mới từ Gmail khác hoặc dùng 'Google Dịch (Miễn phí)'.",
                    }
        except httpx.TimeoutException:
            return {"valid": False, "message": "❌ Không thể kết nối đến Google AI Studio (Timeout). Vui lòng kiểm tra lại mạng Internet."}
        except Exception as e:
            return {"valid": False, "message": f"❌ Lỗi kết nối mạng đến Google AI Studio: {str(e)}"}

        # Bước 2: Thử sinh nội dung để kiểm tra Quota còn lại
        models_to_try = [m for m in ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-pro"] if m in available_models] or available_models[:4] or ["gemini-3.8-flash"]

        is_quota_exceeded = False
        last_error = ""

        for m in models_to_try:
            post_endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={key}"
            payload = {
                "contents": [{"parts": [{"text": "Hello"}]}],
                "generationConfig": {"maxOutputTokens": 5},
            }
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(post_endpoint, json=payload)
                    if resp.status_code == 200:
                        return {
                            "valid": True,
                            "model": m,
                            "message": f"✅ Kết nối Google AI Studio thành công! Mô hình '{m}' hoạt động tốt và còn hạn ngạch.",
                        }
                    elif resp.status_code == 429:
                        is_quota_exceeded = True
                        last_error = "Hết hạn mức Quota trong ngày (Free Tier)"
                    elif resp.status_code in [404, 503]:
                        continue
                    else:
                        err_msg = resp.json().get("error", {}).get("message", f"HTTP {resp.status_code}")
                        last_error = err_msg
            except Exception as e:
                last_error = str(e)

        if is_quota_exceeded:
            return {
                "valid": False,
                "message": "⚠️ API KEY ĐÚNG NHƯNG ĐÃ HẾT HẠN MỨC (Lỗi 429 Quota Exceeded): Tài khoản Google này đã dùng hết 20 lượt gọi miễn phí hôm nay. Vui lòng tạo Key mới từ Gmail khác hoặc dùng 'Google Dịch (Miễn phí)'.",
            }

        return {
            "valid": True,
            "message": f"✅ API Key hợp lệ và đã kết nối máy chủ Google AI Studio thành công ({len(available_models)} mô hình sẵn sàng).",
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
    ) -> tuple[list[str], list[str]]:
        if not texts:
            return [], []

        # Danh sách mô hình ưu tiên, đưa model người dùng chọn lên đầu tiên
        candidate_models = []
        if model and model.strip():
            candidate_models.append(model.strip())
        for m in [
            "gemini-3.8-flash",
            "gemini-flash-latest",
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-2.0-flash",
            "gemini-2.5-flash-lite",
        ]:
            if m not in candidate_models:
                candidate_models.append(m)

        style_instruction = ""
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

        results = list(texts)
        speakers = [""] * len(texts)

        for start_idx in range(0, len(texts), batch_size):
            chunk = texts[start_idx : start_idx + batch_size]
            chunk_durs = durations[start_idx : start_idx + batch_size] if durations else None

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

            prompt = (
                f"Bạn là một chuyên gia biên dịch kịch bản phim và xử lý phụ đề chuyên nghiệp (Trung - Việt).\n"
                f"Nhiệm vụ của bạn là nhận các phân đoạn thoại phụ đề từ '{source_lang}' sang '{target_lang}' chuẩn kịch bản lồng tiếng.\n\n"
                f"HÃY THỰC HIỆN THEO CÁC NGUYÊN TẮC QUY TRÌNH NÀY CHỦ ĐỘNG CHO MỌI VIDEO:\n\n"
                f"1. TỰ ĐỘNG PHÁT HIỆN VÀ NGẦM SỬA LỖI CHÍNH TẢ / ĐỒNG ÂM ASR TRƯỚC KHI DỊCH:\n"
                f"   - Phụ đề đầu vào do công cụ nhận dạng âm thanh (ASR) tạo ra nên chứa rất nhiều từ đồng âm/gần âm bị sai chữ Hán (ví dụ: 假方 thay vì 甲方, 善 thay vì 删, 姓 thay vì 性...).\n"
                f"   - Nhiệm vụ: Đọc toàn bộ ngữ cảnh mạch chuyện, tự suy luận và NGẦM SỬA CHÍNH TẢ / ĐỒNG ÂM của tiếng Trung sang chữ đúng trước khi dịch.\n"
                f"   - Dịch bản đã hiểu đúng sang tiếng Việt chuẩn kịch bản.\n"
                f"   - Khôi phục tên riêng (nếu bị biến dạng thành từ chỉ vật/học vấn), chuyển khẩu ngữ/từ lóng về đúng ngữ cảnh.\n\n"
                f"2. BIÊN DỊCH VIÊN PHIM ẢNH - KHÔNG DỊCH THÔ (WORD-BY-WORD):\n"
                f"   - Tuyệt đối KHÔNG dịch thô (word-by-word). Hãy đóng vai một biên dịch viên phim ảnh chuyên nghiệp, dịch thoát ý, giàu cảm xúc và tự nhiên.\n"
                f"   - Chủ động điều chỉnh đại từ nhân xưng (anh, em, cô, chú, bác, sếp, giám đốc, mẹ, con...) cho mượt mà, tự nhiên và đúng văn phong giao tiếp của người Việt.\n"
                f"   - Nhất quán xưng hô của từng cặp nhân vật từ đầu đến cuối toàn bộ file.\n"
                f"   - Tên riêng và danh xưng nhân vật: Tự động chuyển đổi sang phiên âm Hán-Việt tự nhiên, xuôi tai (ví dụ chức vụ Tổng giám đốc/Lục tổng/Trương tổng...). Ghi vai/người nói suy luận được vào trường 'speaker'.{style_instruction}\n\n"
                f"3. XỬ LÝ THOẠI ĐÈ & CẮT NỬA CÂU:\n"
                f"   - Khi một câu thoại bị ngắt làm nhiều dòng do timestamp, hãy đọc gom nghĩa cả cụm câu trước khi dịch từng dòng lẻ để tránh mất ngữ cảnh và cụt câu.\n"
                f"   - Nếu một dòng chứa thoại của 2 người nói chen ngang, hãy dùng dấu gạch ngang (-) để phân tách rõ ràng.\n"
                f"   - Phân biệt rõ lời thoại và nhạc nền: Nếu phân đoạn nào chỉ là tiếng nhạc dạo hoặc từ lặp vô nghĩa của nhạc nền, hãy làm sạch hoặc bỏ qua từ rác.\n\n"
                f"4. GIỚI HẠN ĐỘ DÀI CÂU DỊCH (ĐỂ LỒNG TIẾNG VỪA KHUNG THỜI GIAN):\n"
                f"   - Tiếng Trung ngắn hơn tiếng Việt. Hãy ưu tiên dùng các từ đơn, từ ngắn, dịch súc tích, đúng ý cốt lõi nhưng KHÔNG ĐƯỢC DÀI DÒNG.\n"
                f"   - NGUYÊN TẮC ĐẾM CHỮ: Số chữ tiếng Việt dịch ra KHÔNG ĐƯỢC VƯỢT QUÁ 1.3 LẦN số chữ tiếng Trung gốc của dòng đó.\n"
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
                f"   - Trường 'text' của TẤT CẢ các ID đều PHẢI là tiếng Việt, tuyệt đối không để nguyên tiếng Trung.\n"
                f"   - CHỈ TRẢ VỀ JSON array hợp lệ gồm các object với 'id', 'speaker', và 'text'. Không kèm bất kỳ lời mở đầu, giải thích hay ghi chú nào.\n"
                f"Ví dụ cấu trúc đầu ra: [{{\"id\": 1, \"speaker\": \"Người nói 1\", \"text\": \"Câu thoại tiếng Việt tự nhiên...\"}}]\n\n"
                f"Danh sách phân đoạn đầu vào:\n"
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
                                    trans_text = id_to_text.get(i + 1, "").strip()
                                    # Bảo đảm 100% tiếng Việt, nếu sót ID hoặc còn chữ Trung thì fallback dịch ngay
                                    if not trans_text or any('\u4e00' <= char <= '\u9fff' for char in trans_text):
                                        logger.warning(f"ID {i+1} chưa được dịch trọn vẹn: '{trans_text}'. Đang fallback...")
                                        fallback_text = await GoogleTranslator.translate_single_text(chunk[i], source_lang=source_lang, target_lang=target_lang)
                                        results[start_idx + i] = fallback_text
                                    else:
                                        results[start_idx + i] = trans_text

                                    if (i + 1) in id_to_spk and id_to_spk[i + 1]:
                                        speakers[start_idx + i] = id_to_spk[i + 1]

                                logger.info(f"✅ [Google AI Studio] Dịch thành công batch {start_idx + 1}-{start_idx + len(chunk)} qua Gemini ({cur_model}) với phân vai & biểu cảm")
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

        cleaned_results = [clean_technical_terms(r) for r in results]
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
            selected_model = model or "gemini-2.5-flash"
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
            translated_text = translated_texts[i] if i < len(translated_texts) else seg.get("text", "")
            seg_copy = dict(seg)
            seg_copy["text"] = translated_text
            # Ghi nhớ câu gốc để phục vụ song ngữ hoặc đối chiếu
            seg_copy["original_text"] = seg.get("text", "")
            if i < len(translated_speakers) and translated_speakers[i]:
                seg_copy["speaker"] = translated_speakers[i]
            new_segments.append(seg_copy)

        return new_segments
