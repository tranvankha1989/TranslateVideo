import os
import json
import uuid
import shutil
import hashlib
import random as _random
import asyncio
from pathlib import Path
from fastapi import HTTPException, UploadFile, BackgroundTasks

import librosa
import soundfile as sf
import numpy as np

from app.core.config import (
    BASE_DIR,
    OUTPUTS_DIR,
    PRESETS_DIR,
    CUSTOM_VOICES_DIR,
    CUSTOM_VOICES_JSON,
    USER_CUSTOM_VOICES_JSON,
    logger,
)
from app.schemas.voice import RandomVoiceRequest
from app.services.tts_service import cleanup_old_files
from model_handler import (
    SAMPLE_RATE,
    create_voice_prompt,
    generate_audio,
)

_RANDOM_GENDER = ["male", "female"]
_RANDOM_AGE = ["child", "teenager", "young adult", "middle-aged", "elderly"]
_RANDOM_PITCH = [
    "very low pitch", "low pitch", "moderate pitch", "high pitch", "very high pitch",
]
_RANDOM_STYLE = [
    None, "warm", "cheerful", "calm", "serious", "enthusiastic", "mysterious", "whisper"
]


async def fetch_all_voices() -> list[dict]:
    voices = []
    voices_json = PRESETS_DIR / "voices.json"
    if voices_json.exists():
        with open(voices_json, "r", encoding="utf-8") as f:
            voices.extend(json.load(f))

    # 1. Nạp giọng mẫu hệ thống từ custom_voices.json
    if CUSTOM_VOICES_JSON.exists():
        try:
            with open(CUSTOM_VOICES_JSON, "r", encoding="utf-8") as f:
                custom_voices = json.load(f)
                voices.extend(custom_voices)
        except Exception as e:
            logger.warning(f"Lỗi đọc custom_voices.json: {e}")

    # 2. Nạp giọng cá nhân do khách hàng tự tạo từ custom_voices_user.json (bảo vệ tuyệt đối khi git pull)
    if USER_CUSTOM_VOICES_JSON.exists():
        try:
            with open(USER_CUSTOM_VOICES_JSON, "r", encoding="utf-8") as f:
                user_voices = json.load(f)
                for uv in user_voices:
                    if not any(v.get("id") == uv.get("id") for v in voices):
                        voices.append(uv)
        except Exception as e:
            logger.warning(f"Lỗi đọc custom_voices_user.json: {e}")

    # 3. Cơ chế Auto-Discovery / Auto-Recovery:
    # Quét thư mục custom/ nếu phát hiện file .pt của khách mà chưa có trong danh sách sẽ tự phục hồi 100%
    existing_ids = {v.get("id") for v in voices if isinstance(v, dict)}
    for pt_file in CUSTOM_VOICES_DIR.glob("*.pt"):
        v_id = pt_file.stem
        if v_id not in existing_ids:
            wav_candidate = CUSTOM_VOICES_DIR / f"{v_id}.wav"
            recovered_voice = {
                "id": v_id,
                "name": v_id.replace("custom_", "Giọng Custom "),
                "gender": "other",
                "description": "Giọng tự tạo (Đã tự động phục hồi)",
                "icon": "record_voice_over",
                "url": f"http://localhost:8000/presets/custom/{v_id}.wav" if wav_candidate.exists() else "",
                "prompt_text": "",
                "type": "custom",
                "has_cache_pt": True,
                "samples_count": 1,
                "duration": 5.0,
            }
            voices.append(recovered_voice)
            existing_ids.add(v_id)

    return voices


def clean_audio_sample(input_path: Path, output_path: Path) -> Path:
    """
    Tách lọc nhạc nền và tạp âm cho mẫu giọng nói bằng bộ lọc FFmpeg âm thanh chuyên nghiệp:
    - Highpass 80Hz: Khử rung ù tần số thấp
    - Lowpass 10000Hz: Khử tiếng rít chói tai
    - Afftdn: Khử nhiễu nền
    - Dynaudnorm: Cân bằng biên độ âm học
    """
    try:
        import subprocess
        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_path),
            "-af", "highpass=f=80,lowpass=f=10000,afftdn=nf=-25dB,dynaudnorm=p=0.9:m=10.0",
            "-ar", "24000",
            "-ac", "1",
            str(output_path),
        ]
        res = subprocess.run(cmd, capture_output=True)
        if res.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
            return output_path
    except Exception as e:
        logger.warning(f"Lỗi lọc tạp âm FFmpeg: {e}, dùng file gốc thay thế.")
    return input_path


async def clone_custom_voice(
    files: list[UploadFile] | UploadFile,
    name: str,
    transcript: str | None = None,
    transcripts: list[str] | str | None = None,
    description: str = "Giọng tự tạo",
    gender: str = "all",
    icon: str = "record_voice_over",
    separate_vocals: bool = False,
) -> dict:
    """
    Clone giọng đọc từ 1 hoặc nhiều mẫu âm thanh tham chiếu (Multi-Sample Reference).
    Ghép các mẫu âm thanh kèm khoảng lặng phân tách 250ms, chuẩn hóa biên độ
    và trích xuất đặc trưng giọng nói toàn diện cho mô hình OmniVoice.
    """
    # Chuẩn hóa danh sách files (hỗ trợ cả 1 file lẻ lẫn danh sách nhiều files)
    file_list: list[UploadFile] = files if isinstance(files, list) else [files]
    if not file_list:
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp ít nhất 1 file âm thanh mẫu")

    # Chuẩn hóa danh sách transcripts
    transcript_list: list[str] = []
    if transcripts:
        if isinstance(transcripts, list):
            transcript_list = [str(t).strip() for t in transcripts]
        elif isinstance(transcripts, str):
            try:
                parsed = json.loads(transcripts)
                if isinstance(parsed, list):
                    transcript_list = [str(t).strip() for t in parsed]
                else:
                    transcript_list = [transcripts.strip()]
            except Exception:
                transcript_list = [transcripts.strip()]
    elif transcript and transcript.strip():
        transcript_list = [transcript.strip()]

    custom_id = f"custom_{uuid.uuid4().hex[:8]}"
    temp_paths: list[Path] = []
    loaded_audios: list[np.ndarray] = []

    try:
        for idx, f in enumerate(file_list):
            fname = f.filename or f"sample_{idx}.wav"
            if not fname.lower().endswith((".wav", ".mp3", ".m4a", ".webm", ".ogg")):
                raise HTTPException(
                    status_code=400, detail=f"File '{fname}' không đúng định dạng (.wav, .mp3, .m4a, .webm, .ogg)"
                )

            temp_path = BASE_DIR / f"temp_{custom_id}_{idx}_{fname}"
            temp_paths.append(temp_path)

            with open(temp_path, "wb") as buffer:
                shutil.copyfileobj(f.file, buffer)

            # Nếu bật tùy chọn tách nhạc nền & tạp âm
            load_target = temp_path
            if separate_vocals:
                cleaned_path = BASE_DIR / f"clean_{custom_id}_{idx}.wav"
                temp_paths.append(cleaned_path)
                load_target = clean_audio_sample(temp_path, cleaned_path)

            # Load audio về 24,000Hz mono
            y, _ = librosa.load(str(load_target), sr=SAMPLE_RATE)
            if len(y) > 0:
                # 1. Peak Normalize từng mẫu để cân bằng âm lượng
                peak = np.max(np.abs(y))
                if peak > 0:
                    y = (y / peak) * 0.90

                # 2. Áp dụng micro fade 10ms ở đầu và cuối để khử click khi ghép
                fade_samples = min(int(SAMPLE_RATE * 0.01), len(y) // 4)
                if fade_samples > 0:
                    fade_in = np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
                    fade_out = np.linspace(1.0, 0.0, fade_samples, dtype=np.float32)
                    y[:fade_samples] *= fade_in
                    y[-fade_samples:] *= fade_out

                loaded_audios.append(y)

        if not loaded_audios:
            raise HTTPException(status_code=400, detail="Không thể đọc được dữ liệu âm thanh từ các file tải lên")

        # 3. Ghép các mẫu âm thanh với khoảng lặng 250ms giữa các mẫu
        silence_gap = np.zeros(int(SAMPLE_RATE * 0.25), dtype=np.float32)
        combined_chunks: list[np.ndarray] = []
        for i, chunk in enumerate(loaded_audios):
            combined_chunks.append(chunk)
            if i < len(loaded_audios) - 1:
                combined_chunks.append(silence_gap)

        combined_audio = np.concatenate(combined_chunks)

        # 4. Giới hạn thời lượng tham chiếu tối ưu (tối đa 25.0 giây)
        max_total_samples = int(SAMPLE_RATE * 25.0)
        if len(combined_audio) > max_total_samples:
            combined_audio = combined_audio[:max_total_samples]
            logger.info(f"ℹ️ Đã tự động cắt mẫu tham chiếu tổng hợp về mức tối ưu 25.0s")

        total_duration = round(len(combined_audio) / SAMPLE_RATE, 1)

        # 5. Ghép nối chuỗi văn bản tương ứng
        combined_transcript: str | None = None
        if transcript_list:
            clean_parts = [t.strip().rstrip(".") for t in transcript_list if t.strip()]
            if clean_parts:
                combined_transcript = ". ".join(clean_parts) + "."

        # 6. Ghi file audio hoàn chỉnh ra đĩa
        wav_path = CUSTOM_VOICES_DIR / f"{custom_id}.wav"
        sf.write(str(wav_path), combined_audio, SAMPLE_RATE)

        # 7. Trích xuất đặc trưng VoiceClonePrompt (.pt)
        pt_path = CUSTOM_VOICES_DIR / f"{custom_id}.pt"
        has_pt = False
        try:
            prompt = create_voice_prompt(
                ref_audio=str(wav_path),
                ref_text=combined_transcript,
            )
            prompt.save(str(pt_path))
            has_pt = True
            logger.info(f"✅ Đã tạo và lưu cache VoiceClonePrompt ({len(file_list)} mẫu, {total_duration}s): {pt_path.name}")
        except Exception as pe:
            logger.warning(f"⚠️ Không thể tạo trước prompt .pt (sẽ tạo lại khi gọi tts): {pe}")

        # 8. Lưu metadata vào custom_voices_user.json (BẢO TOÀN TUYỆT ĐỐI KHI GIT PULL) và custom_voices.json
        new_voice = {
            "id": custom_id,
            "name": name,
            "gender": gender,
            "description": description,
            "icon": icon,
            "url": f"http://localhost:8000/presets/custom/{custom_id}.wav",
            "prompt_text": combined_transcript or "",
            "type": "custom",
            "has_cache_pt": has_pt,
            "samples_count": len(file_list),
            "duration": total_duration,
        }
        _save_user_custom_voice(new_voice)

        return {
            "message": f"Clone giọng đọc thành công từ {len(file_list)} mẫu âm thanh ({total_duration}s)!",
            "voice": new_voice,
            "pt_cached": has_pt,
        }

    except Exception as e:
        logger.exception("Lỗi khi clone giọng đọc đa mẫu")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for p in temp_paths:
            p.unlink(missing_ok=True)


def _save_user_custom_voice(new_voice: dict) -> None:
    """Lưu metadata giọng tự tạo vào cả custom_voices_user.json và custom_voices.json."""
    for json_path in (USER_CUSTOM_VOICES_JSON, CUSTOM_VOICES_JSON):
        try:
            voices = []
            if json_path.exists():
                with open(json_path, "r", encoding="utf-8") as f:
                    voices = json.load(f)
            voices = [v for v in voices if isinstance(v, dict) and v.get("id") != new_voice.get("id")]
            voices.append(new_voice)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(voices, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"Lỗi khi lưu giọng vào {json_path.name}: {e}")


async def remove_custom_voice(voice_id: str) -> dict:
    if not voice_id.startswith("custom_"):
        raise HTTPException(status_code=400, detail="Chỉ được phép xoá giọng tự tạo")

    deleted = False
    for json_path in (USER_CUSTOM_VOICES_JSON, CUSTOM_VOICES_JSON):
        if json_path.exists():
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    voices = json.load(f)
                filtered = [v for v in voices if isinstance(v, dict) and v.get("id") != voice_id]
                if len(filtered) < len(voices):
                    with open(json_path, "w", encoding="utf-8") as f:
                        json.dump(filtered, f, ensure_ascii=False, indent=2)
                    deleted = True
            except Exception as e:
                logger.warning(f"Lỗi xóa giọng khỏi {json_path.name}: {e}")

    wav_path = CUSTOM_VOICES_DIR / f"{voice_id}.wav"
    wav_path.unlink(missing_ok=True)

    pt_path = CUSTOM_VOICES_DIR / f"{voice_id}.pt"
    pt_path.unlink(missing_ok=True)

    if deleted or not wav_path.exists():
        return {"message": "Đã xoá giọng đọc và bộ đệm thành công"}

    raise HTTPException(status_code=404, detail="Không tìm thấy giọng đọc")


async def generate_random_preview(
    background_tasks: BackgroundTasks,
    req: RandomVoiceRequest | None = None,
) -> dict:
    # 1. Xác định giới tính
    if req and req.gender and req.gender not in ("all", "random"):
        gender = req.gender.strip().lower()
    else:
        gender = _random.choice(_RANDOM_GENDER)

    # 2. Xác định độ tuổi
    if req and req.age and req.age not in ("all", "random"):
        age = req.age.strip().lower()
    else:
        age = _random.choice(_RANDOM_AGE)

    # 3. Xác định cao độ
    if req and req.pitch and req.pitch not in ("all", "random"):
        pitch = req.pitch.strip().lower()
    else:
        pitch = _random.choice(_RANDOM_PITCH)

    # 4. Xác định phong cách / cảm xúc
    if req and req.style and req.style not in ("all", "random", "none"):
        style = req.style.strip().lower()
    else:
        style = _random.choice(_RANDOM_STYLE)

    parts = [gender, age, pitch]
    if style:
        parts.append(style)
    instruct_str = ", ".join(parts)

    # 5. Câu văn đọc thử nghiệm
    if req and req.preview_text and req.preview_text.strip():
        preview_text = req.preview_text.strip()
    else:
        preview_text = (
            "Xin chào, đây là giọng đọc thử nghiệm. "
            "Chất lượng giọng này được tổng hợp bởi OmniVoice hai mươi bốn kilohertz."
        )

    # 6. Hạt giống sinh âm thanh (Seed)
    seed = req.seed if (req and req.seed is not None and req.seed >= 0) else _random.randint(0, 99999)

    cache_str = f"random_{instruct_str}_{seed}_{hashlib.md5(preview_text.encode()).hexdigest()[:8]}"
    file_hash = hashlib.md5(cache_str.encode()).hexdigest()
    filename = f"random_preview_{file_hash}.mp3"
    output_path = OUTPUTS_DIR / filename

    try:
        await asyncio.to_thread(
            generate_audio,
            text=preview_text,
            output_path=output_path,
            mode="design",
            instruct=instruct_str,
            cfg_value=2.0,
            num_step=int(os.getenv("DEFAULT_NUM_STEP", "32")),
            seed=seed,
            speed=1.0,
            pitch=0.0,
            audio_format="mp3",
        )
    except Exception as e:
        logger.exception("Lỗi khi sinh giọng ngẫu nhiên")
        raise HTTPException(status_code=500, detail=str(e))

    background_tasks.add_task(cleanup_old_files)

    return {
        "message": "Tạo giọng ngẫu nhiên thành công!",
        "audio_url": f"http://localhost:8000/outputs/{filename}",
        "filename": filename,
        "instruct": instruct_str,
        "seed": seed,
        "gender": gender,
        "age": age,
        "pitch": pitch,
        "style": style,
        "preview_text": preview_text,
    }


async def discard_preview_voice(filename: str) -> dict:
    safe_filename = os.path.basename(filename)
    file_path = OUTPUTS_DIR / safe_filename
    if file_path.exists() and file_path.is_file():
        file_path.unlink()
        logger.info(f"🗑️ Đã xoá file preview ngẫu nhiên bị huỷ: {safe_filename}")
        return {"message": f"Đã xoá file preview {safe_filename}"}

    return {"message": "File không tồn tại hoặc đã được xoá trước đó"}


async def save_preview_as_custom_voice(
    name: str,
    description: str,
    gender: str,
    icon: str,
    filename: str,
    instruct: str,
) -> dict:
    src_path = OUTPUTS_DIR / Path(filename).name
    if not src_path.exists():
        raise HTTPException(
            status_code=404,
            detail="File preview không còn tồn tại. Hãy tạo lại giọng ngẫu nhiên.",
        )

    custom_id = f"custom_{uuid.uuid4().hex[:8]}"
    wav_path = CUSTOM_VOICES_DIR / f"{custom_id}.wav"
    pt_path = CUSTOM_VOICES_DIR / f"{custom_id}.pt"

    try:
        y, sr_loaded = librosa.load(str(src_path), sr=SAMPLE_RATE, duration=15.0)
        sf.write(str(wav_path), y, sr_loaded)

        has_pt = False
        try:
            prompt = create_voice_prompt(ref_audio=str(wav_path), ref_text=None)
            prompt.save(str(pt_path))
            has_pt = True
            logger.info(f"✅ Đã tạo VoiceClonePrompt từ giọng random: {pt_path.name}")
        except Exception as pe:
            logger.warning(f"⚠️ Không thể tạo .pt cho giọng random: {pe}")

        new_voice = {
            "id": custom_id,
            "name": name,
            "gender": gender,
            "description": description or "Giọng ngẫu nhiên",
            "icon": icon or "casino",
            "url": f"http://localhost:8000/presets/custom/{custom_id}.wav",
            "prompt_text": "",
            "type": "custom",
            "instruct": instruct,
            "has_cache_pt": has_pt,
        }
        _save_user_custom_voice(new_voice)

        try:
            src_path.unlink(missing_ok=True)
            logger.info(f"🗑️ Đã xoá file preview tạm sau khi lưu thành công: {src_path.name}")
        except Exception:
            pass

        return {
            "message": "Đã lưu giọng ngẫu nhiên thành custom voice!",
            "voice": new_voice,
            "pt_cached": has_pt,
        }

    except Exception as e:
        logger.exception("Lỗi khi lưu giọng ngẫu nhiên")
        raise HTTPException(status_code=500, detail=str(e))
