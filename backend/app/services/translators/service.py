"""
app/services/translators/service.py
───────────────────────────────────
Lớp TranslationService điều phối chọn provider (Google, Gemini, DeepSeek).
"""

import os
import re
import json
import asyncio
from typing import Any
import httpx

from app.core.config import logger
from app.services.translators.cleaner import (
    get_language_name,
    clean_translated_text,
)
from app.services.translators.google_translator import GoogleTranslator
from app.services.translators.openai_translator import OpenAITranslator
from app.services.translators.gemini_translator import GoogleAIStudioTranslator


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
        """
        Dịch toàn bộ danh sách phân đoạn phụ đề (segments) với bảo toàn 100% số lượng, thứ tự và timestamp.
        Sử dụng Dict Mapping theo 'id' để triệt tiêu hoàn toàn lỗi lệch câu thoại (off-by-one shift).
        """
        if not segments:
            return []

        for idx, seg in enumerate(segments):
            if "id" not in seg or seg["id"] is None:
                seg["id"] = idx + 1
            if "original_text" not in seg or not seg["original_text"]:
                seg["original_text"] = seg.get("text", "")

        gemini_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_AI_STUDIO_API_KEY")
        selected_provider = provider.lower().strip() if provider else "google"
        tgt_code = target_lang.lower().strip() if target_lang else "vi"
        src_code = source_lang.lower().strip() if source_lang else "auto"

        tgt_name = get_language_name(tgt_code)
        src_name = get_language_name(src_code)

        if tgt_code.startswith("vi"):
            prompt_rule = (
                "Dịch sang tiếng Việt các câu thoại kịch bản video. "
                "TUYỆT ĐỐI KHÔNG gộp câu, KHÔNG tách câu. "
                'Trả về đúng định dạng JSON danh sách: [{"id": 1, "translated_text": "...", "is_ad": false}].'
            )
        else:
            prompt_rule = (
                f"Dịch sang {tgt_name} các câu thoại kịch bản video. "
                "TUYỆT ĐỐI KHÔNG gộp câu, KHÔNG tách câu. "
                f'Trả về đúng định dạng JSON danh sách: [{{"id\": 1, "translated_text": "...", "is_ad": false}}].'
            )

        trans_map: dict[Any, str] = {}
        speaker_map: dict[Any, str] = {}
        all_ad_ids: set[Any] = set()
        batch_size = 40
        total_segments = len(segments)

        for start_idx in range(0, total_segments, batch_size):
            chunk = segments[start_idx : start_idx + batch_size]
            payload = [{"id": seg["id"], "text": seg.get("text", "")} for seg in chunk]

            if progress_callback:
                try:
                    cur_cnt = start_idx + 1
                    msg = f"Đang dịch batch câu {cur_cnt}-{min(start_idx + len(chunk), total_segments)}/{total_segments} ({selected_provider.upper()})..."
                    if asyncio.iscoroutinefunction(progress_callback):
                        await progress_callback(cur_cnt, total_segments, msg)
                    else:
                        progress_callback(cur_cnt, total_segments, msg)
                except Exception:
                    pass

            batch_trans_items: list[dict[str, Any]] = []

            # ── Nhánh 1: Google AI Studio (Gemini) ──
            if selected_provider in ["gemini", "google_ai_studio", "google-ai-studio"] and gemini_key:
                candidate_models = []
                if model and model.strip():
                    candidate_models.append(model.strip())
                for m in [
                    "gemini-3.8-flash",
                    "gemini-3.7-flash",
                    "gemini-3.5-flash-lite",
                    "gemini-flash-latest",
                    "gemini-3.1-pro-preview",
                    "gemini-3.5-flash",
                ]:
                    if m not in candidate_models:
                        candidate_models.append(m)

                gemini_prompt = (
                    f"Bạn là chuyên gia biên dịch kịch bản phim và phụ đề video chuyên nghiệp ({src_name} -> {tgt_name}).\n"
                    f"{prompt_rule}\n\n"
                    f"CÁC QUY TẮC BẮT BUỘC:\n"
                    f"1. Tự động phát hiện và ngầm sửa lỗi đồng âm/chính tả ASR trước khi dịch.\n"
                    f"2. Dịch tự nhiên, thoát ý, giàu cảm xúc, đúng đại từ xưng hô kịch bản phim.\n"
                    f"3. Giữ câu súc tích để tốc độ đọc TTS vừa vặn với thời lượng phụ đề.\n"
                    f"4. Mô phỏng nhịp điệu & ngập ngừng: Quan sát mốc thời gian và ngữ cảnh câu thoại gốc. Nếu nhân vật nói ngập ngừng, ấp úng, ngắt quãng hoặc có khoảng lặng lấy hơi giữa câu, BẮT BUỘC chèn thêm các dấu ngắt nghỉ phù hợp như dấu phẩy (,), dấu ba chấm (...), hoặc gạch nối (-) ngay giữa các từ ngữ tiếng Việt. Tuyệt đối không làm phẳng thành một câu trơn tru nếu nhân vật thực tế đang nói ngắt quãng.\n"
                    f"5. Nếu phát hiện tên hoặc vai người nói, thêm trường 'speaker' vào object tương ứng.\n"
                    f"6. NHẬN DIỆN VÀ LỌC BỎ CÂU QUẢNG CÁO / CTA / OUTRO KÊNH:\n"
                    f"   - Nếu một câu là lời kêu gọi hành động (CTA) độc lập (ví dụ: 'Like and subscribe to my channel', 'Nhớ bấm like và đăng ký kênh', 'Link in description', 'Thanks for watching, bye bye', 'Ủng hộ kênh nhé'), hoặc lời ảo giác lặp lại vô nghĩa: Đặt \"is_ad\": true và \"translated_text\": \"\".\n"
                    f"   - QUY TẮC BẢO VỆ LỜI THOẠI (CRITICAL): TUYỆT ĐỐI KHÔNG đánh dấu là quảng cáo nếu đó là câu nói, lời kể, hoặc cuộc hội thoại bình thường của nhân vật (ví dụ: 'I\\'m doing and just naturally talk. So it\\'s going to be like we are hanging out and cooking dinner' - từ 'like' ở đây chỉ là từ đệm/so sánh tự nhiên, hoàn toàn không phải kêu gọi like/sub). Chỉ đánh dấu \"is_ad\": true khi 100% chắc chắn đó là quảng cáo, xin like/sub hoặc outro kênh.\n"
                    f"7. CHỈ TRẢ VỀ DUY NHẤT một mảng JSON các object theo đúng format: [{{\"id\": 1, \"translated_text\": \"...\", \"is_ad\": false, \"speaker\": \"...\"}}]. Không thêm bất kỳ văn bản nào ngoài JSON.\n\n"
                    f"Danh sách câu đầu vào:\n"
                    f"{json.dumps(payload, ensure_ascii=False)}"
                )

                gemini_payload = {
                    "contents": [{"parts": [{"text": gemini_prompt}]}],
                    "generationConfig": {
                        "temperature": float(temperature),
                        "response_mime_type": "application/json",
                    },
                }

                for cur_model in candidate_models:
                    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{cur_model}:generateContent?key={gemini_key}"
                    try:
                        async with httpx.AsyncClient(timeout=45.0) as client:
                            resp = await client.post(endpoint, json=gemini_payload)
                            if resp.status_code == 429:
                                await asyncio.sleep(2.0)
                                resp = await client.post(endpoint, json=gemini_payload)
                            if resp.status_code in [404, 503, 429]:
                                continue
                            resp.raise_for_status()
                            data = resp.json()
                            candidates = data.get("candidates", [])
                            if candidates and "content" in candidates[0]:
                                parts = candidates[0]["content"].get("parts", [])
                                if parts:
                                    raw_text = parts[0].get("text", "").strip()
                                    json_match = re.search(r"(\[.*\]|\{.*\})", raw_text, re.DOTALL)
                                    parsed = json.loads(json_match.group(1)) if json_match else json.loads(raw_text)
                                    batch_trans_items = parsed if isinstance(parsed, list) else parsed.get("translations", parsed.get("subtitles", []))
                                    if batch_trans_items:
                                        break
                    except Exception as e:
                        logger.warning(f"[TranslationService] Lỗi Gemini {cur_model}: {e}")
                        continue

            # ── Nhánh 2: OpenAI / DeepSeek ──
            elif selected_provider in ["openai", "deepseek"] and api_key:
                endpoint = f"{base_url.rstrip('/')}/chat/completions" if base_url else "https://api.openai.com/v1/chat/completions"
                req_model = model or ("deepseek-chat" if selected_provider == "deepseek" else "gpt-4o-mini")
                oa_system = (
                    f"Bạn là chuyên gia biên dịch phụ đề video phim ảnh ({src_name} -> {tgt_name}).\n"
                    f"{prompt_rule}\n"
                    f"QUY TẮC: Dịch tự nhiên, chính xác, không gộp câu. "
                    f"Mô phỏng nhịp điệu & ngập ngừng: nếu nhân vật nói ngắt quãng, ấp úng hoặc có khoảng lặng lấy hơi giữa câu, BẮT BUỘC chèn dấu phẩy (,), dấu ba chấm (...) hoặc gạch nối (-) giữa các từ ngữ tiếng Việt. "
                    f"Nếu gặp câu quảng cáo độc lập / CTA xin like & subscribe / outro kênh, đặt 'is_ad': true và 'translated_text': ''. "
                    f"TUYỆT ĐỐI KHÔNG đánh dấu nhầm lời thoại nhân vật có chứa từ thông thường (như 'like' so sánh). "
                    f"CHỈ TRẢ VỀ JSON danh sách [{{\"id\": 1, \"translated_text\": \"...\", \"is_ad\": false}}]."
                )
                oa_payload = {
                    "model": req_model,
                    "messages": [
                        {"role": "system", "content": oa_system},
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                    "temperature": float(temperature),
                }
                try:
                    async with httpx.AsyncClient(timeout=60.0) as client:
                        resp = await client.post(
                            endpoint,
                            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                            json=oa_payload,
                        )
                        resp.raise_for_status()
                        oa_content = resp.json()["choices"][0]["message"]["content"].strip()
                        json_match = re.search(r"(\[.*\]|\{.*\})", oa_content, re.DOTALL)
                        parsed = json.loads(json_match.group(1)) if json_match else json.loads(oa_content)
                        batch_trans_items = parsed if isinstance(parsed, list) else parsed.get("translations", parsed.get("subtitles", []))
                except Exception as e:
                    logger.warning(f"[TranslationService] Lỗi {selected_provider}: {e}")

            # 2. Xử lý kết quả trả về bằng Dict Mapping theo ID:
            chunk_ad_ids: set[Any] = set()
            if batch_trans_items:
                for item in batch_trans_items:
                    if not isinstance(item, dict) or "id" not in item:
                        continue
                    item_id = item["id"]
                    is_ad = (
                        item.get("is_ad") is True
                        or str(item.get("is_ad", "")).lower() in ["true", "1", "yes"]
                        or str(item.get("translated_text", "")).strip().upper() in ["[AD_SKIP]", "[SKIP]", "[AD]"]
                    )
                    if is_ad:
                        chunk_ad_ids.add(item_id)
                        all_ad_ids.add(item_id)
                        orig_sample = next((s.get("text", "") for s in chunk if s.get("id") == item_id), "")
                        logger.info(f"🛡️ [LLM Ad Filter] AI phát hiện câu quảng cáo/CTA (ID {item_id}): '{orig_sample}' -> Đã loại bỏ")
                    else:
                        trans_text = item.get("translated_text", item.get("text", ""))
                        if trans_text:
                            trans_map[item_id] = trans_text

                    if item.get("speaker"):
                        speaker_map[item_id] = str(item["speaker"]).strip()

            # Fallback Google Translate cho các câu bị sót hoặc khi dùng chế độ Google
            missing_in_chunk = [
                s for s in chunk
                if s["id"] not in trans_map and s["id"] not in chunk_ad_ids and not str(trans_map.get(s["id"], "")).strip()
            ]
            if missing_in_chunk:
                try:
                    chunk_texts = [s.get("text", "") for s in missing_in_chunk]
                    fb_texts = await GoogleTranslator.translate_batch_texts(
                        texts=chunk_texts,
                        source_lang=source_lang,
                        target_lang=target_lang,
                    )
                    for s, fb_txt in zip(missing_in_chunk, fb_texts):
                        if fb_txt and fb_txt.strip():
                            trans_map[s["id"]] = fb_txt.strip()
                except Exception as e:
                    logger.error(f"[TranslationService] Fallback Google Translate lỗi: {e}")

            await asyncio.sleep(0.05)

        # Ráp kết quả dịch ngược lại danh sách segments gốc bằng ID:
        final_segments: list[dict[str, Any]] = []
        for seg in segments:
            seg_id = seg["id"]
            if seg_id in all_ad_ids:
                logger.info(f"🛡️ [TranslationService] Bỏ qua câu quảng cáo do LLM phát hiện: ID {seg_id} ('{seg.get('original_text', seg.get('text', ''))[:40]}...')")
                continue

            if seg_id in trans_map and str(trans_map[seg_id]).strip():
                seg["text"] = clean_translated_text(str(trans_map[seg_id]).strip())

            if seg_id in speaker_map and speaker_map[seg_id].strip():
                seg["speaker"] = speaker_map[seg_id].strip()

            final_segments.append(seg)

        if not final_segments and segments:
            logger.warning("[TranslationService] Toàn bộ segments bị đánh dấu là ad, hủy bỏ bộ lọc để tránh rỗng phụ đề.")
            return segments

        return final_segments
