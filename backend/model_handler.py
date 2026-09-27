"""
model_handler.py
────────────────
Chứa toàn bộ logic liên quan đến OmniVoice (k2-fsa):
  - Load mô hình OmniVoice (gọi 1 lần khi startup).
  - create_voice_prompt(): trích xuất và lưu embedding VoiceClonePrompt (.pt).
  - generate_audio(): sinh âm thanh chất lượng cao 24,000 Hz với 3 chế độ:
      + Voice Cloning: dùng file .pt đã cache hoặc reference audio.
      + Voice Design: tạo giọng nói từ mô tả instruct.
      + Auto Voice: mô hình tự động chọn giọng phù hợp.
"""

import os
import gc
import re
import logging
import threading
import functools
from pathlib import Path
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
import soundfile as sf
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
import torch
# pyrefly: ignore [missing-import]
import librosa

from omnivoice import OmniVoice, VoiceClonePrompt
from audio_processor import enhance_vocal_audio

# Tự động tải biến môi trường từ file .env
load_dotenv()

logger = logging.getLogger(__name__)

# ─── Global model holder & thread lock ──────────────────────────────────────
_model: OmniVoice | None = None
_model_lock = threading.Lock()


def synchronized(lock: threading.Lock):
    """Decorator bảo đảm an toàn luồng (thread-safe) cho các tác vụ GPU/Inference."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            with lock:
                return func(*args, **kwargs)
        return wrapper
    return decorator

# Chuẩn sample rate của OmniVoice là 24,000 Hz
SAMPLE_RATE = 24_000

# ─── Cấu hình mặc định tối ưu cho OmniVoice (k2-fsa) ──────────────────────────
OMNIVOICE_DEVICE = "cuda"
OMNIVOICE_DTYPE = "float16"
OMNIVOICE_MODEL_ID = "k2-fsa/OmniVoice"
MAX_CHUNK_CHARS = 450
TOKEN_PADDING_FACTOR = 1.0
ENABLE_WARMUP_ONCE = True
ENABLE_EMPTY_CACHE = False
CUDNN_BENCHMARK = True

DEFAULT_NUM_STEP = int(os.getenv("DEFAULT_NUM_STEP", "32"))
AUDIO_MP3_BACKEND = os.getenv("AUDIO_MP3_BACKEND", "auto").lower().strip()

def is_remote_gpu_enabled() -> bool:
    load_dotenv(override=True)
    return (
        os.getenv("USE_REMOTE_GPU", "").lower() in ("true", "1", "yes")
        or os.getenv("USE_HUGGINGFACE_GPU", "").lower() in ("true", "1", "yes")
        or os.getenv("USE_COLAB_GPU", "").lower() in ("true", "1", "yes")
    )

def get_remote_gpu_url() -> str:
    load_dotenv(override=True)
    return (
        os.getenv("REMOTE_GPU_URL")
        or os.getenv("HUGGINGFACE_GPU_URL")
        or os.getenv("COLAB_API_URL")
        or ""
    ).rstrip("/")

# Tương thích ngược
USE_REMOTE_GPU = is_remote_gpu_enabled()
REMOTE_GPU_URL = get_remote_gpu_url()
USE_COLAB_GPU = USE_REMOTE_GPU
COLAB_API_URL = REMOTE_GPU_URL


def _remote_url(endpoint: str) -> str:
    """Tạo URL chính xác cho Remote Worker (Hugging Face Spaces dùng prefix /gradio_api/remote/, Colab dùng /api/remote/)."""
    base = get_remote_gpu_url()
    endpoint = endpoint.strip("/")
    if "/remote/" in base:
        return f"{base}/{endpoint}"
    if "hf.space" in base.lower():
        return f"{base}/gradio_api/remote/{endpoint}"
    return f"{base}/api/remote/{endpoint}"



def _remote_headers() -> dict[str, str]:
    """Headers gửi sang Remote Worker, hỗ trợ bypass trang cảnh báo miễn phí của Ngrok."""
    return {
        "ngrok-skip-browser-warning": "1",
        "User-Agent": "OmniVoice/1.0",
    }


_has_warmed_up = False
_is_remote_gpu_online = False


def load_model() -> None:
    """
    Load OmniVoice vào VRAM / RAM.
    Gọi hàm này duy nhất một lần trong FastAPI lifespan startup.
    Nếu bật USE_REMOTE_GPU, sẽ kiểm tra kết nối Cloud GPU. Nếu kết nối thành công, không tải local model.
    Nếu Cloud GPU offline hoặc lỗi, TỰ ĐỘNG FALLBACK tải mô hình vào GPU/CPU máy local.
    """
    global _model, _is_remote_gpu_online
    if _model is not None:
        logger.info("Mô hình OmniVoice đã được tải trước đó, bỏ qua.")
        return

    # ─── Chế độ Cloud GPU Worker (Hugging Face / Colab) ───────────────────────────
    if is_remote_gpu_enabled() and get_remote_gpu_url():
        target_health = _remote_url("health")
        logger.info(f"🌐 Đang kiểm tra kết nối Cloud GPU tại: {target_health} …")
        try:
            # pyrefly: ignore [missing-import]
            import httpx
            resp = httpx.get(target_health, headers=_remote_headers(), timeout=3.0)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    gpu_name = data.get("gpu_name", "Cloud GPU")
                    vram = data.get("vram_total_gb", "Auto")
                    provider = data.get("provider", "Cloud GPU")
                    logger.info(f"🚀 Kết nối Cloud GPU thành công! [{provider} - {gpu_name} ({vram}GB)]")
                except Exception:
                    logger.info("🚀 Kết nối Cloud GPU thành công! (Cloud Worker đang hoạt động)")
                logger.info("⚡ Máy local KHÔNG cần tải mô hình vào RAM — toàn bộ tác vụ TTS sẽ gửi sang Cloud GPU.")
                _is_remote_gpu_online = True
                return
            else:
                logger.warning(f"⚠️ Kiểm tra Cloud GPU trả về mã {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.warning(
                f"⚠️ Không thể kết nối tới GPU Online ({e}). "
                f"🔄 TỰ ĐỘNG CHUYỂN SANG DÙNG GPU/CPU CỤC BỘ TRÊN MÁY (Local Fallback)!"
            )
        _is_remote_gpu_online = False

    # Xác định thiết bị tính toán cục bộ
    if OMNIVOICE_DEVICE == "cuda" and torch.cuda.is_available():
        device_map = "cuda:0"
        dtype_val = torch.float16 if OMNIVOICE_DTYPE == "float16" else torch.float32
        if CUDNN_BENCHMARK:
            torch.backends.cudnn.benchmark = True
            logger.info("⚡ Đã bật torch.backends.cudnn.benchmark để tối ưu tốc độ tính toán ma trận.")
    else:
        device_map = "cpu"
        dtype_val = torch.float32

    logger.info(
        f"🚀 Đang tải mô hình {OMNIVOICE_MODEL_ID} (Device={device_map}, Dtype={dtype_val}) …"
    )

    _model = OmniVoice.from_pretrained(
        OMNIVOICE_MODEL_ID,
        device_map=device_map,
        dtype=dtype_val,
    )

    # Cấu hình hệ số đệm độ dài token (mặc định 1.0 = chuẩn gốc của OmniVoice)
    # Tuyệt đối không tự ý nhân > 1.0 (như 1.20) vì sẽ làm dư thừa token diffusion,
    # khiến mô hình bị vấp, lặp từ, ậm ừ hoặc kéo dài âm vô lý ở cuối câu.
    token_padding_factor = TOKEN_PADDING_FACTOR
    if token_padding_factor != 1.0:
        orig_est = _model._estimate_target_tokens

        def calibrated_estimate_target_tokens(text, ref_text, num_ref_audio_tokens, speed=1.0):
            est = orig_est(text, ref_text, num_ref_audio_tokens, speed=1.0)
            est = est * token_padding_factor
            if speed > 0 and speed != 1.0:
                est = est / (speed ** 0.8)
            return max(20, int(est))

        _model._estimate_target_tokens = calibrated_estimate_target_tokens
        logger.info(f"⚙️ Áp dụng TOKEN_PADDING_FACTOR = {token_padding_factor}")

    logger.info("✅ OmniVoice đã sẵn sàng phục vụ!")


def get_model() -> OmniVoice:
    """Trả về OmniVoice instance đã load. Tự động load nếu chưa khởi tạo."""
    global _model
    if _model is None:
        logger.info("🔄 OmniVoice chưa tải hoặc đã bị offload, tiến hành nạp lại...")
        load_model()
    return _model


def unload_model() -> None:
    """Giải phóng OmniVoice khỏi VRAM GPU."""
    global _model, _has_warmed_up
    if _model is not None:
        logger.info("🧹 Đang giải phóng OmniVoice khỏi bộ nhớ GPU VRAM...")
        del _model
        _model = None
        _has_warmed_up = False
    import gc
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    logger.info("✅ Đã dọn dẹp bộ nhớ đệm VRAM của OmniVoice.")


def _create_voice_prompt_remote(ref_audio: str, ref_text: str | None = None) -> VoiceClonePrompt:
    """Gửi file audio tham chiếu sang Remote GPU (Hugging Face Spaces / Colab) để trích xuất VoiceClonePrompt."""
    # pyrefly: ignore [missing-import]
    import httpx
    import tempfile

    url = _remote_url("prompt")
    logger.info(f"⚡ [Remote GPU] Đang trích xuất VoiceClonePrompt từ {Path(ref_audio).name} qua {url}...")

    with open(ref_audio, "rb") as f:
        files = {"audio_file": (Path(ref_audio).name, f, "audio/wav")}
        data = {}
        if ref_text and ref_text.strip():
            data["ref_text"] = ref_text.strip()

        resp = httpx.post(url, files=files, data=data, headers=_remote_headers(), timeout=180.0)
        if resp.status_code != 200:
            raise RuntimeError(f"Lỗi từ Remote GPU Worker ({resp.status_code}): {resp.text}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pt") as tmp_pt:
        tmp_pt.write(resp.content)
        tmp_pt_path = tmp_pt.name

    try:
        prompt = VoiceClonePrompt.load(tmp_pt_path)
        logger.info("✅ [Remote GPU] Đã nạp thành công VoiceClonePrompt từ Cloud!")
        return prompt
    finally:
        try:
            os.remove(tmp_pt_path)
        except OSError:
            pass

# Alias tương thích ngược
_create_voice_prompt_colab = _create_voice_prompt_remote


def create_voice_prompt(ref_audio: str, ref_text: str | None = None) -> VoiceClonePrompt:
    """
    Trích xuất đặc trưng âm thanh và tạo VoiceClonePrompt.
    Nếu ref_text là None hoặc rỗng, OmniVoice sẽ tự động dùng Whisper ASR để bóc băng.
    """
    if is_remote_gpu_enabled() and get_remote_gpu_url() and _is_remote_gpu_online:
        try:
            return _create_voice_prompt_remote(ref_audio, ref_text)
        except Exception as e:
            logger.warning(f"⚠️ Trích xuất giọng bằng GPU Online thất bại ({e}), tự động chuyển sang trích xuất bằng GPU/CPU máy local...")

    with _model_lock:
        model = get_model()
        logger.info(f"Đang tạo VoiceClonePrompt từ ref_audio='{ref_audio}', ref_text={ref_text}")
        prompt = model.create_voice_clone_prompt(
            ref_audio=ref_audio,
            ref_text=ref_text if (ref_text and ref_text.strip()) else None,
            preprocess_prompt=True,
        )
        return prompt


def clean_vietnamese_text(text: str) -> str:
    """
    Làm sạch văn bản tiếng Việt để tránh hiện tượng vấp, ngắt quãng hoặc lặp từ trong OmniVoice:
    - Thay dấu hai chấm ':' và chấm phẩy ';' bằng dấu chấm/phẩy để mô hình ngắt nhịp tự nhiên.
    - Loại bỏ các loại dấu ngoặc kép, ngoặc đơn lạ.
    - Chuẩn hóa khoảng trắng và dấu câu liên tiếp.
    """
    if not text:
        return ""
    # Thay dấu hai chấm và chấm phẩy bằng dấu phẩy để mô hình ngắt nhịp nhẹ nhàng, tự nhiên
    text = re.sub(r":\s*", ", ", text)
    text = re.sub(r";\s*", ", ", text)
    # Loại bỏ ngoặc kép và ngoặc đơn lạ
    text = re.sub(r'["“”\'‘’«»]', '', text)
    # Chuẩn hóa nhiều dấu chấm, gạch ngang liên tiếp
    text = re.sub(r"\.{2,}", ".", text)
    text = re.sub(r"-{2,}", "-", text)
    # Chuẩn hóa khoảng trắng
    text = re.sub(r"[ \t]+", " ", text).strip()
    return text


def split_into_chunks(text: str, max_chars: int | None = None) -> list[str]:
    """
    Chia nhỏ văn bản thành các đoạn tự nhiên và mạch lạc:
    - Luôn phân tách theo đoạn văn (xuống dòng \n) để giữ nhịp thở và cấu trúc văn bản.
    - Nếu đoạn văn dài hơn max_chars, ngắt tiếp theo dấu câu (. ? ! …).
    - Đảm bảo mỗi chunk luôn có dấu kết câu để mô hình hạ giọng dứt câu tự nhiên.
    """
    if max_chars is None:
        max_chars = MAX_CHUNK_CHARS
    cleaned = clean_vietnamese_text(text)
    paragraphs = [p.strip() for p in re.split(r"\n+", cleaned) if p.strip()]

    chunks: list[str] = []
    for p in paragraphs:
        if len(p) <= max_chars:
            chunks.append(p)
            continue

        # Phân tách theo ranh giới câu (. ? ! …)
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

    # Đảm bảo mỗi chunk kết thúc bằng dấu chấm ngắt câu nếu chưa có
    final_chunks: list[str] = []
    for c in chunks:
        c = c.strip()
        if c and not c.endswith((".", "!", "?", "…")):
            c += "."
        if c:
            final_chunks.append(c)

    return final_chunks or [cleaned]


VALID_INSTRUCT_TAGS = {
    "female", "male",
    "child", "teenager", "young adult", "middle-aged", "elderly",
    "very low pitch", "low pitch", "moderate pitch", "high pitch", "very high pitch",
    "whisper",
    "american accent", "australian accent", "british accent", "canadian accent",
    "chinese accent", "indian accent", "japanese accent", "korean accent",
    "portuguese accent", "russian accent",
}

INSTRUCT_SYNONYMS = {
    "gentle": "moderate pitch",
    "soft": "moderate pitch",
    "soft tone": "moderate pitch",
    "deep": "low pitch",
    "deep voice": "low pitch",
    "calm": "moderate pitch",
    "sweet": "high pitch",
    "energetic": "high pitch",
    "news": "moderate pitch",
    "broadcast news": "moderate pitch",
    "mysterious": "whisper",
}


def sanitize_instruct(instruct: str | None) -> str | None:
    """Lọc và chuẩn hóa instruct theo đúng bộ từ vựng OmniVoice hỗ trợ."""
    if not instruct or not instruct.strip():
        return None
    raw_tags = [t.strip().lower() for t in re.split(r"[,，]", instruct) if t.strip()]
    cleaned_tags: list[str] = []

    for tag in raw_tags:
        if tag in VALID_INSTRUCT_TAGS:
            if tag not in cleaned_tags:
                cleaned_tags.append(tag)
        elif tag in INSTRUCT_SYNONYMS:
            syn = INSTRUCT_SYNONYMS[tag]
            if syn not in cleaned_tags:
                cleaned_tags.append(syn)
        else:
            logger.warning(f"Bỏ qua instruct tag không hỗ trợ: '{tag}'")

    if not cleaned_tags:
        return "female, young adult, moderate pitch"

    return ", ".join(cleaned_tags)


def save_audio_file(
    output_path: Path | str,
    audio: np.ndarray,
    sample_rate: int = SAMPLE_RATE,
    audio_format: str = "mp3",
) -> None:
    """
    Xuất file âm thanh ra đĩa với cơ chế fallback đa tầng (soundfile <-> torchaudio <-> pydub).

    Thứ tự ưu tiên được quyết định theo biến môi trường AUDIO_MP3_BACKEND:
      - 'auto'       : Thử 'soundfile' trước -> fallback 'torchaudio' -> fallback 'pydub'
      - 'soundfile'  : Thử 'soundfile' trước -> fallback 'torchaudio' -> fallback 'pydub'
      - 'torchaudio' : Thử 'torchaudio' trước -> fallback 'soundfile' -> fallback 'pydub'

    Đảm bảo luôn xuất được file âm thanh (đặc biệt là MP3) ngay cả khi môi trường
    không hỗ trợ TorchCodec hoặc gặp lỗi backend torchaudio trên Windows/CPU.
    """
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fmt = (audio_format or "mp3").lower().strip()

    def _via_soundfile() -> None:
        sf_format = "MP3" if fmt == "mp3" else None
        sf.write(str(path), audio, sample_rate, format=sf_format)

    def _via_torchaudio() -> None:
        # pyrefly: ignore [missing-import]
        import torchaudio

        tensor_audio = torch.from_numpy(audio)
        if tensor_audio.ndim == 1:
            tensor_audio = tensor_audio.unsqueeze(0)
        torchaudio.save(str(path), tensor_audio, sample_rate, format=fmt)

    def _via_pydub() -> None:
        # pyrefly: ignore [missing-import]
        import pydub

        audio_int16 = (np.clip(audio, -1.0, 1.0) * 32767.0).astype(np.int16)
        channels = 1 if audio.ndim == 1 else audio.shape[1]
        segment = pydub.AudioSegment(
            audio_int16.tobytes(),
            frame_rate=sample_rate,
            sample_width=2,
            channels=channels,
        )
        segment.export(str(path), format=fmt, bitrate="320k" if fmt == "mp3" else None)

    # Nếu là định dạng không phải MP3 (ví dụ WAV, FLAC, OGG...)
    if fmt != "mp3":
        try:
            _via_soundfile()
            return
        except Exception as err:
            logger.warning(f"⚠️ Xuất định dạng '{fmt}' bằng soundfile thất bại ({err}), thử torchaudio...")
            try:
                _via_torchaudio()
                return
            except Exception as terr:
                logger.warning(f"⚠️ Fallback torchaudio cũng thất bại ({terr}), thử pydub...")
                _via_pydub()
                return

    # Đối với MP3: Quyết định thứ tự backend dựa theo cấu hình AUDIO_MP3_BACKEND
    backend_pref = os.getenv("AUDIO_MP3_BACKEND", AUDIO_MP3_BACKEND).lower().strip()
    if backend_pref == "torchaudio":
        backends = [
            ("torchaudio", _via_torchaudio),
            ("soundfile", _via_soundfile),
            ("pydub", _via_pydub),
        ]
    else:  # "auto", "soundfile", hoặc mặc định
        backends = [
            ("soundfile", _via_soundfile),
            ("torchaudio", _via_torchaudio),
            ("pydub", _via_pydub),
        ]

    errors: list[str] = []
    for idx, (name, exporter) in enumerate(backends):
        try:
            exporter()
            if idx > 0:
                logger.info(f"✅ Fallback thành công! Đã xuất file MP3 bằng '{name}': {path.name}")
            return
        except Exception as err:
            err_msg = f"{name}: {type(err).__name__} ({err})"
            errors.append(err_msg)
            if idx < len(backends) - 1:
                next_backend = backends[idx + 1][0]
                logger.warning(
                    f"⚠️ Xuất MP3 bằng '{name}' không thành công [{type(err).__name__}: {err}]. "
                    f"Tự động chuyển fallback sang '{next_backend}'..."
                )

    raise RuntimeError(
        f"Không thể xuất file MP3 '{path.name}' sau khi thử tất cả backends: {'; '.join(errors)}"
    )


def _generate_audio_remote(
    text: str,
    output_path: Path,
    mode: str = "clone",
    voice_clone_prompt: VoiceClonePrompt | None = None,
    ref_audio: str | None = None,
    ref_text: str | None = None,
    instruct: str | None = None,
    cfg_value: float = 2.0,
    num_step: int = 16,
    seed: int | None = 42,
    speed: float = 1.0,
    pitch: float = 0.0,
    audio_format: str = "mp3",
    enhance_audio: bool = True,
) -> None:
    """Gửi yêu cầu sinh âm thanh sang Remote GPU (Hugging Face Spaces A100 / Colab T4)."""
    # pyrefly: ignore [missing-import]
    import httpx
    import tempfile
    import io

    url = _remote_url("generate")
    cleaned_full_text = clean_vietnamese_text(text)
    logger.info(
        f"⚡ [Remote GPU] Gửi yêu cầu sinh audio: Mode={mode} | num_step={num_step} | speed={speed} | Text: '{cleaned_full_text[:50]}…'"
    )

    data = {
        "text": text,
        "mode": mode,
        "num_step": str(num_step),
        "cfg_value": str(cfg_value),
        "speed": str(speed),
    }
    if seed is not None:
        data["seed"] = str(seed)
    if instruct and mode == "design":
        data["instruct"] = sanitize_instruct(instruct) or ""
    if ref_text:
        data["ref_text"] = clean_vietnamese_text(ref_text)

    files = {}
    tmp_pt_to_clean = None

    try:
        if mode == "clone":
            if voice_clone_prompt is not None:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".pt") as tmp_pt:
                    voice_clone_prompt.save(tmp_pt.name)
                    tmp_pt_to_clean = tmp_pt.name
                files["prompt_file"] = ("prompt.pt", open(tmp_pt_to_clean, "rb"), "application/octet-stream")
            elif ref_audio and os.path.exists(ref_audio):
                files["ref_audio_file"] = (Path(ref_audio).name, open(ref_audio, "rb"), "audio/wav")

        resp = httpx.post(url, data=data, files=files if files else None, headers=_remote_headers(), timeout=300.0)

        if resp.status_code != 200:
            raise RuntimeError(f"Lỗi từ Remote GPU Worker ({resp.status_code}): {resp.text}")

        # Đọc dữ liệu âm thanh 24kHz từ bộ nhớ đệm WAV
        audio_np, sr = sf.read(io.BytesIO(resp.content), dtype="float32")

        # Xử lý hiệu ứng DSP: Pitch nếu có
        if pitch != 0.0:
            # pyrefly: ignore [missing-import]
            import librosa
            audio_np = librosa.effects.pitch_shift(audio_np, sr=SAMPLE_RATE, n_steps=pitch)

        export_sr = SAMPLE_RATE
        if enhance_audio:
            try:
                audio_np, export_sr = enhance_vocal_audio(
                    audio=audio_np,
                    sr=SAMPLE_RATE,
                    target_sr=44100 if audio_format.lower() in ("mp3", "wav") else SAMPLE_RATE,
                    enable_eq=True,
                    enable_compression=True,
                    enable_normalization=True,
                )
                logger.info(f"✨ Đã áp dụng Studio Vocal Mastering -> {export_sr}Hz cho {output_path.name}")
            except Exception as proc_err:
                logger.warning(f"⚠️ Lỗi khi áp dụng Audio Mastering ({proc_err}), dùng âm thanh gốc 24kHz")
                export_sr = SAMPLE_RATE

        save_audio_file(
            output_path=output_path,
            audio=audio_np,
            sample_rate=export_sr,
            audio_format=audio_format,
        )

        dur = round(len(audio_np) / export_sr, 2)
        logger.info(
            f"💾 Đã lưu: {output_path.name} | {dur:.2f}s | {export_sr}Hz | Format: {audio_format}"
        )

    finally:
        for k, v in files.items():
            try:
                v[1].close()
            except Exception:
                pass
        if tmp_pt_to_clean:
            try:
                os.remove(tmp_pt_to_clean)
            except OSError:
                pass
# Alias tương thích ngược
_generate_audio_colab = _generate_audio_remote


_remote_concurrency = int(os.getenv("REMOTE_CONCURRENCY", "2"))
_remote_semaphore = threading.Semaphore(_remote_concurrency)


def _generate_audio_local(
    text: str,
    output_path: Path,
    mode: str = "clone",
    voice_clone_prompt: VoiceClonePrompt | None = None,
    ref_audio: str | None = None,
    ref_text: str | None = None,
    instruct: str | None = None,
    cfg_value: float = 2.0,
    num_step: int = 16,
    seed: int | None = 42,
    speed: float = 1.0,
    pitch: float = 0.0,
    audio_format: str = "mp3",
    enhance_audio: bool = True,
) -> None:
    """Sinh âm thanh cục bộ trên GPU/CPU local (cần giữ _model_lock)."""
    model = get_model()

    if seed is not None:
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

    cleaned_full_text = clean_vietnamese_text(text)
    chunks = split_into_chunks(text, max_chars=MAX_CHUNK_CHARS)

    logger.info(
        f"OmniVoice synthesis | Mode={mode} | num_step={num_step} | Chunks={len(chunks)} | max_chars={MAX_CHUNK_CHARS} | Text: '{cleaned_full_text[:60]}…'"
    )

    all_audios: list[np.ndarray] = []
    design_voice_clone_prompt: VoiceClonePrompt | None = None
    clean_inst = sanitize_instruct(instruct) if mode == "design" else None

    # ─── [Voice Cloning] GPU Warmup Phase (Chỉ chạy 1 lần nếu được bật) ──────
    global _has_warmed_up
    if ENABLE_WARMUP_ONCE and not _has_warmed_up and mode == "clone":
        try:
            logger.info("🔥 [Voice Cloning] Đang warmup GPU 1 lần duy nhất...")
            warmup_kwargs: dict = {
                "text": "Xin chào.",
                "language": "vi",
                "num_step": min(8, num_step),
                "guidance_scale": cfg_value,
                "normalize_text": False,
                "speed": speed,
            }
            if voice_clone_prompt is not None:
                warmup_kwargs["voice_clone_prompt"] = voice_clone_prompt
            elif ref_audio:
                warmup_kwargs["ref_audio"] = ref_audio
                if ref_text and ref_text.strip():
                    warmup_kwargs["ref_text"] = clean_vietnamese_text(ref_text)
            model.generate(**warmup_kwargs)
            _has_warmed_up = True
            logger.info("✅ [Voice Cloning] GPU warmup lần đầu hoàn tất!")
        except Exception as e:
            logger.warning(f"⚠️ GPU warmup thất bại (không ảnh hưởng kết quả): {e}")

    # ─── [Voice Design] Warmup Phase ─────────────────────────────────────────
    # Trong mode "design", sinh trước câu ngắn để trích xuất prompt cho các chunk sau
    if mode == "design" and clean_inst and len(chunks) > 1:
        try:
            logger.info("🎙️ [Voice Design] Đang sinh warmup để trích xuất VoiceClonePrompt cho toàn bộ audio…")
            warmup_text = "Xin chào, đây là giọng đọc thử nghiệm."
            warmup_list = model.generate(
                text=warmup_text,
                language="vi",
                num_step=min(8, num_step),
                guidance_scale=cfg_value,
                normalize_text=False,
                speed=speed,
                instruct=clean_inst,
            )
            if warmup_list and len(warmup_list) > 0:
                warmup_np = np.array(warmup_list[0], dtype=np.float32)
                if warmup_np.ndim > 1:
                    warmup_np = warmup_np.squeeze()
                warmup_tensor = torch.from_numpy(warmup_np)
                design_voice_clone_prompt = model.create_voice_clone_prompt(
                    ref_audio=(warmup_tensor, SAMPLE_RATE),
                    ref_text=warmup_text,
                    preprocess_prompt=True,
                )
                logger.info("✅ [Voice Design] Warmup hoàn tất — toàn bộ chunks sẽ dùng giọng nhất quán!")
        except Exception as e:
            logger.warning(f"⚠️ Warmup thất bại, fallback về mode instruct cho chunk 1: {e}")

    # Xác định mã ngôn ngữ phù hợp cho OmniVoice (en, vi, zh, ja, ko)
    detect_lang = "vi"
    if text:
        clean_low = text.lower()
        if any(w in clean_low for w in [" the ", " is ", " are ", " and ", " you ", " what ", " to ", " of ", " with ", " for ", " this "]):
            detect_lang = "en"
        elif any("\u4e00" <= ch <= "\u9fff" for ch in text):
            detect_lang = "zh"
        elif any("\u3040" <= ch <= "\u30ff" for ch in text):
            detect_lang = "ja"
        elif any("\uac00" <= ch <= "\ud7af" for ch in text):
            detect_lang = "ko"

    try:
        with torch.inference_mode():
            for idx, chunk in enumerate(chunks):
                logger.info(f"Đang sinh chunk [{idx + 1}/{len(chunks)}]: '{chunk[:50]}...' (Lang: {detect_lang})")

                gen_kwargs = {
                    "text": chunk,
                    "language": detect_lang,
                    "num_step": num_step,
                    "guidance_scale": cfg_value,
                    "normalize_text": False,
                    "speed": speed,
                }

                if mode == "clone":
                    if voice_clone_prompt is not None:
                        gen_kwargs["voice_clone_prompt"] = voice_clone_prompt
                    elif ref_audio:
                        gen_kwargs["ref_audio"] = ref_audio
                        if ref_text and ref_text.strip():
                            gen_kwargs["ref_text"] = clean_vietnamese_text(ref_text)
                elif mode == "design":
                    if design_voice_clone_prompt is not None:
                        gen_kwargs["voice_clone_prompt"] = design_voice_clone_prompt
                    elif clean_inst:
                        gen_kwargs["instruct"] = clean_inst

                audio_list = model.generate(**gen_kwargs)
                if audio_list and len(audio_list) > 0:
                    audio_np = np.array(audio_list[0], dtype=np.float32)
                    if audio_np.ndim > 1:
                        audio_np = audio_np.squeeze()

                    all_audios.append(audio_np)

                if ENABLE_EMPTY_CACHE and torch.cuda.is_available():
                    torch.cuda.empty_cache()

    finally:
        if ENABLE_EMPTY_CACHE:
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()


    if not all_audios:
        raise ValueError("Không có âm thanh nào được tạo ra từ mô hình.")

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

    audio = np.concatenate(final_pieces)

    # Xử lý hiệu ứng DSP: Cao độ (Pitch) nếu người dùng có yêu cầu
    # Lưu ý: Tốc độ (Speed) đã được OmniVoice xử lý tự nhiên trực tiếp trong diffusion tokens,
    # không dùng librosa.effects.time_stretch để tránh méo pha (phase distortion/metallic reverb).
    if pitch != 0.0:
        # pyrefly: ignore [missing-import]
        import librosa
        audio = librosa.effects.pitch_shift(audio, sr=SAMPLE_RATE, n_steps=pitch)

    # Áp dụng Studio Audio Mastering Pipeline nếu được bật (mặc định True)
    export_sr = SAMPLE_RATE
    if enhance_audio:
        try:
            audio, export_sr = enhance_vocal_audio(
                audio=audio,
                sr=SAMPLE_RATE,
                target_sr=44100 if audio_format.lower() in ("mp3", "wav") else SAMPLE_RATE,
                enable_eq=True,
                enable_compression=True,
                enable_normalization=True,
            )
            logger.info(f"✨ Đã áp dụng Studio Vocal Mastering -> {export_sr}Hz cho {output_path.name}")
        except Exception as proc_err:
            logger.warning(f"⚠️ Lỗi khi áp dụng Audio Mastering ({proc_err}), dùng âm thanh gốc 24kHz")
            export_sr = SAMPLE_RATE

    # Lưu file âm thanh với cơ chế fallback tự động theo AUDIO_MP3_BACKEND
    save_audio_file(
        output_path=output_path,
        audio=audio,
        sample_rate=export_sr,
        audio_format=audio_format,
    )

    logger.info(
        f"💾 Đã lưu: {output_path.name} | {len(audio) / export_sr:.2f}s | {export_sr}Hz | Format: {audio_format}"
    )


def generate_audio(
    text: str,
    output_path: Path,
    mode: str = "clone",
    voice_clone_prompt: VoiceClonePrompt | None = None,
    ref_audio: str | None = None,
    ref_text: str | None = None,
    instruct: str | None = None,
    cfg_value: float = 2.0,
    num_step: int | None = None,
    seed: int | None = 42,
    speed: float = 1.0,
    pitch: float = 0.0,
    audio_format: str = "mp3",
    enhance_audio: bool = True,
) -> None:
    """
    Gọi OmniVoice.generate() và lưu file âm thanh 24kHz đầu ra.

    - Nếu bật USE_REMOTE_GPU: Chạy qua _remote_semaphore (mặc định 2 luồng song song tới Cloud GPU).
    - Nếu chạy Local: Khóa chặt 1 luồng bằng _model_lock để tránh tràn RAM / VRAM CUDA OOM.
    """
    if num_step is None:
        num_step = int(os.getenv("DEFAULT_NUM_STEP", str(DEFAULT_NUM_STEP)))

    # Đảm bảo model hoặc kết nối Cloud GPU đã được khởi tạo trước khi kiểm tra
    if _model is None and not _is_remote_gpu_online:
        load_model()

    # ─── Nếu bật Remote Cloud GPU và GPU Online đang hoạt động ─
    if is_remote_gpu_enabled() and get_remote_gpu_url() and _is_remote_gpu_online:
        try:
            with _remote_semaphore:
                _generate_audio_remote(
                    text=text,
                    output_path=output_path,
                    mode=mode,
                    voice_clone_prompt=voice_clone_prompt,
                    ref_audio=ref_audio,
                    ref_text=ref_text,
                    instruct=instruct,
                    cfg_value=cfg_value,
                    num_step=num_step,
                    seed=seed,
                    speed=speed,
                    pitch=pitch,
                    audio_format=audio_format,
                    enhance_audio=enhance_audio,
                )
            return
        except Exception as remote_err:
            logger.warning(f"⚠️ Gọi GPU Online thất bại ({remote_err}), tự động chuyển sang sinh âm thanh bằng GPU/CPU máy local...")

    # ─── Chế độ Local: Đảm bảo model đã nạp và khóa 1 luồng bảo vệ GPU/RAM ────
    if _model is None:
        load_model()

    if _model is None:
        raise RuntimeError("Mô hình OmniVoice cục bộ chưa được nạp và Cloud GPU không khả dụng.")

    with _model_lock:
        _generate_audio_local(
            text=text,
            output_path=output_path,
            mode=mode,
            voice_clone_prompt=voice_clone_prompt,
            ref_audio=ref_audio,
            ref_text=ref_text,
            instruct=instruct,
            cfg_value=cfg_value,
            num_step=num_step,
            seed=seed,
            speed=speed,
            pitch=pitch,
            audio_format=audio_format,
            enhance_audio=enhance_audio,
        )

