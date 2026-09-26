"""
app/services/translation_memory_service.py
─────────────────────────────────────────
Dịch vụ Bộ nhớ dịch thuật & Tự học từ bản sửa của người dùng (Translation Memory / Active Learning):
- Tự động so sánh (diff) khi người dùng sửa phụ đề và bấm Lưu / Lồng tiếng lại
- Ghi nhận: Câu gốc tiếng Trung -> Câu AI dịch ban đầu -> Câu người dùng đã sửa chuẩn
- Nạp tự động các bài học (Few-Shot In-Context Learning) vào prompt của AI cho các video sau
- Cung cấp API quản lý danh sách kinh nghiệm học tập
"""

import os
import re
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from app.core.config import PRESETS_DIR, logger

MEMORY_FILE = PRESETS_DIR / "translation_memory.json"


class TranslationMemoryService:
    @classmethod
    def _ensure_file(cls) -> Path:
        if not MEMORY_FILE.exists():
            MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
            MEMORY_FILE.write_text("[]", encoding="utf-8")
        return MEMORY_FILE

    @classmethod
    def get_all_memories(
        cls,
        source_lang: str | None = None,
        target_lang: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Lấy danh sách tất cả các câu kinh nghiệm mà AI đã học từ người dùng."""
        cls._ensure_file()
        try:
            raw = MEMORY_FILE.read_text(encoding="utf-8")
            data = json.loads(raw)
            if not isinstance(data, list):
                return []
            
            # Lọc theo ngôn ngữ nếu có yêu cầu
            filtered = []
            for item in data:
                if source_lang and item.get("source_lang") and item.get("source_lang") != source_lang:
                    continue
                if target_lang and item.get("target_lang") and item.get("target_lang") != target_lang:
                    continue
                filtered.append(item)

            # Sắp xếp mới nhất lên đầu
            filtered.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
            return filtered[:limit]
        except Exception as e:
            logger.error(f"Lỗi đọc file translation_memory.json: {e}")
            return []

    @classmethod
    def save_all_memories(cls, memories: list[dict[str, Any]]) -> None:
        """Ghi danh sách kinh nghiệm vào file JSON an toàn."""
        cls._ensure_file()
        try:
            # Ghi file tạm rồi đổi tên để tránh hỏng dữ liệu nếu bị ngắt đột ngột
            tmp_file = MEMORY_FILE.with_suffix(".tmp")
            tmp_file.write_text(json.dumps(memories, ensure_ascii=False, indent=2), encoding="utf-8")
            if tmp_file.exists():
                tmp_file.replace(MEMORY_FILE)
        except Exception as e:
            logger.error(f"Lỗi ghi file translation_memory.json: {e}")

    @classmethod
    def add_or_update_memory(
        cls,
        source_text: str,
        user_corrected: str,
        ai_translated: str = "",
        source_lang: str = "zh",
        target_lang: str = "vi",
        task_id: str = "",
    ) -> dict[str, Any] | None:
        """Thêm hoặc cập nhật một câu kinh nghiệm đã học."""
        src = source_text.strip()
        corrected = user_corrected.strip()
        ai_orig = ai_translated.strip()

        if not src or not corrected:
            return None
        # Nếu câu sửa hoàn toàn giống câu AI dịch ban đầu thì không cần học
        if corrected.lower() == ai_orig.lower():
            return None

        memories = cls.get_all_memories(limit=1000)
        existing_idx = -1
        for idx, m in enumerate(memories):
            if m.get("source_text", "").strip() == src and m.get("target_lang", "vi") == target_lang:
                existing_idx = idx
                break

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if existing_idx >= 0:
            # Cập nhật kinh nghiệm cũ với bản sửa mới nhất của người dùng
            item = memories[existing_idx]
            item["ai_translated"] = ai_orig or item.get("ai_translated", "")
            item["user_corrected"] = corrected
            item["use_count"] = item.get("use_count", 1) + 1
            item["updated_at"] = now_str
            item["task_id"] = task_id or item.get("task_id", "")
        else:
            item = {
                "id": f"mem_{uuid.uuid4().hex[:10]}",
                "source_text": src,
                "ai_translated": ai_orig,
                "user_corrected": corrected,
                "source_lang": source_lang or "zh",
                "target_lang": target_lang or "vi",
                "task_id": task_id,
                "created_at": now_str,
                "updated_at": now_str,
                "use_count": 1,
            }
            memories.insert(0, item)

        # Giữ tối đa 500 bài học chất lượng nhất
        if len(memories) > 500:
            memories = memories[:500]

        cls.save_all_memories(memories)
        return item

    @classmethod
    def learn_from_srt_diff(
        cls,
        task_id: str,
        new_srt_content: str,
        current_srt_content: str | None = None,
        orig_srt_content: str | None = None,
        source_lang: str = "zh",
        target_lang: str = "vi",
    ) -> list[dict[str, Any]]:
        """
        So sánh nội dung SRT người dùng vừa sửa với nội dung cũ và câu gốc:
        - Phát hiện mọi câu thoại có thay đổi
        - Tự động nạp vào bộ nhớ học tập
        """
        from app.services.video_translation_pipeline import VideoTranslationPipeline, TRANSLATE_OUTPUT_DIR

        task_dir = TRANSLATE_OUTPUT_DIR / task_id

        # Lấy nội dung SRT ban đầu nếu chưa truyền
        if current_srt_content is None:
            srt_path = task_dir / "subtitles.srt"
            if srt_path.exists():
                try:
                    current_srt_content = srt_path.read_text(encoding="utf-8")
                except Exception:
                    current_srt_content = ""

        # Lấy nội dung SRT tiếng Trung gốc nếu chưa truyền
        if orig_srt_content is None:
            orig_path = task_dir / "subtitles_original.srt"
            if orig_path.exists():
                try:
                    orig_srt_content = orig_path.read_text(encoding="utf-8")
                except Exception:
                    orig_srt_content = ""

        new_entries = VideoTranslationPipeline.parse_srt_content(new_srt_content)
        current_entries = VideoTranslationPipeline.parse_srt_content(current_srt_content or "")
        orig_entries = VideoTranslationPipeline.parse_srt_content(orig_srt_content or "")

        # Tạo map theo ID hoặc vị trí
        curr_map = {e["id"]: e.get("text", "").strip() for e in current_entries}
        orig_map = {e["id"]: e.get("text", "").strip() for e in orig_entries}

        learned_items = []
        for e in new_entries:
            seg_id = e.get("id")
            new_text = e.get("text", "").strip()
            old_text = curr_map.get(seg_id, "")
            orig_text = orig_map.get(seg_id, "")

            # Nếu không tìm thấy theo seg_id, thử đối chiếu theo index tương đối
            if not orig_text and 0 <= (seg_id - 1) < len(orig_entries):
                orig_text = orig_entries[seg_id - 1].get("text", "").strip()

            # Nếu người dùng có thay đổi câu này và có bản gốc
            if new_text and old_text and new_text != old_text and orig_text:
                learned = cls.add_or_update_memory(
                    source_text=orig_text,
                    user_corrected=new_text,
                    ai_translated=old_text,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    task_id=task_id,
                )
                if learned:
                    learned_items.append(learned)

        if learned_items:
            logger.info(f"🧠 [Translation Memory] Đã học được {len(learned_items)} câu chỉnh sửa mới từ task {task_id}!")
        return learned_items

    @classmethod
    def get_relevant_memories(
        cls,
        source_texts: list[str],
        source_lang: str = "zh",
        target_lang: str = "vi",
        limit: int = 12,
    ) -> list[dict[str, Any]]:
        """
        Tìm kiếm các bài học kinh nghiệm có liên quan nhất với danh sách câu đầu vào:
        1. Khớp từ khóa / cụm từ tiếng Trung
        2. Nếu không khớp từ khóa cụ thể, lấy các bài học mới nhất để AI duy trì văn phong chuẩn
        """
        all_mems = cls.get_all_memories(source_lang=source_lang, target_lang=target_lang, limit=300)
        if not all_mems:
            return []

        # Chuẩn hóa chuỗi văn bản đầu vào để tìm kiếm
        combined_inputs = " ".join(source_texts).lower()

        scored_mems = []
        for m in all_mems:
            src = m.get("source_text", "").strip().lower()
            if not src:
                continue

            score = 0.0
            # Nếu toàn bộ câu gốc hoặc cụm từ xuất hiện trong văn bản đầu vào
            if src in combined_inputs:
                score += 15.0
            else:
                # Kiểm tra trùng lặp ký tự (đặc biệt hiệu quả với tiếng Trung hoặc danh xưng)
                shared_chars = sum(1 for char in set(src) if char in combined_inputs and char not in " ，。！？,.!? ")
                if shared_chars >= 2:
                    score += float(shared_chars) * 1.5

            # Thêm điểm số theo tần suất sử dụng
            score += min(float(m.get("use_count", 1)), 5.0)

            scored_mems.append((score, m))

        # Sắp xếp theo điểm số giảm dần
        scored_mems.sort(key=lambda x: x[0], reverse=True)

        results = []
        # Lấy các bài học có điểm trùng khớp trước
        for score, m in scored_mems:
            if score > 1.0 and len(results) < limit:
                results.append(m)

        # Nếu còn chỗ trống, bổ sung thêm các bài học mới nhất gần đây để AI học ngữ điệu người dùng
        if len(results) < limit:
            for _, m in scored_mems:
                if m not in results and len(results) < limit:
                    results.append(m)

        return results

    @classmethod
    def format_prompt_memory_section(cls, memories: list[dict[str, Any]]) -> str:
        """Định dạng các bài học kinh nghiệm thành prompt chuẩn cho Gemini / AI."""
        if not memories:
            return ""

        lines = [
            "\n* BỘ NHỚ HỌC TẬP TỪ NGƯỜI DÙNG (TRANSLATION MEMORY - KINH NGHIỆM ĐÃ DẠY):",
            "Người dùng đã trực tiếp sửa đổi các câu mẫu dưới đây ở các video trước.",
            "Hãy HỌC TẬP văn phong, thuật ngữ, xưng hô này và TUYỆT ĐỐI ƯU TIÊN dịch theo cách người dùng đã dạy, không lặp lại lỗi cũ:",
        ]

        for i, m in enumerate(memories, 1):
            src = m.get("source_text", "").strip()
            user_res = m.get("user_corrected", "").strip()
            ai_bad = m.get("ai_translated", "").strip()

            line_str = f"  {i}. Gốc: \"{src}\" ➔ Dịch chuẩn: \"{user_res}\""
            if ai_bad and ai_bad != user_res:
                line_str += f" (LƯU Ý: Tránh dịch sai thành: \"{ai_bad}\")"
            lines.append(line_str)

        lines.append("")
        return "\n".join(lines)

    @classmethod
    def delete_memory(cls, memory_id: str) -> bool:
        """Xóa một mục kinh nghiệm khỏi bộ nhớ."""
        cls._ensure_file()
        memories = cls.get_all_memories(limit=1000)
        initial_len = len(memories)
        memories = [m for m in memories if m.get("id") != memory_id]
        if len(memories) < initial_len:
            cls.save_all_memories(memories)
            return True
        return False

    @classmethod
    def clear_all_memories(cls) -> bool:
        """Xóa toàn bộ bộ nhớ học tập."""
        cls.save_all_memories([])
        return True
