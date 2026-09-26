import asyncio
import sys
import subprocess
from pathlib import Path
from app.services.dubbing_service import DubbingService
from app.services.video_translation_pipeline import VideoTranslationPipeline, _TASK_STORE

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    print("=" * 60)
    print("🚀 KIỂM THỬ GIAI ĐOẠN 4: TOÀN BỘ PIPELINE DỊCH & LỒNG TIẾNG VIDEO")
    print("=" * 60)

    test_dir = Path("outputs/test_pipeline")
    test_dir.mkdir(parents=True, exist_ok=True)

    # 1. Tạo một video demo ngắn 5 giây có tiếng nói tiếng Anh để test
    print("\n[Bước 1] Đang tạo video demo tiếng Anh 5 giây để test...")
    audio_sample = test_dir / "english_voice.mp3"
    await DubbingService.synthesize_single(
        text="Hello everyone! Welcome to AI video translation.",
        voice_id="en-US-JennyNeural",
        output_path=audio_sample
    )

    test_video = test_dir / "sample_video_en.mp4"
    cmd_make_video = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "color=c=navy:s=640x360:r=25:d=5",
        "-i", str(audio_sample),
        "-c:v", "libx264", "-c:a", "aac", "-b:a", "128k",
        "-shortest", "-pix_fmt", "yuv420p",
        str(test_video)
    ]
    subprocess.run(cmd_make_video, capture_output=True, check=True)
    print(f"✅ Đã tạo video demo thành công: {test_video} (Dung lượng: {test_video.stat().st_size} bytes)")

    # 2. Khởi chạy Pipeline dịch video sang Tiếng Việt
    task_id = "test_e2e_01"
    _TASK_STORE[task_id] = {"task_id": task_id, "status": "processing", "progress": 0}

    print(f"\n[Bước 2] Bắt đầu chạy Pipeline dịch tự động Video (EN ➔ VI)...")
    print("  * Video nguồn: Tiếng Anh")
    print("  * Ngôn ngữ đích: Tiếng Việt")
    print("  * Giọng lồng tiếng: vi-VN-HoaiMyNeural (Nữ)")
    print("  * Chế độ phụ đề: Hard Sub Tiếng Việt")

    await VideoTranslationPipeline.run_pipeline(
        task_id=task_id,
        video_path=test_video,
        source_lang="en",
        target_lang="vi",
        voice_id="vi-VN-HoaiMyNeural",
        engine="edge-tts",
        subtitle_mode="hard_target",
        preserve_bgm=False,
    )

    task_status = VideoTranslationPipeline.get_task(task_id)
    print("\n[Bước 3] Kết quả thực thi Pipeline:")
    print(f"  - Trạng thái: {task_status.get('status')}")
    print(f"  - Tiến độ: {task_status.get('progress')}%")
    print(f"  - Thông điệp: {task_status.get('message')}")
    print(f"  - Video thành phẩm: {task_status.get('video_url')}")
    print(f"  - File phụ đề SRT: {task_status.get('subtitles_srt_url')}")

    assert task_status.get('status') == 'completed', f"Pipeline thất bại: {task_status.get('error')}"
    assert task_status.get('video_url') is not None, "Không có URL video thành phẩm!"

    print("\n" + "=" * 60)
    print("🎉 TẤT CẢ CÁC BÀI TEST GIAI ĐOẠN 4 ĐÃ HOÀN THÀNH XUẤT SẮC 100%!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
