"""
app/services/translators/openai_translator.py
─────────────────────────────────────────────
Dịch phụ đề video bằng LLM OpenAI-compatible (DeepSeek, ChatGPT, Ollama...).
"""

import re
import json
import httpx

from app.core.config import logger
from app.services.translation_memory_service import TranslationMemoryService
from app.services.translators.cleaner import get_language_name, clean_technical_terms
from app.services.translators.constants import VIETNAMESE_DIACRITICS_PATTERN
from app.services.translators.google_translator import GoogleTranslator


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
                f"6. NHỊP ĐIỆU TTS & NGẬP NGỪNG: Câu ngắn (<1.5s) dùng từ đơn gọn gàng. Nếu nhân vật nói ngập ngừng, ấp úng, ngắt quãng hoặc có khoảng lặng lấy hơi giữa câu, BẮT BUỘC chèn dấu phẩy (,), dấu ba chấm (...) hoặc gạch nối (-) giữa các từ ngữ tiếng Việt. Tuyệt đối không làm phẳng thành một câu trơn tru nếu nhân vật thực tế đang nói ngắt quãng.\n"
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
