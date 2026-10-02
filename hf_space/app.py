"""
app.py — Hugging Face ZeroGPU OmniVoice Worker
─────────────────────────────────────────────
Chạy trên Hugging Face Spaces với cơ chế ZeroGPU (NVIDIA A100/A10G).
Tự động cấp phát nhân GPU tính toán khi có request từ máy local và giải phóng sau khi xong.
"""

import os
import io
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

# Patch tương thích cho gradio và huggingface_hub >= 0.26
import huggingface_hub
if not hasattr(huggingface_hub, "HfFolder"):
    try:
        from huggingface_hub._login import HfFolder
        huggingface_hub.HfFolder = HfFolder
    except (ImportError, AttributeError):
        class HfFolder:
            @staticmethod
            def get_token():
                import os
                return os.getenv("HF_TOKEN")
        huggingface_hub.HfFolder = HfFolder

import gradio as gr
from fastapi import HTTPException, UploadFile, File, Form
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from omnivoice import OmniVoice, VoiceClonePrompt

# Hỗ trợ ZeroGPU decorator
try:
    import spaces
except ImportError:
    class spaces:
        @staticmethod
        def GPU(func=None, duration=None):
            if func is None:
                return lambda f: f
            return func

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] hf_worker — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("hf_worker")

SAMPLE_RATE = 24_000
MODEL_ID = "k2-fsa/OmniVoice"

_model: OmniVoice | None = None


def get_gpu_info() -> dict:
    if not torch.cuda.is_available():
        return {
            "device": "cpu",
            "gpu_name": "ZeroGPU (Idle/Standby)",
            "vram_total_gb": 0.0,
        }
    dev_id = 0
    props = torch.cuda.get_device_properties(dev_id)
    return {
        "device": f"cuda:{dev_id}",
        "gpu_name": torch.cuda.get_device_name(dev_id),
        "vram_total_gb": round(props.total_memory / (1024 ** 3), 2),
    }


def load_model_if_needed():
    global _model
    if _model is None:
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        logger.info(f"🚀 Đang tải mô hình {MODEL_ID} ({device})...")
        _model = OmniVoice.from_pretrained(
            MODEL_ID,
            device_map=device,
            dtype=dtype,
        )
        logger.info("✅ OmniVoice đã sẵn sàng!")
    return _model


def health_check():
    """Kiểm tra tình trạng worker."""
    gpu = get_gpu_info()
    return {
        "status": "ok",
        "provider": "Hugging Face Spaces (ZeroGPU A100)",
        "sample_rate": SAMPLE_RATE,
        **gpu,
    }


def clean_vietnamese_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r":\s*", ", ", text)
    text = re.sub(r";\s*", ", ", text)
    for q in [chr(34), chr(8220), chr(8221), chr(39), chr(8216), chr(8217), chr(171), chr(187)]:
        text = text.replace(q, "")
    text = re.sub(r"\.{2,}", ".", text)
    text = re.sub(r"-{2,}", "-", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def split_into_chunks(text: str, max_chars: int = 450) -> list[str]:
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


# ZeroGPU: Tự động cấp card NVIDIA A100 trong lúc chạy hàm
@spaces.GPU(duration=60)
def _gpu_create_prompt(ref_audio_path: str, ref_text: str | None = None) -> bytes:
    model = load_model_if_needed()
    prompt = model.create_voice_clone_prompt(
        ref_audio=ref_audio_path,
        ref_text=ref_text,
        preprocess_prompt=True,
    )
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pt") as tmp_pt:
        prompt.save(tmp_pt.name)
        with open(tmp_pt.name, "rb") as pf:
            content = pf.read()
        os.remove(tmp_pt.name)
    return content


# ZeroGPU: Tự động cấp card NVIDIA A100 trong lúc chạy sinh âm thanh
@spaces.GPU(duration=120)
def _gpu_generate_audio(
    chunks: list[str],
    mode: str,
    prompt_path: str | None,
    ref_audio_path: str | None,
    ref_text: str | None,
    instruct: str | None,
    num_step: int,
    cfg_value: float,
    speed: float,
    seed: int | None,
) -> bytes:
    model = load_model_if_needed()

    if seed is not None:
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

    voice_clone_prompt = None
    if prompt_path and os.path.exists(prompt_path):
        dev = "cuda:0" if torch.cuda.is_available() else "cpu"
        voice_clone_prompt = VoiceClonePrompt.load(prompt_path, map_location=dev)

    all_audios: list[np.ndarray] = []
    with torch.inference_mode():
        for chunk in chunks:
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
                elif ref_audio_path:
                    gen_kwargs["ref_audio"] = ref_audio_path
                    if ref_text:
                        gen_kwargs["ref_text"] = clean_vietnamese_text(ref_text)
            elif mode == "design" and instruct:
                gen_kwargs["instruct"] = instruct

            audio_list = model.generate(**gen_kwargs)
            if audio_list and len(audio_list) > 0:
                audio_np = np.array(audio_list[0], dtype=np.float32)
                if audio_np.ndim > 1:
                    audio_np = audio_np.squeeze()
                all_audios.append(audio_np)

    if not all_audios:
        raise ValueError("Không tạo được âm thanh từ mô hình")

    silence_samples = int(SAMPLE_RATE * 0.22)
    silence_array = np.zeros(silence_samples, dtype=np.float32)

    final_pieces: list[np.ndarray] = []
    for i, a in enumerate(all_audios):
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
    wav_buf = io.BytesIO()
    sf.write(wav_buf, final_audio, SAMPLE_RATE, format="WAV")
    wav_buf.seek(0)
    return wav_buf.getvalue()


# ─── Giao diện Gradio Dashboard khi mở trên trình duyệt ────────────────────────
with gr.Blocks(title="OmniVoice ZeroGPU Worker", theme=gr.themes.Soft()) as demo:
    gr.Markdown("# 🚀 OmniVoice ZeroGPU Worker (NVIDIA A100)")
    gr.Markdown("Worker này đang chạy ở chế độ nền phục vụ dự án **self-tts**.")
    with gr.Row():
        status_btn = gr.Button("🔍 Kiểm tra trạng thái Worker")
        status_output = gr.JSON(label="Trạng thái GPU & Hệ thống")
    status_btn.click(fn=health_check, outputs=status_output)

def health_endpoint():
    return health_check()


async def create_prompt_endpoint(
    audio_file: UploadFile = File(...),
    ref_text: str | None = Form(default=None),
):
    suffix = Path(audio_file.filename or "sample.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio_file.read())
        tmp_path = tmp.name

    try:
        clean_text = ref_text.strip() if (ref_text and ref_text.strip()) else None
        logger.info(f"🎙️ [ZeroGPU] Đang trích xuất prompt cho {audio_file.filename}...")
        pt_content = _gpu_create_prompt(tmp_path, clean_text)
        return Response(content=pt_content, media_type="application/octet-stream")
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


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
    chunks = split_into_chunks(text, max_chars=450)
    logger.info(f"⚡ [ZeroGPU A100] Sinh {len(chunks)} chunks | num_step={num_step} | Text: '{text[:50]}…'")

    tmp_pt_path = None
    tmp_ref_path = None

    try:
        if prompt_file is not None:
            pt_bytes = await prompt_file.read()
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pt") as tmp_pt:
                tmp_pt.write(pt_bytes)
                tmp_pt_path = tmp_pt.name

        if ref_audio_file is not None:
            sfx = Path(ref_audio_file.filename or "ref.wav").suffix or ".wav"
            with tempfile.NamedTemporaryFile(delete=False, suffix=sfx) as tmp_ref:
                tmp_ref.write(await ref_audio_file.read())
                tmp_ref_path = tmp_ref.name

        wav_bytes = _gpu_generate_audio(
            chunks=chunks,
            mode=mode,
            prompt_path=tmp_pt_path,
            ref_audio_path=tmp_ref_path,
            ref_text=ref_text,
            instruct=instruct,
            num_step=num_step,
            cfg_value=cfg_value,
            speed=speed,
            seed=seed,
        )

        return Response(content=wav_bytes, media_type="audio/wav")

    finally:
        if tmp_pt_path:
            try:
                os.remove(tmp_pt_path)
            except OSError:
                pass
        if tmp_ref_path:
            try:
                os.remove(tmp_ref_path)
            except OSError:
                pass


_whisper_model = None
_whisper_model_size: str | None = None


import glob
import ctypes

def preload_cuda_libraries():
    """Tự động tìm nạp các file libcublas.so, libcudnn.so từ site-packages vào bộ nhớ tiến trình."""
    for p in sys.path:
        for lib in glob.glob(os.path.join(p, "nvidia", "*", "lib", "*.so*")):
            try:
                ctypes.CDLL(lib, mode=ctypes.RTLD_GLOBAL)
            except Exception:
                pass

preload_cuda_libraries()


def get_whisper(model_size: str = "large-v3-turbo", force_cpu: bool = False):
    global _whisper_model, _whisper_model_size
    from faster_whisper import WhisperModel
    target_key = f"{model_size}_cpu" if force_cpu else model_size
    if _whisper_model is None or _whisper_model_size != target_key:
        if force_cpu or not torch.cuda.is_available():
            logger.info(f"🎙️ [ZeroGPU] Đang tải Faster-Whisper '{model_size}' (CPU mode)...")
            _whisper_model = WhisperModel(
                model_size,
                device="cpu",
                compute_type="int8",
                cpu_threads=4,
                num_workers=2,
            )
        else:
            logger.info(f"🎙️ [ZeroGPU] Đang tải Faster-Whisper '{model_size}' (CUDA mode)...")
            try:
                _whisper_model = WhisperModel(
                    model_size,
                    device="cuda",
                    compute_type="float16",
                    cpu_threads=4,
                    num_workers=1,
                )
            except Exception as e:
                logger.warning(f"⚠️ Không thể tải Faster-Whisper trên CUDA ({e}), chuyển sang CPU...")
                _whisper_model = WhisperModel(
                    model_size,
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=4,
                    num_workers=2,
                )
        _whisper_model_size = target_key
    return _whisper_model


@spaces.GPU(duration=180)
def _gpu_transcribe(
    audio_path: str,
    language: str | None,
    model_size: str,
    initial_prompt: str | None,
    vad_filter: bool,
    vad_threshold: float,
    min_speech_duration_ms: int,
    min_silence_duration_ms: int,
    speech_pad_ms: int,
    beam_size: int,
):
    def _do_transcribe(whisper_inst):
        segments_gen, info = whisper_inst.transcribe(
            audio_path,
            language=language,
            initial_prompt=initial_prompt,
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
        res_segs = []
        for i, s in enumerate(segments_gen):
            words_data = []
            if getattr(s, "words", None):
                for w in s.words:
                    w_text = getattr(w, "word", "").strip()
                    if not w_text:
                        continue
                    words_data.append({
                        "word": w_text,
                        "start": round(float(getattr(w, "start", 0.0)), 3),
                        "end": round(float(getattr(w, "end", 0.0)), 3),
                        "probability": round(float(getattr(w, "probability", 0.0)), 3),
                    })
            res_segs.append({
                "id": i,
                "seek": getattr(s, "seek", 0),
                "start": round(float(getattr(s, "start", 0.0)), 3),
                "end": round(float(getattr(s, "end", 0.0)), 3),
                "text": getattr(s, "text", "").strip(),
                "words": words_data,
            })
        det_lang = getattr(info, "language", language or "en")
        return res_segs, det_lang

    try:
        whisper = get_whisper(model_size, force_cpu=False)
        return _do_transcribe(whisper)
    except Exception as e:
        logger.warning(f"⚠️ Transcribe bằng CUDA thất bại ({e}), tự động chuyển sang chế độ dự phòng CPU...")
        whisper = get_whisper(model_size, force_cpu=True)
        return _do_transcribe(whisper)


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
    suffix = Path(audio_file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio_file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        lang_arg = None if (not language or language == "auto") else language.split("-")[0]
        p_prompt = initial_prompt.strip() if initial_prompt and initial_prompt.strip() else None
        if lang_arg == "zh" and not p_prompt:
            p_prompt = "以下是普通话的句子，请用简体中文输出。"

        logger.info(f"🎙️ [ZeroGPU Whisper STT] Nhận diện file '{audio_file.filename}' (Lang: {lang_arg or 'auto'}, Model: {model_size or 'large-v3-turbo'})...")
        segments, detected_lang = _gpu_transcribe(
            audio_path=tmp_path,
            language=lang_arg,
            model_size=model_size or "large-v3-turbo",
            initial_prompt=p_prompt,
            vad_filter=vad_filter,
            vad_threshold=vad_threshold,
            min_speech_duration_ms=min_speech_duration_ms,
            min_silence_duration_ms=min_silence_duration_ms,
            speech_pad_ms=speech_pad_ms,
            beam_size=beam_size,
        )
        return JSONResponse(content={"status": "ok", "language": detected_lang, "segments": segments})
    except Exception as exc:
        import traceback
        err_detail = traceback.format_exc()
        logger.error(f"❌ [ZeroGPU Transcribe Error]: {err_detail}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(exc), "traceback": err_detail},
        )
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


def register_api_routes(target_app):
    """
    Gắn API routes vào FastAPI app.
    Đăng ký cả hai prefix:
    - /gradio_api/remote/* : Bắt buộc cho Gradio 6 (Node.js proxy sẽ chuyển tiếp thẳng vào Python, tránh CSRF SvelteKit)
    - /api/remote/*        : Dùng cho Colab hoặc gọi trực tiếp
    """
    try:
        target_app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    except Exception:
        pass

    for prefix in ("/gradio_api/remote", "/api/remote"):
        target_app.add_api_route(f"{prefix}/health", health_endpoint, methods=["GET", "POST"])
        target_app.add_api_route(f"{prefix}/prompt", create_prompt_endpoint, methods=["POST"])
        target_app.add_api_route(f"{prefix}/generate", generate_endpoint, methods=["POST"])
        target_app.add_api_route(f"{prefix}/transcribe", transcribe_endpoint, methods=["POST"])


# Đăng ký routes vào demo.app ban đầu
register_api_routes(demo.app)


if __name__ == "__main__":
    # Launch với prevent_thread_lock=True để có thể gắn lại routes vào instance app thực thi
    app, _, _ = demo.launch(prevent_thread_lock=True)
    register_api_routes(app)
    demo.block_thread()
