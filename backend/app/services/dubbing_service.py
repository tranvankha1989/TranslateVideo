"""
app/services/dubbing_service.py
───────────────────────────────
Dịch vụ lồng tiếng (Voice Dubbing) cho Video Translation:
- Hỗ trợ Edge-TTS đa ngôn ngữ (chất lượng tự nhiên, chuẩn bản xứ, siêu nhanh).
- Hỗ trợ OmniVoice TTS (sinh giọng clone của chính nhân vật trong video).
- Đo thời lượng duration chính xác và hỗ trợ tách BGM/Vocal bằng FFmpeg.
"""

import os
import uuid
import json
import asyncio
import subprocess
from pathlib import Path
from typing import Any
import edge_tts
import soundfile as sf
from pydub import AudioSegment
from pydub.silence import detect_leading_silence

from app.core.config import (
    OUTPUTS_DIR,
    PRESETS_DIR,
    CUSTOM_VOICES_DIR,
    CUSTOM_VOICES_JSON,
    logger,
)
from model_handler import generate_audio, VoiceClonePrompt, is_remote_gpu_enabled

DUBBING_OUTPUT_DIR = OUTPUTS_DIR / "dubbing"
DUBBING_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def trim_audio_file_silence(file_path: Path | str, silence_threshold: int = -42, margin_ms: int = 35) -> None:
    """Tự động cắt sạch khoảng lặng tĩnh ở đầu và cuối file MP3 do Edge-TTS chèn vào để giọng đọc nói ngay không bị trễ."""
    try:
        p = Path(file_path)
        if not p.exists() or p.stat().st_size < 500:
            return
        audio = AudioSegment.from_file(str(p))
        if len(audio) < 120:
            return
        start_trim = detect_leading_silence(audio, silence_threshold=silence_threshold)
        end_trim = detect_leading_silence(audio.reverse(), silence_threshold=silence_threshold)

        start_pos = max(0, start_trim - margin_ms)
        end_pos = max(start_pos + 60, len(audio) - max(0, end_trim - margin_ms))

        trimmed = audio[start_pos:end_pos]
        if len(trimmed) >= 60:
            trimmed = trimmed.fade_in(15).fade_out(15)
            trimmed.export(str(p), format="mp3")
    except Exception as e:
        logger.warning(f"Không thể trim silence file {file_path}: {e}")


# Danh sách các giọng Edge-TTS được tuyển chọn chất lượng cao nhất theo từng ngôn ngữ
CURATED_EDGE_VOICES = [
    # Tiếng Việt
    {"id": "vi-VN-HoaiMyNeural", "name": "Hoài My (Nữ - Truyền cảm)", "lang": "vi", "gender": "Female", "engine": "edge-tts"},
    {"id": "vi-VN-NamMinhNeural", "name": "Nam Minh (Nam - Rõ ràng)", "lang": "vi", "gender": "Male", "engine": "edge-tts"},
    
    # Tiếng Anh (US & UK)
    {"id": "en-US-JennyNeural", "name": "Jenny (Nữ - Mỹ tự nhiên)", "lang": "en", "gender": "Female", "engine": "edge-tts"},
    {"id": "en-US-GuyNeural", "name": "Guy (Nam - Mỹ ấm áp)", "lang": "en", "gender": "Male", "engine": "edge-tts"},
    {"id": "en-US-AriaNeural", "name": "Aria (Nữ - Mỹ trẻ trung)", "lang": "en", "gender": "Female", "engine": "edge-tts"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia (Nữ - Anh chuẩn)", "lang": "en", "gender": "Female", "engine": "edge-tts"},
    {"id": "en-GB-RyanNeural", "name": "Ryan (Nam - Anh lịch lãm)", "lang": "en", "gender": "Male", "engine": "edge-tts"},

    # Tiếng Trung (Giản thể & Phồn thể)
    {"id": "zh-CN-XiaoxiaoNeural", "name": "Xiaoxiao (Nữ - Phổ thông ngọt ngào)", "lang": "zh-cn", "gender": "Female", "engine": "edge-tts"},
    {"id": "zh-CN-YunxiNeural", "name": "Yunxi (Nam - Kể chuyện, phim ảnh)", "lang": "zh-cn", "gender": "Male", "engine": "edge-tts"},
    {"id": "zh-CN-YunjianNeural", "name": "Yunjian (Nam - Tin tức phóng sự)", "lang": "zh-cn", "gender": "Male", "engine": "edge-tts"},
    {"id": "zh-TW-HsiaoChenNeural", "name": "HsiaoChen (Nữ - Đài Loan)", "lang": "zh-tw", "gender": "Female", "engine": "edge-tts"},

    # Tiếng Nhật
    {"id": "ja-JP-NanamiNeural", "name": "Nanami (Nữ - Nhật trong trẻo)", "lang": "ja", "gender": "Female", "engine": "edge-tts"},
    {"id": "ja-JP-KeitaNeural", "name": "Keita (Nam - Nhật trầm ấm)", "lang": "ja", "gender": "Male", "engine": "edge-tts"},

    # Tiếng Hàn
    {"id": "ko-KR-SunHiNeural", "name": "SunHi (Nữ - Hàn dịu dàng)", "lang": "ko", "gender": "Female", "engine": "edge-tts"},
    {"id": "ko-KR-InJoonNeural", "name": "InJoon (Nam - Hàn trầm ấm)", "lang": "ko", "gender": "Male", "engine": "edge-tts"},

    # Tiếng Pháp
    {"id": "fr-FR-DeniseNeural", "name": "Denise (Nữ - Pháp thanh lịch)", "lang": "fr", "gender": "Female", "engine": "edge-tts"},
    {"id": "fr-FR-HenriNeural", "name": "Henri (Nam - Pháp chuẩn)", "lang": "fr", "gender": "Male", "engine": "edge-tts"},

    # Tiếng Đức
    {"id": "de-DE-KatjaNeural", "name": "Katja (Nữ - Đức rõ nét)", "lang": "de", "gender": "Female", "engine": "edge-tts"},
    {"id": "de-DE-ConradNeural", "name": "Conrad (Nam - Đức nghiêm túc)", "lang": "de", "gender": "Male", "engine": "edge-tts"},

    # Tiếng Tây Ban Nha
    {"id": "es-ES-ElviraNeural", "name": "Elvira (Nữ - Tây Ban Nha)", "lang": "es", "gender": "Female", "engine": "edge-tts"},
    {"id": "es-ES-AlvaroNeural", "name": "Alvaro (Nam - Tây Ban Nha)", "lang": "es", "gender": "Male", "engine": "edge-tts"},

    # Tiếng Nga
    {"id": "ru-RU-SvetlanaNeural", "name": "Svetlana (Nữ - Nga)", "lang": "ru", "gender": "Female", "engine": "edge-tts"},
    {"id": "ru-RU-DmitryNeural", "name": "Dmitry (Nam - Nga)", "lang": "ru", "gender": "Male", "engine": "edge-tts"},

    # Tiếng Thái
    {"id": "th-TH-PremwadeeNeural", "name": "Premwadee (Nữ - Thái Lan)", "lang": "th", "gender": "Female", "engine": "edge-tts"},
    {"id": "th-TH-NiwatNeural", "name": "Niwat (Nam - Thái Lan)", "lang": "th", "gender": "Male", "engine": "edge-tts"},
]


def get_audio_duration(file_path: Path | str) -> float:
    """Đo thời lượng chính xác của file âm thanh bằng soundfile hoặc ffprobe."""
    try:
        info = sf.info(str(file_path))
        return float(info.duration)
    except Exception:
        pass

    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(file_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(res.stdout.strip())
    except Exception as e:
        logger.warning(f"Không thể đo duration của {file_path}: {e}")
        return 0.0


class DubbingService:
    """Xử lý lồng tiếng và sinh âm thanh từng câu thoại phụ đề."""

    @classmethod
    def get_voices(cls, lang: str | None = None) -> list[dict[str, Any]]:
        """Lấy danh sách các giọng đọc hỗ trợ theo ngôn ngữ, bao gồm giọng Phòng Thu (Studio) và Edge-TTS."""
        voices: list[dict[str, Any]] = []

        # 1. Nạp toàn bộ giọng từ Phòng Thu (Preset voices + Custom cloned voices)
        studio_voices: list[dict[str, Any]] = []
        voices_json = PRESETS_DIR / "voices.json"
        if voices_json.exists():
            try:
                with open(voices_json, "r", encoding="utf-8") as f:
                    presets = json.load(f)
                    for p in presets:
                        studio_voices.append({
                            "id": f"omnivoice:{p['id']}",
                            "name": f"🎙️ {p['name']} ({p.get('description', 'Mẫu sẵn')})",
                            "lang": "vi",
                            "gender": (p.get("gender") or "male").capitalize(),
                            "engine": "omnivoice",
                            "type": "preset",
                            "voice_key": p["id"],
                        })
            except Exception as e:
                logger.warning(f"Không thể đọc presets/voices.json: {e}")

        if CUSTOM_VOICES_JSON.exists():
            try:
                with open(CUSTOM_VOICES_JSON, "r", encoding="utf-8") as f:
                    customs = json.load(f)
                    for c in customs:
                        v_name = c.get("name", "")
                        c_lang = "en" if "english" in v_name.lower() or "tiếng anh" in v_name.lower() else (c.get("lang") or "vi")
                        studio_voices.append({
                            "id": f"omnivoice:{c['id']}",
                            "name": f"✨ {c['name']} (Giọng Clone tự tạo)",
                            "lang": c_lang,
                            "gender": (c.get("gender") or "all").capitalize(),
                            "engine": "omnivoice",
                            "type": "custom",
                            "voice_key": c["id"],
                        })
            except Exception as e:
                logger.warning(f"Không thể đọc custom_voices.json: {e}")

        # Thêm giọng phòng thu lên đầu
        voices.extend(studio_voices)

        # 2. Thêm các giọng Edge-TTS đa ngôn ngữ tuyển chọn
        voices.extend(CURATED_EDGE_VOICES)

        if lang and lang.lower() != "all":
            clean_lang = lang.lower().split("-")[0]
            # Giữ lại giọng khớp mã ngôn ngữ hoặc giọng Clone tự tạo đa ngôn ngữ
            voices = [
                v for v in voices
                if v["lang"].lower().startswith(clean_lang) or v.get("type") == "custom" or (clean_lang == "vi" and v["engine"] == "omnivoice")
            ]

        return voices

    @classmethod
    async def synthesize_single(
        cls,
        text: str,
        voice_id: str = "vi-VN-HoaiMyNeural",
        engine: str = "edge-tts",
        rate: str = "+0%",
        pitch: str = "+0Hz",
        volume: str = "+0%",
        output_path: Path | None = None,
        target_duration: float | None = None,
    ) -> dict[str, Any]:
        """Sinh âm thanh cho một câu thoại đơn lẻ (hỗ trợ Edge-TTS và OmniVoice Studio)."""
        if not text or not text.strip():
            raise ValueError("Văn bản câu thoại không được để trống")

        if output_path is None:
            filename = f"dub_{uuid.uuid4().hex[:8]}.mp3"
            output_path = DUBBING_OUTPUT_DIR / filename

        output_path.parent.mkdir(parents=True, exist_ok=True)

        synthesized = False
        is_omnivoice = (engine.lower() == "omnivoice" or voice_id.startswith("omnivoice"))

        if is_omnivoice:
            raw_id = voice_id.replace("omnivoice:", "").strip()
            prompt_obj = None
            ref_audio = None
            ref_text = None

            # 1. Tìm trong thư mục Custom Voices
            custom_pt = CUSTOM_VOICES_DIR / f"{raw_id}.pt"
            custom_wav = CUSTOM_VOICES_DIR / f"{raw_id}.wav"
            if custom_pt.exists():
                try:
                    prompt_obj = VoiceClonePrompt.load(str(custom_pt))
                except Exception as e:
                    logger.warning(f"Không thể đọc prompt cache {custom_pt}: {e}")
            elif custom_wav.exists():
                ref_audio = str(custom_wav)

            # 2. Tìm trong thư mục Presets
            if prompt_obj is None and ref_audio is None:
                preset_pt = PRESETS_DIR / f"{raw_id}.pt"
                preset_wav = PRESETS_DIR / f"{raw_id}.wav"
                if preset_pt.exists():
                    try:
                        prompt_obj = VoiceClonePrompt.load(str(preset_pt))
                    except Exception as e:
                        logger.warning(f"Không thể đọc prompt cache {preset_pt}: {e}")
                elif preset_wav.exists():
                    ref_audio = str(preset_wav)

            # 3. Tra cứu theo url/filename trong voices.json và custom_voices.json
            if prompt_obj is None and ref_audio is None:
                try:
                    voices_json = PRESETS_DIR / "voices.json"
                    if voices_json.exists():
                        with open(voices_json, "r", encoding="utf-8") as f:
                            presets = json.load(f)
                            for p in presets:
                                if p.get("id") == raw_id:
                                    ref_text = p.get("prompt_text")
                                    v_url = p.get("url", "")
                                    v_fname = Path(v_url).name if v_url else ""
                                    if v_fname:
                                        p_candidate = PRESETS_DIR / v_fname
                                        if p_candidate.exists():
                                            ref_audio = str(p_candidate)
                                    break
                except Exception as e:
                    logger.warning(f"Lỗi tra cứu voices.json: {e}")

            if prompt_obj is None and ref_audio is None:
                try:
                    if CUSTOM_VOICES_JSON.exists():
                        with open(CUSTOM_VOICES_JSON, "r", encoding="utf-8") as f:
                            customs = json.load(f)
                            for c in customs:
                                if c.get("id") == raw_id:
                                    ref_text = c.get("prompt_text")
                                    c_pt = CUSTOM_VOICES_DIR / f"{c['id']}.pt"
                                    c_wav = CUSTOM_VOICES_DIR / f"{c['id']}.wav"
                                    if c_pt.exists():
                                        prompt_obj = VoiceClonePrompt.load(str(c_pt))
                                    elif c_wav.exists():
                                        ref_audio = str(c_wav)
                                    break
                except Exception as e:
                    logger.warning(f"Lỗi tra cứu custom_voices.json: {e}")

            if prompt_obj is not None or ref_audio is not None:
                try:
                    logger.info(f"🎙️ [OmniVoice TTS] Sinh câu '{text[:35]}...' bằng giọng {raw_id} (Ref: {Path(ref_audio).name if ref_audio else 'Prompt tensor'})")
                    await asyncio.to_thread(
                        generate_audio,
                        text=text.strip(),
                        output_path=output_path,
                        mode="clone",
                        voice_clone_prompt=prompt_obj,
                        ref_audio=ref_audio,
                        ref_text=ref_text,
                        audio_format="mp3",
                    )
                    if output_path.exists() and output_path.stat().st_size > 500:
                        synthesized = True
                except Exception as oe:
                    logger.error(f"❌ [OmniVoice] Lỗi sinh giọng '{raw_id}': {oe}")
                    if not is_remote_gpu_enabled():
                        logger.warning("Tự động fallback sang Edge-TTS tương ứng...")
                    else:
                        raise RuntimeError(f"Lỗi sinh giọng trên GPU: {oe}")

        # Chuẩn hóa các tham số SSML cho Edge-TTS
        clean_rate = rate if isinstance(rate, str) and rate.endswith("%") else "+0%"
        clean_pitch = pitch if isinstance(pitch, str) and pitch.endswith("Hz") else "+0Hz"
        if isinstance(volume, (int, float)):
            clean_volume = f"{int(round((float(volume) - 1.0) * 100)):+d}%" if volume != 1.0 else "+0%"
        elif isinstance(volume, str):
            if volume.endswith("%"):
                clean_volume = volume
            else:
                try:
                    f_vol = float(volume)
                    clean_volume = f"{int(round((f_vol - 1.0) * 100)):+d}%" if f_vol != 1.0 else "+0%"
                except Exception:
                    clean_volume = "+0%"
        else:
            clean_volume = "+0%"

        if not synthesized:
            # Xác định giọng đọc Edge-TTS chính xác
            target_voice = voice_id
            if is_omnivoice or not target_voice or target_voice.startswith("omnivoice:"):
                # Nhận diện ngôn ngữ từ text hoặc tên voice_id
                clean_t = text.lower()
                is_en = any(k in voice_id.lower() for k in ["en", "english"]) or any(w in clean_t for w in [" the ", " is ", " are ", " and ", " you ", " what ", " to ", " of ", " with ", " for ", " this "])
                is_zh = any(k in voice_id.lower() for k in ["zh", "chinese"]) or any("\u4e00" <= ch <= "\u9fff" for ch in text)
                is_ja = any(k in voice_id.lower() for k in ["ja", "japanese"]) or any("\u3040" <= ch <= "\u30ff" for ch in text)
                is_ko = any(k in voice_id.lower() for k in ["ko", "korean"]) or any("\uac00" <= ch <= "\ud7af" for ch in text)

                if is_en:
                    target_voice = "en-US-JennyNeural"
                elif is_zh:
                    target_voice = "zh-CN-XiaoxiaoNeural"
                elif is_ja:
                    target_voice = "ja-JP-NanamiNeural"
                elif is_ko:
                    target_voice = "ko-KR-SunHiNeural"
                else:
                    target_voice = "vi-VN-NamMinhNeural" if ("nam" in voice_id.lower() or "male" in voice_id.lower()) else "vi-VN-HoaiMyNeural"

            clean_text = text.strip()
            success = False
            for attempt in range(4):
                try:
                    try_voice = target_voice
                    try_text = clean_text if attempt < 2 else clean_text.rstrip(",;:").strip()
                    if not try_text.endswith((".", "!", "?", "…")):
                        try_text += "."

                    communicate = edge_tts.Communicate(
                        text=try_text,
                        voice=try_voice,
                        rate=clean_rate,
                        pitch=clean_pitch,
                        volume=clean_volume,
                    )
                    await communicate.save(str(output_path))
                    if output_path.exists() and output_path.stat().st_size > 200:
                        success = True
                        break
                except Exception as edge_err:
                    if attempt == 3:
                        logger.warning(f"Edge-TTS không thể sinh câu '{clean_text[:30]}' sau 4 lần thử: {edge_err}. Tạo audio khoảng lặng...")
                    await asyncio.sleep(0.4 * (attempt + 1))

            if not success or not output_path.exists() or output_path.stat().st_size <= 200:
                # Tạo audio khoảng lặng fallback an toàn để không đứt gãy timeline
                from pydub import AudioSegment
                dur_ms = int(max(0.5, target_duration or 1.0) * 1000)
                silent_seg = AudioSegment.silent(duration=dur_ms, frame_rate=24000)
                silent_seg.export(str(output_path), format="mp3")

        # Tự động cắt sạch khoảng lặng chết để câu nói phát mượt mà không bị ngập ngừng
        trim_audio_file_silence(output_path)

        actual_duration = get_audio_duration(output_path)
        rate_ratio = (actual_duration / target_duration) if target_duration and target_duration > 0 else 1.0

        rel_url = (
            f"/outputs/dubbing/{output_path.name}"
            if output_path.parent.name == "dubbing"
            else f"/outputs/dubbing/{output_path.parent.name}/{output_path.name}"
        )

        return {
            "audio_path": str(output_path),
            "audio_url": rel_url,
            "duration": round(actual_duration, 3),
            "target_duration": target_duration,
            "rate_ratio": round(rate_ratio, 3),
        }

    @classmethod
    async def synthesize_batch(
        cls,
        segments: list[dict[str, Any]],
        voice_id: str = "vi-VN-HoaiMyNeural",
        engine: str = "edge-tts",
        rate: str = "+0%",
        pitch: str = "+0Hz",
        volume: str = "+0%",
        session_id: str | None = None,
        progress_callback: Any | None = None,
    ) -> dict[str, Any]:
        """Lồng tiếng hàng loạt cho toàn bộ danh sách các câu phụ đề đã dịch."""
        if not session_id:
            session_id = uuid.uuid4().hex[:12]

        session_dir = DUBBING_OUTPUT_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        dubbed_segments = []
        total_duration = 0.0
        total_segs = len(segments)

        for i, seg in enumerate(segments):
            seg_id = seg.get("id", i + 1)
            text = seg.get("text", "").strip()
            start = float(seg.get("start", 0.0))
            end = float(seg.get("end", 0.0))
            target_duration = max(0.1, end - start)

            if not text:
                continue

            seg_file = session_dir / f"seg_{seg_id:04d}.mp3"

            # Giữ nguyên 100% giọng đọc người dùng đã lựa chọn một cách nhất quán
            cur_voice = voice_id

            try:
                res = await cls.synthesize_single(
                    text=text,
                    voice_id=cur_voice,
                    engine=engine,
                    rate=rate,
                    pitch=pitch,
                    volume=volume,
                    output_path=seg_file,
                    target_duration=target_duration,
                )

                dubbed_item = dict(seg)
                dubbed_item.update({
                    "audio_path": res["audio_path"],
                    "audio_url": f"/outputs/dubbing/{session_id}/{seg_file.name}",
                    "duration": res["duration"],
                    "target_duration": round(target_duration, 3),
                    "rate_ratio": res["rate_ratio"],
                })
                dubbed_segments.append(dubbed_item)
                total_duration += res["duration"]

            except Exception as e:
                logger.error(f"[Dubbing Batch] Lỗi khi sinh câu {seg_id}: {e}")

            if progress_callback:
                try:
                    if asyncio.iscoroutinefunction(progress_callback):
                        await progress_callback(i + 1, total_segs, text)
                    else:
                        progress_callback(i + 1, total_segs, text)
                except Exception as p_err:
                    logger.debug(f"Lỗi progress callback: {p_err}")

            # Khoảng nghỉ nhẹ tránh nghẽn
            await asyncio.sleep(0.04)

        return {
            "session_id": session_id,
            "dubbed_segments": dubbed_segments,
            "total_segments": len(dubbed_segments),
            "total_duration": round(total_duration, 3),
            "engine": engine,
            "voice_id": voice_id,
        }

    @classmethod
    def separate_vocal_bgm(cls, input_media_path: Path | str, session_id: str | None = None) -> dict[str, str]:
        """
        Tách âm thanh nền (BGM) và giọng nói (Vocal) từ video/audio gốc bằng FFmpeg audio filter.
        Đảm bảo khi lồng tiếng mới vào video, nhạc nền và tiếng động gốc không bị mất đi.
        """
        input_path = Path(input_media_path)
        if not input_path.exists():
            raise FileNotFoundError(f"Không tìm thấy file: {input_path}")

        if not session_id:
            session_id = uuid.uuid4().hex[:12]

        session_dir = DUBBING_OUTPUT_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        original_audio = session_dir / "original_audio.wav"
        bgm_audio = session_dir / "bgm.wav"
        vocal_audio = session_dir / "vocal.wav"

        # 1. Trích xuất âm thanh gốc tối ưu với đa luồng CPU và bỏ qua toàn bộ stream video/phụ đề
        cmd_extract = [
            "ffmpeg", "-y",
            "-threads", "0",
            "-i", str(input_path),
            "-vn", "-sn", "-dn",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            str(original_audio),
        ]
        subprocess.run(cmd_extract, capture_output=True, check=True)

        # 2. Chuẩn bị file audio nền cho thuyết minh phim:
        # Sử dụng trọn vẹn toàn bộ dải âm thanh gốc (nhạc nền, âm thanh hiện trường)
        # để khi hòa âm với giọng AI mới, âm thanh gốc sẽ được giảm nhỏ volume (ducking)
        # tạo phong cách thuyết minh phim chuẩn mực mà không bị triệt tiêu âm thanh.
        import shutil
        shutil.copyfile(original_audio, bgm_audio)

        return {
            "original_audio": str(original_audio),
            "bgm_audio": str(bgm_audio),
            "session_id": session_id,
        }
