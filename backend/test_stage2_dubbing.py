import asyncio
import sys
from pathlib import Path
from app.services.dubbing_service import DubbingService

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    print("=" * 60)
    print("🚀 KIỂM THỬ GIAI ĐOẠN 2: LỒNG TIẾNG VIDEO (VOICE DUBBING SERVICE)")
    print("=" * 60)

    # 1. Kiểm tra danh sách giọng đọc
    vi_voices = DubbingService.get_voices(lang="vi")
    en_voices = DubbingService.get_voices(lang="en")
    print(f"✅ Danh sách giọng Tiếng Việt ({len(vi_voices)} giọng):")
    for v in vi_voices:
        print(f"   - [{v['id']}] {v['name']} ({v['engine']})")

    print(f"\n✅ Danh sách giọng Tiếng Anh ({len(en_voices)} giọng):")
    for v in en_voices[:3]:
        print(f"   - [{v['id']}] {v['name']} ({v['engine']})")

    # 2. Test sinh giọng câu đơn Tiếng Việt (Hoài My)
    vi_text = "Chào mừng bạn đến với công cụ dịch video tự động VoiceSync AI!"
    print(f"\n[Test 1] Lồng tiếng câu đơn Tiếng Việt:")
    print(f"  - Nội dung: {vi_text}")
    res_vi = await DubbingService.synthesize_single(
        text=vi_text,
        voice_id="vi-VN-HoaiMyNeural",
        engine="edge-tts",
        target_duration=3.5
    )
    print(f"  - File audio: {res_vi['audio_path']}")
    print(f"  - Duration thực tế: {res_vi['duration']}s (Mục tiêu: {res_vi['target_duration']}s, Tỷ lệ: {res_vi['rate_ratio']}x)")
    assert Path(res_vi['audio_path']).exists(), "File audio Tiếng Việt không tồn tại!"
    assert res_vi['duration'] > 0, "Duration audio = 0!"

    # 3. Test sinh giọng câu đơn Tiếng Anh (Jenny)
    en_text = "Welcome to our automatic video translation tool, powered by AI!"
    print(f"\n[Test 2] Lồng tiếng câu đơn Tiếng Anh:")
    print(f"  - Nội dung: {en_text}")
    res_en = await DubbingService.synthesize_single(
        text=en_text,
        voice_id="en-US-JennyNeural",
        engine="edge-tts",
        target_duration=3.0
    )
    print(f"  - File audio: {res_en['audio_path']}")
    print(f"  - Duration thực tế: {res_en['duration']}s (Mục tiêu: {res_en['target_duration']}s, Tỷ lệ: {res_en['rate_ratio']}x)")
    assert Path(res_en['audio_path']).exists(), "File audio Tiếng Anh không tồn tại!"

    # 4. Test lồng tiếng hàng loạt cho mảng phân đoạn Subtitle Segments
    sample_segments = [
        {"id": 1, "start": 0.0, "end": 2.5, "text": "Xin chào mọi người hôm nay tôi rất vui được gặp các bạn."},
        {"id": 2, "start": 2.6, "end": 6.2, "text": "Công cụ này tự động dịch phụ đề và lồng tiếng chuẩn xác theo thời gian."},
    ]
    print(f"\n[Test 3] Lồng tiếng hàng loạt theo danh sách phân đoạn ({len(sample_segments)} câu):")
    batch_res = await DubbingService.synthesize_batch(
        segments=sample_segments,
        voice_id="vi-VN-NamMinhNeural",
        engine="edge-tts"
    )
    print(f"  - Session ID: {batch_res['session_id']}")
    print(f"  - Tổng số câu đã lồng tiếng: {batch_res['total_segments']}")
    print(f"  - Tổng thời lượng audio: {batch_res['total_duration']}s")
    for seg in batch_res['dubbed_segments']:
        print(f"    * Câu {seg['id']}: [{seg['start']}s -> {seg['end']}s] '{seg['text'][:25]}...'")
        print(f"      Audio: {seg['audio_url']} (Thời lượng: {seg['duration']}s)")
        assert Path(seg['audio_path']).exists(), f"File câu {seg['id']} không tồn tại!"

    print("\n" + "=" * 60)
    print("🎉 TẤT CẢ CÁC BÀI TEST GIAI ĐOẠN 2 ĐÃ HOÀN THÀNH XUẤT SẮC 100%!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
