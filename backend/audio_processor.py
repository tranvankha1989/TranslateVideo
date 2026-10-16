"""
audio_processor.py — Studio Vocal Mastering & Audio Enhancement Pipeline
========================================================================
Mô-đun xử lý tín hiệu âm thanh chuyên nghiệp (DSP) cho giọng đọc TTS:
1. High-Pass Filter (Low-cut 75Hz): Triệt tiêu tiếng ù rung sub-bass không cần thiết.
2. Parametric Equalizer (Studio Vocal Curve):
   - De-mudding (-2.0dB @ 280Hz): Loại bỏ hiện tượng nghẹt mũi, tiếng vang như trong hộp.
   - Presence Boost (+2.2dB @ 3500Hz): Làm sắc nét các phụ âm và âm tiết tiếng Việt.
   - Air / Sheen Boost (+2.8dB @ 9000Hz High-shelf): Tăng độ sáng, sang như micro phòng thu.
3. Dynamic Range Compressor: Làm dày giọng đọc, cân bằng biên độ giữa các từ nói nhỏ và to.
4. Peak & Headroom Normalization (-1.0 dBFS): Đảm bảo âm lượng phát thanh tối đa không vỡ tiếng.
5. High-Quality Resampling (24kHz -> 44.1kHz): Nâng mẫu mượt mà khi xuất file.
"""

import logging
from pathlib import Path
import numpy as np
import scipy.signal as signal

logger = logging.getLogger("TTS.AudioProcessor")


def _biquad_peaking(
    audio: np.ndarray,
    sr: int,
    freq: float,
    gain_db: float,
    q: float = 1.0,
) -> np.ndarray:
    """
    Bộ lọc Peaking EQ chuẩn Robert Bristow-Johnson Audio EQ Cookbook.
    """
    if abs(gain_db) < 0.05:
        return audio

    A = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * np.pi * freq / sr
    alpha = np.sin(w0) / (2.0 * q)

    b0 = 1.0 + alpha * A
    b1 = -2.0 * np.cos(w0)
    b2 = 1.0 - alpha * A
    a0 = 1.0 + alpha / A
    a1 = -2.0 * np.cos(w0)
    a2 = 1.0 - alpha / A

    b = np.array([b0 / a0, b1 / a0, b2 / a0], dtype=np.float64)
    a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float64)

    return signal.lfilter(b, a, audio.astype(np.float64)).astype(np.float32)


def _biquad_highshelf(
    audio: np.ndarray,
    sr: int,
    freq: float,
    gain_db: float,
    shelf_slope: float = 1.0,
) -> np.ndarray:
    """
    Bộ lọc High-Shelf EQ để mở rộng dải âm sáng (Air/Sheen).
    """
    if abs(gain_db) < 0.05 or freq >= (sr / 2.0):
        return audio

    # Giới hạn tần số dưới tần số Nyquist
    safe_freq = min(freq, (sr / 2.0) - 200.0)
    A = 10.0 ** (gain_db / 40.0)
    w0 = 2.0 * np.pi * safe_freq / sr
    cos_w0 = np.cos(w0)
    sin_w0 = np.sin(w0)
    alpha = sin_w0 / 2.0 * np.sqrt((A + 1.0 / A) * (1.0 / shelf_slope - 1.0) + 2.0)
    two_sqrt_A_alpha = 2.0 * np.sqrt(A) * alpha

    b0 = A * ((A + 1.0) + (A - 1.0) * cos_w0 + two_sqrt_A_alpha)
    b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cos_w0)
    b2 = A * ((A + 1.0) + (A - 1.0) * cos_w0 - two_sqrt_A_alpha)
    a0 = (A + 1.0) - (A - 1.0) * cos_w0 + two_sqrt_A_alpha
    a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cos_w0)
    a2 = (A + 1.0) - (A - 1.0) * cos_w0 - two_sqrt_A_alpha

    b = np.array([b0 / a0, b1 / a0, b2 / a0], dtype=np.float64)
    a = np.array([1.0, a1 / a0, a2 / a0], dtype=np.float64)

    return signal.lfilter(b, a, audio.astype(np.float64)).astype(np.float32)


def apply_highpass(audio: np.ndarray, sr: int, cutoff: float = 75.0) -> np.ndarray:
    """
    High-Pass Filter bậc 2 để triệt tiêu tiếng rung ầm tần số cực thấp (< 75Hz).
    """
    nyquist = sr / 2.0
    norm_cutoff = min(cutoff / nyquist, 0.99)
    b, a = signal.butter(2, norm_cutoff, btype="highpass")
    return signal.lfilter(b, a, audio.astype(np.float64)).astype(np.float32)


def apply_soft_compressor(
    audio: np.ndarray,
    sr: int,
    threshold_db: float = -18.0,
    ratio: float = 2.2,
    attack_ms: float = 12.0,
    release_ms: float = 80.0,
    makeup_gain_db: float = 2.0,
) -> np.ndarray:
    """
    Bộ nén âm động (Vocal Compressor) mượt mà:
    - Thu hẹp khoảng cách giữa các từ phát âm quá to và quá nhỏ.
    - Giúp giọng nói dày dặn, đầm ấm và ổn định âm lượng như đài phát thanh.
    """
    if len(audio) == 0:
        return audio

    threshold = 10.0 ** (threshold_db / 20.0)
    alpha_attack = np.exp(-1.0 / (sr * (attack_ms / 1000.0)))
    alpha_release = np.exp(-1.0 / (sr * (release_ms / 1000.0)))

    # Envelope follower
    envelope = 0.0
    gain_curve = np.ones(len(audio), dtype=np.float32)
    abs_audio = np.abs(audio)

    for i in range(len(audio)):
        val = abs_audio[i]
        if val > envelope:
            envelope = alpha_attack * envelope + (1.0 - alpha_attack) * val
        else:
            envelope = alpha_release * envelope + (1.0 - alpha_release) * val

        if envelope > threshold:
            # Nén dB trên threshold
            env_db = 20.0 * np.log10(max(envelope, 1e-6))
            compressed_db = threshold_db + (env_db - threshold_db) / ratio
            gain_curve[i] = 10.0 ** ((compressed_db - env_db) / 20.0)
        else:
            gain_curve[i] = 1.0

    # Áp dụng gain curve và bù âm lượng makeup gain
    makeup = 10.0 ** (makeup_gain_db / 20.0)
    compressed = audio * gain_curve * makeup
    return compressed.astype(np.float32)


def normalize_peak(audio: np.ndarray, target_peak_db: float = -1.0) -> np.ndarray:
    """
    Chuẩn hóa đỉnh âm thanh (Peak Normalization) về ngưỡng an toàn (mặc định -1.0 dBFS).
    """
    max_peak = np.max(np.abs(audio))
    if max_peak < 1e-6:
        return audio

    target_linear = 10.0 ** (target_peak_db / 20.0)
    scaling = target_linear / max_peak
    return (audio * scaling).astype(np.float32)


def resample_audio(audio: np.ndarray, orig_sr: int, target_sr: int = 44100) -> np.ndarray:
    """
    Nâng mẫu âm thanh chất lượng cao (Sinc/Polyphase Resampling) lên 44.1kHz / 48kHz.
    """
    if orig_sr == target_sr or len(audio) == 0:
        return audio

    num_target_samples = int(round(len(audio) * float(target_sr) / float(orig_sr)))
    resampled = signal.resample(audio, num_target_samples)
    return resampled.astype(np.float32)


def enhance_vocal_audio(
    audio: np.ndarray,
    sr: int = 24000,
    target_sr: int | None = None,
    enable_eq: bool = True,
    enable_compression: bool = True,
    enable_normalization: bool = True,
) -> tuple[np.ndarray, int]:
    """
    Studio Audio Enhancement Pipeline hoàn chỉnh:
    Nhận mảng audio thô từ mô hình và trả về audio đã qua mastering chuyên nghiệp.

    Returns:
        (processed_audio, final_sample_rate)
    """
    if len(audio) == 0:
        return audio, sr

    processed = audio.copy().astype(np.float32)

    # 1. High-Pass Filter: Cắt rumble dưới 75Hz
    processed = apply_highpass(processed, sr=sr, cutoff=75.0)

    # 2. Parametric Vocal EQ
    if enable_eq:
        # A. De-mudding: Giảm độ bí ở vùng 280Hz (-2.0 dB)
        processed = _biquad_peaking(processed, sr=sr, freq=280.0, gain_db=-2.0, q=1.0)

        # B. Vocal Presence: Làm rõ phụ âm tiếng Việt ở vùng 3500Hz (+2.2 dB)
        processed = _biquad_peaking(processed, sr=sr, freq=3500.0, gain_db=+2.2, q=1.2)

        # C. Air / Sheen: Tạo độ sáng thoáng đãng ở vùng 9000Hz (+2.8 dB)
        processed = _biquad_highshelf(processed, sr=sr, freq=9000.0, gain_db=+2.8)

    # 3. Soft-knee Vocal Compressor: Làm dày tiếng và ổn định biên độ
    if enable_compression:
        processed = apply_soft_compressor(
            processed,
            sr=sr,
            threshold_db=-18.0,
            ratio=2.2,
            makeup_gain_db=2.0,
        )

    # 4. Peak Normalization: Chuẩn hóa về -1.0 dBFS
    if enable_normalization:
        processed = normalize_peak(processed, target_peak_db=-1.0)

    # 5. Resampling lên 44.1kHz nếu yêu cầu
    final_sr = sr
    if target_sr and target_sr != sr:
        processed = resample_audio(processed, orig_sr=sr, target_sr=target_sr)
        final_sr = target_sr

    return processed, final_sr


def apply_ebur128_loudnorm(
    input_path: str,
    output_path: str,
    target_i: float = -16.0,
    target_tp: float = -1.5,
    target_lra: float = 11.0,
    sample_rate: int = 44100,
    export_format: str = "mp3",
    bitrate: str = "320k",
) -> bool:
    """
    Chuẩn hóa âm lượng theo tiêu chuẩn phát thanh quốc tế ITU-R BS.1770-4 / EBU R128 (-16 LUFS Podcast / -14 LUFS Web).
    Sử dụng FFmpeg loudnorm filter với thuật toán dynamic true-peak limiter.
    """
    import subprocess
    import shutil

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        logger.warning("⚠️ Không tìm thấy ffmpeg trong PATH, bỏ qua EBU R128 loudnorm")
        return False

    cmd = [
        ffmpeg_bin,
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-i", str(input_path),
        "-af", f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}",
        "-ar", str(sample_rate),
    ]

    if export_format.lower() == "mp3":
        cmd.extend(["-c:a", "libmp3lame", "-b:a", bitrate])
    else:
        cmd.extend(["-c:a", "pcm_s16le"])

    cmd.append(str(output_path))

    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if res.returncode == 0:
            logger.info(f"✨ [EBU R128] Chuẩn hóa âm lượng thành công: Target {target_i} LUFS, Max TP {target_tp} dBTP -> {output_path}")
            return True
        else:
            logger.warning(f"⚠️ Lỗi FFmpeg loudnorm ({res.stderr}), sử dụng fallback")
            return False
    except Exception as e:
        logger.warning(f"⚠️ Ngoại lệ khi thực thi FFmpeg loudnorm: {e}")
        return False


def mix_voice_with_bgm_ducking(
    voice_path: str,
    bgm_path: str,
    output_path: str,
    bgm_volume: float = 0.25,
    ducking_depth_db: float = -14.0,
    attack_ms: int = 250,
    release_ms: int = 600,
    sample_rate: int = 44100,
    export_format: str = "mp3",
    bitrate: str = "320k",
) -> bool:
    """
    Trộn giọng nói với nhạc nền sử dụng Sidechain Auto-Ducking:
    - Khi có tiếng người đọc: Nhạc nền tự động hạ nhỏ (ducking) mượt mà để giọng đọc nổi bật.
    - Khi người đọc ngắt nghỉ: Nhạc nền tự động nổi to trở lại để lấp đầy khoảng lặng nghệ thuật.
    - Tự động lặp nhạc nền nếu bài nói dài hơn bài nhạc (-stream_loop -1).
    - Tự động fade-out đuôi nhạc nền khi kết thúc bài đọc.
    """
    import subprocess
    import shutil

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        logger.warning("⚠️ Không tìm thấy ffmpeg, không thể thực hiện auto-ducking")
        return False

    # Tính ratio nén theo ducking_depth_db
    ratio = max(2.5, min(8.0, abs(ducking_depth_db) / 3.0))

    # Kỹ thuật Audio Mastering:
    # 1. pan=stereo|c0=c0|c1=c0: Upmix giọng nói mono sang stereo chuẩn xác 100% biên độ gốc (tránh bị suy hao -3dB do panning law)
    # 2. asplit=2: Phân tách luồng giọng đọc thành 2 nhánh độc lập:
    #    - [voice_for_mix]: Đưa vào amix để ghép nhạc
    #    - [voice_for_sc]: Đưa vào sidechaincompress làm tín hiệu điều khiển (trigger)
    # 3. [1:a]: Chuẩn hóa nhạc nền về cùng tần số lấy mẫu và stereo, điều chỉnh âm lượng gốc
    # 4. sidechaincompress: Nén nhạc nền đồng bộ cả 2 kênh trái/phải khi có giọng đọc
    # 5. amix normalize=0: Ghép 2 luồng âm thanh mà KHÔNG LÀM GIẢM ÂM LƯỢNG của giọng nói gốc (giữ nguyên chuẩn EBU R128)
    filter_complex = (
        f"[0:a]pan=stereo|c0=c0|c1=c0,aresample={sample_rate},asplit=2[voice_for_mix][voice_for_sc];"
        f"[1:a]aformat=sample_rates={sample_rate}:channel_layouts=stereo,volume={bgm_volume:.2f}[bgm_norm];"
        f"[bgm_norm][voice_for_sc]sidechaincompress=threshold=0.08:ratio={ratio:.1f}:attack={attack_ms}:release={release_ms}[bgm_ducked];"
        f"[voice_for_mix][bgm_ducked]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mixed]"
    )

    cmd = [
        ffmpeg_bin,
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-i", str(voice_path),
        "-stream_loop", "-1",
        "-i", str(bgm_path),
        "-filter_complex", filter_complex,
        "-map", "[mixed]",
        "-ar", str(sample_rate),
        "-ac", "2",
    ]

    if export_format.lower() == "mp3":
        cmd.extend(["-c:a", "libmp3lame", "-b:a", bitrate])
    else:
        cmd.extend(["-c:a", "pcm_s16le"])

    cmd.append(str(output_path))

    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
        stderr_msg = res.stderr.decode("utf-8", errors="replace")
        if res.returncode == 0:
            logger.info(f"✨ [Auto-Ducking] Trộn nhạc nền thành công (Stereo 2-kênh): BGM Vol {bgm_volume:.0%}, Depth {ducking_depth_db}dB -> {output_path}")
            return True
        else:
            logger.error(f"❌ Lỗi FFmpeg sidechaincompress: {stderr_msg}")
            return False
    except Exception as e:
        logger.error(f"❌ Ngoại lệ khi thực thi Auto-Ducking: {e}")
        return False


def apply_trial_audio_watermark(audio: np.ndarray, sr: int, interval_sec: float = 45.0) -> np.ndarray:
    """
    Chèn audio watermark âm thanh nhẹ nhàng (soft chime) mỗi interval_sec (45 giây)
    khi ứng dụng đang ở chế độ Dùng thử (Trial).
    """
    total_duration = len(audio) / sr
    if total_duration < interval_sec:
        return audio

    watermarked = audio.copy()
    chime_duration = 0.5  # 500ms
    chime_samples = int(sr * chime_duration)
    t = np.linspace(0, chime_duration, chime_samples, endpoint=False)

    # Chime 2 âm kết hợp (880Hz + 1320Hz) với envelope mượt mà
    chime = 0.25 * np.sin(2 * np.pi * 880.0 * t) + 0.15 * np.sin(2 * np.pi * 1320.0 * t)
    window = np.hanning(chime_samples)
    chime = (chime * window).astype(np.float32)

    current_t = interval_sec
    while current_t + chime_duration <= total_duration:
        start_idx = int(current_t * sr)
        end_idx = start_idx + chime_samples
        watermarked[start_idx:end_idx] = 0.5 * watermarked[start_idx:end_idx] + chime
        current_t += interval_sec

    logger.info(f"🛡️ [Audio Watermark] Đã chèn audio watermark vào các mốc 45s cho bản Trial.")
    return watermarked


def apply_watermark_to_file(audio_path: Path, interval_sec: float = 45.0) -> bool:
    """Đọc file audio, chèn watermark mỗi 45s và ghi đè lại file."""
    try:
        import soundfile as sf
        audio, sr = sf.read(str(audio_path), dtype="float32")
        total_duration = len(audio) / sr
        if total_duration < interval_sec:
            return True

        if audio.ndim == 1:
            watermarked = apply_trial_audio_watermark(audio, sr, interval_sec)
        else:
            # Stereo: Áp dụng watermark cho cả 2 kênh
            watermarked = audio.copy()
            for ch in range(audio.shape[1]):
                watermarked[:, ch] = apply_trial_audio_watermark(audio[:, ch], sr, interval_sec)

        sf.write(str(audio_path), watermarked, sr)
        return True
    except Exception as e:
        logger.warning(f"Không thể chèn audio watermark: {e}")
        return False


