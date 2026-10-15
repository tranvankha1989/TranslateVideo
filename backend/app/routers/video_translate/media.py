"""
app/routers/video_translate/media.py
───────────────────────────────────
Router xử lý phát luồng video/audio (HTTP 206 partial streaming),
tải file thành phẩm và tương tác File Explorer.
"""

import os
import json
import urllib.parse
import re
import subprocess
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.core.config import logger
from app.services.dubbing_service import DUBBING_OUTPUT_DIR
from app.services.video_translation_pipeline import (
    VideoTranslationPipeline,
    TRANSLATE_OUTPUT_DIR,
)

router = APIRouter()


@router.get("/stream/{task_id}")
async def stream_translated_video(task_id: str):
    """Endpoint phát luồng (Stream) video cho trình phát web (HTTP 206 Range Request)."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy video")

    candidates = [
        task_dir / "final_translated.mp4",
        *[f for f in task_dir.glob("*.mp4") if not f.name.startswith("input_")],
        *list(task_dir.glob("*.mp4")),
    ]
    for cand in candidates:
        if cand.exists() and cand.is_file():
            return FileResponse(
                path=str(cand),
                media_type="video/mp4",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )

    raise HTTPException(status_code=404, detail="File video chưa sẵn sàng")


@router.get("/stream-raw/{task_id}")
async def stream_raw_video(task_id: str):
    """Phát luồng video gốc (chưa ghép âm thanh thuyết minh) để phục vụ phát Preview Multi-Layer độc lập."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy video")

    raw_candidates = [
        *list(task_dir.glob("input_*.*")),
        *list(task_dir.glob("trimmed_*.*")),
    ]
    for cand in raw_candidates:
        if cand.exists() and cand.is_file() and cand.suffix.lower() in [".mp4", ".mov", ".mkv", ".webm"]:
            return FileResponse(path=str(cand), media_type="video/mp4")

    final_v = task_dir / "final_translated.mp4"
    if final_v.exists():
        return FileResponse(path=str(final_v), media_type="video/mp4")

    raise HTTPException(status_code=404, detail="Không tìm thấy video gốc")


@router.get("/stream-bgm/{task_id}")
async def stream_bgm_audio(task_id: str):
    """Phát luồng file âm thanh nhạc nền (BGM / Ambient) riêng biệt cho Layer 2 trong Studio."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy âm thanh")

    bgm_candidates = [
        task_dir / "no_vocals.wav",
        task_dir / "bgm.wav",
        DUBBING_OUTPUT_DIR / task_id / "bgm.wav",
        task_dir / "bgm_raw.wav",
    ]
    for cand in bgm_candidates:
        if cand.exists() and cand.is_file():
            return FileResponse(path=str(cand), media_type="audio/wav")

    raise HTTPException(status_code=404, detail="Chưa có dải nhạc nền riêng biệt")


@router.get("/download/{task_id}")
async def download_file_endpoint(
    task_id: str,
    file_type: Optional[str] = Query(None, description="Loại file cần tải: 'video', 'srt', 'srt_original', hoặc 'audio'"),
    type: Optional[str] = Query(None, description="Tên bí danh thay thế cho file_type"),
):
    """Endpoint tải file video / phụ đề / âm thanh trực tiếp về máy."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail=f"Không tìm thấy thư mục xử lý của tác vụ '{task_id}'")

    requested_type = (file_type or type or "video").strip().lower()

    # 1. Tải phụ đề gốc (original Whisper SRT)
    if requested_type in ["srt_original", "original_srt", "srt_source", "original", "source_srt"]:
        orig_srt = task_dir / "subtitles_original.srt"
        if not orig_srt.exists():
            orig_candidates = list(task_dir.glob("*original*.srt"))
            if orig_candidates:
                orig_srt = orig_candidates[0]
            else:
                raise HTTPException(status_code=404, detail="Chưa có file phụ đề thoại gốc nào được tạo")
        return FileResponse(
            path=str(orig_srt),
            filename=f"original_subtitles_{task_id}.srt",
            media_type="application/x-subrip",
            headers={"Content-Disposition": f'attachment; filename="original_subtitles_{task_id}.srt"'},
        )

    # 1b. Tải phụ đề gốc kèm Prompt dịch mẫu cho AI
    if requested_type in ["srt_original_prompt", "prompt_txt", "txt_prompt", "prompt", "original_prompt", "srt_prompt"]:
        orig_srt = task_dir / "subtitles_original.srt"
        if not orig_srt.exists():
            orig_candidates = list(task_dir.glob("*original*.srt"))
            if orig_candidates:
                orig_srt = orig_candidates[0]
            else:
                orig_srt = task_dir / "subtitles.srt"
        if not orig_srt.exists():
            raise HTTPException(status_code=404, detail="Chưa có file phụ đề thoại gốc nào được tạo")

        raw_srt = orig_srt.read_text(encoding="utf-8")
        prompt_txt_file = task_dir / "subtitles_with_prompt.txt"
        prompt_content = (
            "Tôi muốn dịch file phụ đề này. Hãy tuân thủ các quy tắc sau:\n"
            "1. Đọc và dịch nội dung bám sát kịch bản, lưu nhớ và nhất quán các danh từ riêng, thuật ngữ.\n"
            "2. Phân tích logic hội thoại và quan hệ nhân vật để xưng hô chuẩn xác theo cốt truyện.\n"
            "3. Kiểm tra mốc thời gian và ngữ pháp để gộp các câu thoại bị ngắt dở dang thành câu hoàn chỉnh trước khi dịch.\n"
            "4. Tối ưu độ dài câu (CPS) và chèn dấu ngắt nghỉ phù hợp để làm giọng đọc AI/thuyết minh.\n"
            "5. Lọc các câu mang tính chất quảng cáo.\n"
            "Đây là file/nội dung phụ đề:\n\n"
            + raw_srt
        )
        prompt_txt_file.write_text(prompt_content, encoding="utf-8")
        return FileResponse(
            path=str(prompt_txt_file),
            filename=f"subtitles_with_prompt_{task_id}.txt",
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="subtitles_with_prompt_{task_id}.txt"'},
        )

    # 2. Tải phụ đề đã dịch
    if requested_type in ["srt", "subtitles", "subtitle", "sub", "translated_srt"]:
        srt_file = task_dir / "subtitles.srt"
        if not srt_file.exists():
            srt_candidates = [f for f in task_dir.glob("*.srt") if "original" not in f.name.lower()]
            if not srt_candidates:
                raise HTTPException(status_code=404, detail="Chưa có file phụ đề SRT dịch nào được tạo")
            srt_file = srt_candidates[0]
        return FileResponse(
            path=str(srt_file),
            filename=f"translated_subtitles_{task_id}.srt",
            media_type="application/x-subrip",
            headers={"Content-Disposition": f'attachment; filename="translated_subtitles_{task_id}.srt"'},
        )

    # 3. Tải file Giọng nói sạch
    if requested_type in ["vocals", "vocal", "voice_only", "clean_vocal"]:
        vocal_file = task_dir / "vocals.wav"
        if not vocal_file.exists():
            vocal_candidates = list(task_dir.glob("*vocal*.wav"))
            if vocal_candidates:
                vocal_file = vocal_candidates[0]
            else:
                raise HTTPException(status_code=404, detail="Chưa có file giọng nói sạch (vocals) nào được tạo")
        return FileResponse(
            path=str(vocal_file),
            filename=f"vocals_{task_id}.wav",
            media_type="audio/wav",
            headers={"Content-Disposition": f'attachment; filename="vocals_{task_id}.wav"'},
        )

    # 4. Tải file Nhạc nền & Hiệu ứng
    if requested_type in ["bgm", "no_vocals", "instrumental", "music"]:
        bgm_file = task_dir / "no_vocals.wav"
        if not bgm_file.exists():
            bgm_file = task_dir / "bgm.wav"
        if not bgm_file.exists():
            bgm_candidates = list(task_dir.glob("*bgm*.wav")) + list(task_dir.glob("*no_vocal*.wav"))
            if bgm_candidates:
                bgm_file = bgm_candidates[0]
            else:
                raise HTTPException(status_code=404, detail="Chưa có file nhạc nền BGM nào được tạo")
        return FileResponse(
            path=str(bgm_file),
            filename=f"bgm_{task_id}.wav",
            media_type="audio/wav",
            headers={"Content-Disposition": f'attachment; filename="bgm_{task_id}.wav"'},
        )

    # 5. Tải âm thanh lồng tiếng hoàn chỉnh
    if requested_type in ["audio", "wav", "mp3"]:
        audio_candidates = list(task_dir.glob("final_*.wav")) or list(task_dir.glob("*.wav"))
        if not audio_candidates:
            raise HTTPException(status_code=404, detail="Chưa có file âm thanh nào được tạo")
        audio_file = audio_candidates[0]
        return FileResponse(
            path=str(audio_file),
            filename=f"dubbed_audio_{task_id}.wav",
            media_type="audio/wav",
            headers={"Content-Disposition": f'attachment; filename="dubbed_audio_{task_id}.wav"'},
        )

    # 6. Mặc định: Tải Video MP4
    candidates = [
        task_dir / "final_translated.mp4",
        *[f for f in task_dir.glob("*.mp4") if not f.name.startswith("input_")],
        *list(task_dir.glob("*.mp4")),
    ]

    orig_name = None
    task_info = VideoTranslationPipeline.get_task(task_id) or {}
    if task_info.get("original_filename"):
        orig_name = Path(task_info["original_filename"]).stem
    elif task_info.get("video_path"):
        orig_name = Path(task_info["video_path"]).stem
    else:
        meta_file = task_dir / "task_meta.json"
        if meta_file.exists():
            try:
                m_data = json.loads(meta_file.read_text(encoding="utf-8"))
                if m_data.get("original_filename"):
                    orig_name = Path(m_data["original_filename"]).stem
                elif m_data.get("video_path"):
                    orig_name = Path(m_data["video_path"]).stem
            except Exception:
                pass
    if not orig_name or orig_name.startswith("input_") or orig_name.startswith("temp_"):
        input_files = list(task_dir.glob("input_*.*"))
        if input_files:
            clean_stem = input_files[0].stem.replace("input_", "")
            if clean_stem:
                orig_name = clean_stem
    if not orig_name:
        orig_name = f"video_{task_id}"

    out_mp4_name = f"{orig_name} Translate buy KhaTran.mp4"
    encoded_mp4 = urllib.parse.quote(out_mp4_name)
    ascii_mp4 = re.sub(r'[^\x00-\x7F]+', '_', out_mp4_name) or "translated_video.mp4"

    for cand in candidates:
        if cand.exists() and cand.is_file() and cand.stat().st_size > 0:
            return FileResponse(
                path=str(cand),
                filename=ascii_mp4,
                media_type="video/mp4",
                headers={"Content-Disposition": f"attachment; filename=\"{ascii_mp4}\"; filename*=UTF-8''{encoded_mp4}"},
            )
    raise HTTPException(status_code=404, detail="File video hoàn thiện chưa sẵn sàng hoặc render chưa hoàn tất")


@router.get("/audio-asset/{task_id}/{asset_name}")
async def get_audio_asset_endpoint(task_id: str, asset_name: str):
    """Endpoint phát âm thanh trực tiếp (Streaming audio player) cho file vocals, bgm hoặc dubbed audio."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy thư mục tác vụ")

    clean_name = Path(asset_name).name.lower()
    target_file = None

    if "vocal" in clean_name and "no_vocal" not in clean_name:
        for fname in ["vocals.wav", "vocal.wav", "raw_audio.wav"]:
            cand = task_dir / fname
            if cand.exists() and cand.is_file() and cand.stat().st_size > 0:
                target_file = cand
                break
    elif "bgm" in clean_name or "no_vocal" in clean_name or "instrumental" in clean_name:
        for fname in ["no_vocals.wav", "bgm.wav", "bgm_raw.wav"]:
            cand = task_dir / fname
            if cand.exists() and cand.is_file() and cand.stat().st_size > 0:
                target_file = cand
                break
    else:
        direct = task_dir / Path(asset_name).name
        if direct.exists() and direct.is_file():
            target_file = direct

    if target_file and target_file.exists() and target_file.is_file():
        return FileResponse(path=str(target_file), media_type="audio/wav")

    raise HTTPException(status_code=404, detail=f"Không tìm thấy file âm thanh '{asset_name}'")


@router.post("/open-editor/{task_id}")
async def open_subtitles_in_external_editor(task_id: str):
    """Mở trực tiếp file subtitles.srt bằng Notepad++ hoặc Notepad trên máy tính."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    srt_file = task_dir / "subtitles.srt"
    if not srt_file.exists():
        raise HTTPException(status_code=404, detail="File phụ đề subtitles.srt chưa được tạo hoặc không tồn tại.")

    abs_path_str = str(srt_file.resolve())
    opened = False
    editor_name = "Notepad"

    npp_paths = [
        r"C:\Program Files\Notepad++\notepad++.exe",
        r"C:\Program Files (x86)\Notepad++\notepad++.exe",
    ]
    for p in npp_paths:
        if Path(p).exists():
            try:
                subprocess.Popen([p, abs_path_str])
                opened = True
                editor_name = "Notepad++"
                break
            except Exception:
                pass

    if not opened:
        try:
            subprocess.Popen(f'notepad.exe "{abs_path_str}"', shell=True)
            opened = True
            editor_name = "Notepad"
        except Exception:
            pass

    if not opened:
        try:
            os.startfile(abs_path_str)
            opened = True
            editor_name = "Trình soạn thảo mặc định"
        except Exception as ex:
            logger.warning(f"Không thể startfile: {ex}")

    content = ""
    try:
        content = srt_file.read_text(encoding="utf-8")
    except Exception:
        pass

    logger.info(f"Đã mở file phụ đề {srt_file} bằng {editor_name}")
    return {
        "status": "ok",
        "message": f"Đã mở file phụ đề bằng {editor_name}. Bạn có thể sửa trực tiếp trên Notepad hoặc trên giao diện Web!",
        "editor": editor_name,
        "file_path": abs_path_str,
        "content": content,
    }


@router.post("/open-folder/{task_id}")
async def open_task_folder_endpoint(task_id: str):
    """Mở thư mục chứa video hoàn thiện trên Windows Explorer."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy thư mục tác vụ")

    video_file = task_dir / "final_translated.mp4"
    target = video_file if video_file.exists() else task_dir

    try:
        if os.name == "nt":
            clean_path = str(target.resolve()).replace("/", "\\")
            subprocess.Popen(f'explorer /select,"{clean_path}"', shell=True)
        return {
            "status": "success",
            "message": f"Đã mở thư mục chứa video: {target}",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/social-share-info/{task_id}")
async def get_social_share_info_endpoint(task_id: str):
    """Lấy thông tin tiêu đề, mô tả, thẻ hashtag AI và các liên kết đăng tải MXH (TikTok, YouTube, Facebook)."""
    task_dir = TRANSLATE_OUTPUT_DIR / task_id
    if not task_dir.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy thư mục tác vụ")

    meta_file = task_dir / "task_meta.json"
    meta = {}
    if meta_file.exists():
        try:
            with open(meta_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    segments = meta.get("segments", [])
    first_few = [s.get("text", "") for s in segments[:4] if s.get("text") and len(s.get("text")) > 5]
    sample_dialogue = " ".join(first_few)

    suggested_title = "Phim Ngắn: " + (first_few[0].rstrip(".?!") if first_few else "Tập Phim Lồng Tiếng Mới Nhất #Shorts")
    if len(suggested_title) > 90:
        suggested_title = suggested_title[:87] + "..."

    suggested_tags = "#phimngan #shorts #tiktokviral #reels #trending #douyin #phimhay #review"
    suggested_desc = (
        f"{suggested_title}\n\n"
        f"Trích đoạn: {sample_dialogue[:180]}...\n\n"
        f"Dịch & Lồng tiếng AI bởi VoiceSync Studio.\n"
        f"{suggested_tags}"
    )

    video_file = task_dir / "final_translated.mp4"

    return {
        "task_id": task_id,
        "title": suggested_title,
        "description": suggested_desc,
        "hashtags": suggested_tags,
        "video_filename": video_file.name if video_file.exists() else "final_translated.mp4",
        "video_absolute_path": str(video_file.resolve()) if video_file.exists() else "",
        "direct_links": {
            "tiktok": "https://www.tiktok.com/creator-center/upload",
            "youtube": "https://studio.youtube.com/channel/UC/videos/upload?d=pt",
            "facebook": "https://www.facebook.com/reels/create",
        },
        "login_links": {
            "tiktok": "https://www.tiktok.com/login",
            "youtube": "https://studio.youtube.com",
            "facebook": "https://www.facebook.com/login",
        },
    }
