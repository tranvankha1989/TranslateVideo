"""
app/services/translators/gemini_translator.py
─────────────────────────────────────────────
Dịch phụ đề video bằng Google AI Studio (Gemini Flash).
"""

import re
import json
import asyncio
from typing import Any
import httpx

from app.core.config import logger
from app.services.translation_memory_service import TranslationMemoryService
from app.services.translators.cleaner import (
    get_language_name,
    clean_translated_text,
    clean_technical_terms,
)
from app.services.translators.constants import VIETNAMESE_DIACRITICS_PATTERN
from app.services.translators.google_translator import GoogleTranslator


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
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                get_resp = await client.get(get_endpoint)
                if get_resp.status_code == 200:
                    pass
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
                "id": "gemini-3.5-flash-lite",
                "name": "Gemini 3.5 Flash Lite (Mặc định & Khuyên dùng)",
                "rpd": "500 lượt/ngày",
                "rpm": "15 lượt/phút",
                "tpm": "250.000 tokens/phút",
            },
            {
                "id": "gemini-3.1-flash-lite",
                "name": "Gemini 3.1 Flash Lite (Nhanh & Ổn định)",
                "rpd": "500 lượt/ngày",
                "rpm": "15 lượt/phút",
                "tpm": "250.000 tokens/phút",
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
            except Exception:
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
                "message": "✅ Kết nối Google AI Studio thành công! Đã kiểm tra hạn ngạch các mô hình.",
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

        candidate_models = []
        if model and model.strip():
            candidate_models.append(model.strip())
        for m in [
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
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
                    f"   - MÔ PHỎNG NHỊP ĐIỆU & NGẬP NGỪNG: Quan sát mốc thời gian (duration_sec) và ngữ cảnh câu thoại gốc. Nếu nhân vật nói ngập ngừng, ấp úng, ngắt quãng hoặc có khoảng lặng lấy hơi giữa câu, BẮT BUỘC chèn thêm các dấu ngắt nghỉ phù hợp như dấu phẩy (,), dấu ba chấm (...), hoặc gạch nối (-) ngay giữa các từ ngữ tiếng Việt. Tuyệt đối không làm phẳng thành một câu trơn tru nếu nhân vật thực tế đang nói ngắt quãng.\n"
                    f"   - Khi khoảng thời gian của câu ngắn (dưới 1.5 giây): Sử dụng từ đơn, câu lẹm, lược bỏ từ đệm để nói gọn, nhanh gọn đúng nhịp.\n"
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
                "contents": [{"parts": [{"text": prompt}]}],
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

                                        if tgt_code.startswith("vi") and src_code.startswith("zh") and any('\u4e00' <= char <= '\u9fff' for char in trans_text):
                                            logger.warning(f"ID {i+1} còn chữ Trung khi đích là tiếng Việt: '{trans_text}'. Đang fallback qua Google...")
                                            needs_fallback = True
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
                fallback_chunk = await GoogleTranslator.translate_batch_texts(
                    chunk, source_lang=source_lang, target_lang=target_lang
                )
                for i, fb_text in enumerate(fallback_chunk):
                    results[start_idx + i] = fb_text

            await asyncio.sleep(0.1)

        cleaned_results = [clean_technical_terms(r, target_lang=target_lang) for r in results]
        return cleaned_results, speakers
