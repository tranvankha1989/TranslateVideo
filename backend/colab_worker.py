"""
colab_worker.py — OmniVoice GPU Remote Worker Server
────────────────────────────────────────────────────
File này được thiết kế để chạy trên Google Colab (với GPU NVIDIA Tesla T4 16GB)
hoặc bất kỳ máy chủ có GPU nào.

Cung cấp các API:
  - GET  /api/remote/health    : Kiểm tra trạng thái máy chủ & GPU VRAM
  - POST /api/remote/prompt    : Trích xuất đặc trưng giọng nói (VoiceClonePrompt .pt)
  - POST /api/remote/generate  : Sinh âm thanh đa chunk siêu tốc bằng OmniVoice trên GPU

Khởi chạy độc lập:
  python colab_worker.py --port 8000
"""

import os
import io
import gc
import re
import tempfile
import logging
from pathlib import Path

# pyrefly: ignore [missing-import]
import torch
# pyrefly: ignore [missing-import]
import soundfile as sf
# pyrefly: ignore [missing-import]
import numpy as np
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from omnivoice import OmniVoice, VoiceClonePrompt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] colab_worker — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("colab_worker")

SAMPLE_RATE = 24_000
MODEL_ID = os.getenv("OMNIVOICE_MODEL_ID", "k2-fsa/OmniVoice")

app = FastAPI(
    title="OmniVoice Colab GPU Worker",
    description="GPU Inference Worker phục vụ ứng dụng self-tts qua Ngrok / Cloudflare Tunnel",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_model: OmniVoice | None = None
_whisper_model = None
_whisper_model_size: str | None = None


def get_gpu_info() -> dict:
    """Lấy thông tin card đồ hoạ và VRAM khả dụng."""
    if not torch.cuda.is_available():
        return {
            "device": "cpu",
            "gpu_name": "No GPU (CPU Mode)",
            "vram_total_gb": 0.0,
            "vram_free_gb": 0.0,
        }
    dev_id = 0
    props = torch.cuda.get_device_properties(dev_id)
    total_mem = props.total_memory / (1024 ** 3)
    free_mem, _ = torch.cuda.mem_get_info(dev_id)
    free_gb = free_mem / (1024 ** 3)
    return {
        "device": f"cuda:{dev_id}",
        "gpu_name": torch.cuda.get_device_name(dev_id),
        "vram_total_gb": round(total_mem, 2),
        "vram_free_gb": round(free_gb, 2),
    }


def clean_vram():
    """Giải phóng bộ nhớ VRAM và thu dọn rác (Smart VRAM Management)."""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()


def get_whisper(model_size: str = "large-v3"):
    """Nạp động Faster-Whisper trên GPU với cơ chế lazy load và float16."""
    global _whisper_model, _whisper_model_size
    target = model_size.strip().lower()
    if _whisper_model is not None and _whisper_model_size == target:
        return _whisper_model

    from faster_whisper import WhisperModel
    dev_str = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if torch.cuda.is_available() else "int8"
    logger.info(f"🎙️ [Whisper STT] Đang tải Faster-Whisper '{target}' lên {dev_str} ({compute_type})...")
    
    clean_vram()
    _whisper_model = WhisperModel(target, device=dev_str, compute_type=compute_type)
    _whisper_model_size = target
    logger.info("✅ Tải Faster-Whisper thành công!")
    return _whisper_model


def load_worker_model() -> None:
    """Tải mô hình OmniVoice vào GPU VRAM."""
    global _model
    if _model is not None:
        return

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    if torch.cuda.is_available():
        torch.backends.cudnn.benchmark = True

    gpu_info = get_gpu_info()
    logger.info(
        f"🚀 Đang tải mô hình {MODEL_ID} lên {device} ({gpu_info.get('gpu_name')}) [dtype={dtype}]..."
    )

    clean_vram()
    _model = OmniVoice.from_pretrained(
        MODEL_ID,
        device_map=device,
        dtype=dtype,
    )
    logger.info("✅ OmniVoice đã sẵn sàng phục vụ trên GPU!")


@app.on_event("startup")
def startup_event():
    load_worker_model()


@app.get("/api/remote/health")
def health_check():
    """Endpoint kiểm tra tình trạng kết nối và card GPU."""
    gpu = get_gpu_info()
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "whisper_loaded": _whisper_model is not None,
        "sample_rate": SAMPLE_RATE,
        "provider": "Google Colab Worker",
        **gpu,
    }


def clean_vietnamese_text(text: str) -> str:
    """Làm sạch và chuẩn hóa văn bản."""
    if not text:
        return ""
    text = re.sub(r":\s*", ", ", text)
    text = re.sub(r";\s*", ", ", text)
    for q in ['"', '“', '”', "'", '‘', '’', '«', '»']:
        text = text.replace(q, "")
    text = re.sub(r"\.{2,}", ".", text)
    text = re.sub(r"-{2,}", "-", text)
    text = re.sub(r"[ \t]+", " ", text).strip()
    return text


def split_into_chunks(text: str, max_chars: int = 450) -> list[str]:
    """Chia nhỏ văn bản thành các đoạn tự nhiên theo câu."""
    cleaned = clean_vietnamese_text(text)
    paragraphs = [p.strip() for p in re.split(r"\n+", cleaned) if p.strip()]

    chunks: list[str] = []
    for p in paragraphs:
        if len(p) <= max_chars:
            chunks.append(p)
            continue

        sentences = re.split(r"(?<=[.?!…])\s+", p)
        cur = ""
        for s in sentences:
            s = s.strip()
            if not s:
                continue
            if not cur:
                cur = s
            elif len(cur) + len(s) + 1 <= max_chars:
                cur += " " + s
            else:
                chunks.append(cur)
                cur = s
        if cur:
            chunks.append(cur)

    final_chunks: list[str] = []
    for c in chunks:
        c = c.strip()
        if c and not c.endswith((".", "!", "?", "…")):
            c += "."
        if c:
            final_chunks.append(c)

    return final_chunks or [cleaned]


@app.post("/api/remote/prompt")
async def create_prompt_endpoint(
    audio_file: UploadFile = File(...),
    ref_text: str | None = Form(default=None),
):
    """
    Trích xuất VoiceClonePrompt (.pt) từ file audio tham chiếu sử dụng GPU.
    Trả về nội dung nhị phân (binary) của file prompt .pt.
    """
    if _model is None:
        raise HTTPException(status_code=503, detail="Mô hình OmniVoice chưa được tải")

    suffix = Path(audio_file.filename or "sample.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_audio:
        content = await audio_file.read()
        tmp_audio.write(content)
        tmp_audio_path = tmp_audio.name

    try:
        clean_text = ref_text.strip() if (ref_text and ref_text.strip()) else None
        logger.info(f"🎙️ Đang trích xuất VoiceClonePrompt trên GPU cho file: {audio_file.filename}...")
        
        prompt = _model.create_voice_clone_prompt(
            ref_audio=tmp_audio_path,
            ref_text=clean_text,
            preprocess_prompt=True,
        )

        with tempfile.NamedTemporaryFile(delete=False, suffix=".pt") as tmp_pt:
            prompt.save(tmp_pt.name)
            with open(tmp_pt.name, "rb") as pf:
                content = pf.read()
            os.remove(tmp_pt.name)

        logger.info("✅ Trích xuất VoiceClonePrompt thành công!")
        return Response(content=content, media_type="application/octet-stream")
    finally:
        try:
            os.remove(tmp_audio_path)
        except OSError:
            pass
        clean_vram()


@app.post("/api/remote/transcribe")
async def transcribe_endpoint(
    audio_file: UploadFile = File(...),
    language: str | None = Form(default=None),
    model_size: str | None = Form(default="large-v3-turbo"),
    initial_prompt: str | None = Form(default=None),
    vad_filter: bool = Form(default=True),
    vad_threshold: float = Form(default=0.50),
    min_speech_duration_ms: int = Form(default=150),
    min_silence_duration_ms: int = Form(default=350),
    speech_pad_ms: int = Form(default=150),
    beam_size: int = Form(default=3),
):
    """
    Bóc tách phụ đề và nhận diện giọng nói sử dụng Faster-Whisper trên Colab GPU.
    Áp dụng Smart VRAM: Nạp mô hình theo nhu cầu và dọn sạch VRAM sau khi hoàn thành.
    """
    suffix = Path(audio_file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_audio:
        content = await audio_file.read()
        tmp_audio.write(content)
        tmp_audio_path = tmp_audio.name

    try:
        whisper = get_whisper(model_size or "large-v3-turbo")
        lang_arg = None if (not language or language == "auto") else language.split("-")[0]
        chinese_prompt = initial_prompt.strip() if initial_prompt and initial_prompt.strip() else None
        if lang_arg == "zh" and not chinese_prompt:
            chinese_prompt = "以下是普通话的句子，请用简体中文输出。"
        
        logger.info(
            f"🎙️ [Colab Whisper STT] Nhận diện file '{audio_file.filename}' (Lang: {lang_arg or 'auto'}, Model: {model_size or 'large-v3-turbo'}, VAD Threshold: {vad_threshold})..."
        )

        segments_gen, info = whisper.transcribe(
            tmp_audio_path,
            language=lang_arg,
            initial_prompt=chinese_prompt,
            beam_size=beam_size,
            best_of=beam_size,
            condition_on_previous_text=False,
            repetition_penalty=1.2,
            no_speech_threshold=0.85,
            log_prob_threshold=-1.5,
            compression_ratio_threshold=2.8,
            vad_filter=vad_filter,
            vad_parameters=dict(
                threshold=vad_threshold,
                min_speech_duration_ms=min_speech_duration_ms,
                min_silence_duration_ms=min_silence_duration_ms,
                speech_pad_ms=speech_pad_ms,
            ) if vad_filter else None,
            word_timestamps=True,
        )

        result_segments = []
        for i, s in enumerate(segments_gen):
            words_data = []
            if getattr(s, "words", None):
                for w in s.words:
                    w_text = getattr(w, "word", "").strip()
                    if not w_text:
                        continue
                    words_data.append({
                        "word": w_text,
                        "start": round(getattr(w, "start", 0.0), 3),
                        "end": round(getattr(w, "end", 0.0), 3),
                        "probability": round(getattr(w, "probability", 1.0), 2),
                    })

            txt = s.text.strip()
            if not txt and not words_data:
                continue

            # Mốc thời gian chính xác theo từ (không bị trễ đầu và cắt cụt đuôi)
            if words_data:
                # Khắc phục hiện tượng Whisper kéo dãn mốc 'end' của từ qua khoảng lặng dài
                for wi in range(len(words_data)):
                    w_item = words_data[wi]
                    wt = w_item.get("word", "").strip()
                    ws = float(w_item.get("start", 0.0))
                    we = float(w_item.get("end", ws + 0.3))
                    wdur = max(0.1, we - ws)
                    is_c = any('\u4e00' <= ch <= '\u9fff' or '\u3040' <= ch <= '\u30ff' for ch in wt)
                    wmax = max(0.65, len(wt) * 0.45 + 0.3) if is_c else max(0.85, len(wt) * 0.25 + 0.4)
                    if wdur > wmax:
                        if wi + 1 < len(words_data):
                            nxt_s = float(words_data[wi + 1].get("start", we))
                            if nxt_s > ws + wmax:
                                w_item["end"] = round(ws + wmax, 3)
                        else:
                            w_item["end"] = round(ws + wmax, 3)

                valid_w = [w for w in words_data if w.get("word", "").strip()]
                if valid_w:
                    seg_start = valid_w[0]["start"]
                    seg_end = valid_w[-1]["end"]
                else:
                    seg_start = round(s.start, 3)
                    seg_end = round(s.end, 3)
            else:
                seg_start = round(s.start, 3)
                seg_end = round(s.end, 3)

            if seg_end <= seg_start:
                seg_end = round(seg_start + 0.3, 3)

            result_segments.append({
                "id": i + 1,
                "start": round(seg_start, 3),
                "end": round(seg_end, 3),
                "text": txt,
                "words": words_data,
            })

        logger.info(f"✅ [Colab Whisper STT] Đã nhận diện {len(result_segments)} câu (Ngôn ngữ: {info.language})!")
        return {
            "status": "ok",
            "language": info.language,
            "language_probability": round(info.language_probability, 3) if hasattr(info, "language_probability") else 1.0,
            "duration": round(info.duration, 2) if hasattr(info, "duration") else 0.0,
            "segments": result_segments,
        }
    finally:
        try:
            os.remove(tmp_audio_path)
        except OSError:
            pass
        clean_vram()


@app.post("/api/remote/generate")
async def generate_endpoint(
    text: str = Form(...),
    mode: str = Form(default="clone"),
    instruct: str | None = Form(default=None),
    num_step: int = Form(default=16),
    cfg_value: float = Form(default=2.0),
    speed: float = Form(default=1.0),
    seed: int | None = Form(default=42),
    ref_text: str | None = Form(default=None),
    prompt_file: UploadFile | None = File(default=None),
    ref_audio_file: UploadFile | None = File(default=None),
):
    """
    Sinh âm thanh đa chunk bằng GPU và trả về dữ liệu âm thanh 24kHz dạng WAV binary.
    """
    if _model is None:
        raise HTTPException(status_code=503, detail="Mô hình OmniVoice chưa được tải")

    if seed is not None:
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

    voice_clone_prompt: VoiceClonePrompt | None = None
    tmp_ref_path: str | None = None

    try:
        # 1. Nạp VoiceClonePrompt nếu được gửi lên
        if prompt_file is not None:
            pt_bytes = await prompt_file.read()
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pt") as tmp_pt:
                tmp_pt.write(pt_bytes)
                tmp_pt_path = tmp_pt.name
            try:
                device_str = "cuda:0" if torch.cuda.is_available() else "cpu"
                voice_clone_prompt = VoiceClonePrompt.load(tmp_pt_path, map_location=device_str)
            except Exception as e:
                logger.warning(f"Không thể đọc prompt_file bằng VoiceClonePrompt.load: {e}")
            finally:
                try:
                    os.remove(tmp_pt_path)
                except OSError:
                    pass

        # 2. Hoặc nạp file ref_audio nếu được gửi lên
        if ref_audio_file is not None:
            sfx = Path(ref_audio_file.filename or "ref.wav").suffix or ".wav"
            with tempfile.NamedTemporaryFile(delete=False, suffix=sfx) as tmp_ref:
                tmp_ref.write(await ref_audio_file.read())
                tmp_ref_path = tmp_ref.name

        chunks = split_into_chunks(text, max_chars=450)
        logger.info(
            f"⚡ Colab GPU | Mode={mode} | num_step={num_step} | Chunks={len(chunks)} | Text: '{text[:50]}…'"
        )

        all_audios: list[np.ndarray] = []
        design_voice_clone_prompt: VoiceClonePrompt | None = None

        with torch.inference_mode():
            for idx, chunk in enumerate(chunks):
                gen_kwargs = {
                    "text": chunk,
                    "language": "vi",
                    "num_step": num_step,
                    "guidance_scale": cfg_value,
                    "normalize_text": False,
                    "speed": speed,
                }

                if mode == "clone":
                    if voice_clone_prompt is not None:
                        gen_kwargs["voice_clone_prompt"] = voice_clone_prompt
                    elif tmp_ref_path:
                        gen_kwargs["ref_audio"] = tmp_ref_path
                        if ref_text and ref_text.strip():
                            gen_kwargs["ref_text"] = clean_vietnamese_text(ref_text)
                elif mode == "design":
                    if design_voice_clone_prompt is not None:
                        gen_kwargs["voice_clone_prompt"] = design_voice_clone_prompt
                    elif instruct:
                        gen_kwargs["instruct"] = instruct

                audio_list = _model.generate(**gen_kwargs)
                if audio_list and len(audio_list) > 0:
                    audio_np = np.array(audio_list[0], dtype=np.float32)
                    if audio_np.ndim > 1:
                        audio_np = audio_np.squeeze()
                    all_audios.append(audio_np)

        if not all_audios:
            raise HTTPException(status_code=500, detail="Mô hình không sinh được âm thanh")

        # Ghép các đoạn audio lại với khoảng lặng 0.22s giữa các câu
        silence_samples = int(SAMPLE_RATE * 0.22)
        silence_array = np.zeros(silence_samples, dtype=np.float32)

        final_pieces: list[np.ndarray] = []
        for i, a in enumerate(all_audios):
            # Mờ dần 10ms ở đầu và đuôi câu để khử tiếng click nổ
            fade_len = int(SAMPLE_RATE * 0.01)
            if len(a) > fade_len * 2:
                fade_in = np.linspace(0, 1, fade_len, dtype=np.float32)
                fade_out = np.linspace(1, 0, fade_len, dtype=np.float32)
                a[:fade_len] *= fade_in
                a[-fade_len:] *= fade_out

            final_pieces.append(a)
            if i < len(all_audios) - 1:
                final_pieces.append(silence_array)

        final_audio = np.concatenate(final_pieces)

        # Xuất ra bộ nhớ đệm WAV 24kHz
        wav_buf = io.BytesIO()
        sf.write(wav_buf, final_audio, SAMPLE_RATE, format="WAV")
        wav_buf.seek(0)

        dur = round(len(final_audio) / SAMPLE_RATE, 2)
        logger.info(f"🎉 Hoàn tất sinh {dur}s audio trên GPU T4!")

        return Response(content=wav_buf.getvalue(), media_type="audio/wav")

    finally:
        if tmp_ref_path:
            try:
                os.remove(tmp_ref_path)
            except OSError:
                pass
        clean_vram()


if __name__ == "__main__":
    import argparse
    import uvicorn

    parser = argparse.ArgumentParser(description="OmniVoice Colab GPU Worker Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host lắng nghe")
    parser.add_argument("--port", type=int, default=8000, help="Cổng dịch vụ")
    args = parser.parse_args()

    uvicorn.run(app, host=args.host, port=args.port)
