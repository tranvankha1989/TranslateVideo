import asyncio
import sys
from pathlib import Path
from app.services.dubbing_service import DubbingService
from app.services.alignment_service import AlignmentService, get_audio_duration

sys.stdout.reconfigure(encoding='utf-8')

async def main():
    print("=" * 60)
    print("🚀 KIỂM THỬ GIAI ĐOẠN 3: SPEED ALIGNMENT & AUDIO TIMELINE")
    print("=" * 60)

    # 1. Sinh 2 câu audio mẫu bằng Edge-TTS để làm dữ liệu kiểm thử
    print("[Chuẩn bị] Đang sinh 2 câu audio mẫu...")
    seg1_audio = await DubbingService.synthesize_single(
        text="Xin chào tất cả mọi người đã quay trở lại kênh của chúng tôi.",
        voice_id="vi-VN-HoaiMyNeural",
        target_duration=2.5
    )
    seg2_audio = await DubbingService.synthesize_single(
        text="Hôm nay chúng ta sẽ cùng khám phá tính năng đồng bộ âm thanh video.",
        voice_id="vi-VN-NamMinhNeural",
        target_duration=3.0
    )

    print(f"  - Câu 1 gốc: {seg1_audio['duration']}s (Mục tiêu gốc: 2.5s)")
    print(f"  - Câu 2 gốc: {seg2_audio['duration']}s (Mục tiêu gốc: 3.0s)")

    # 2. Test co giãn tốc độ từng câu (adjust_speed)
    print("\n[Test 1] Co giãn tốc độ (Speed Time-Stretching):")
    adj_res = AlignmentService.adjust_speed(
        audio_path=seg1_audio['audio_path'],
        target_duration=2.5,
        max_speed_rate=1.35
    )
    print(f"  - File đã cân chỉnh: {adj_res['output_audio_path']}")
    print(f"  - Tốc độ áp dụng: {adj_res['applied_speed']}x")
    print(f"  - Thời lượng trước: {adj_res['original_duration']}s ➔ Sau cân chỉnh: {adj_res['final_duration']}s")
    assert Path(adj_res['output_audio_path']).exists(), "File sau co giãn không tồn tại!"
    assert adj_res['final_duration'] < adj_res['original_duration'], "Thời lượng không giảm sau khi tăng tốc!"

    # 3. Test ráp nối toàn bộ trục thời gian Timeline (build_full_timeline)
    # Giả lập video dài 12.0 giây
    video_total_duration = 12.0
    test_segments = [
        {
            "id": 1,
            "start": 1.0,
            "end": 3.8,
            "audio_path": seg1_audio['audio_path']
        },
        {
            "id": 2,
            "start": 5.5,
            "end": 9.0,
            "audio_path": seg2_audio['audio_path']
        }
    ]

    print(f"\n[Test 2] Ráp nối toàn bộ trục thời gian Video (Độ dài video: {video_total_duration}s):")
    timeline_res = AlignmentService.build_full_timeline(
        segments=test_segments,
        total_video_duration=video_total_duration,
        max_speed_rate=1.35
    )

    print(f"  - Session ID: {timeline_res['session_id']}")
    print(f"  - File audio dải hoàn chỉnh: {timeline_res['final_audio_path']}")
    print(f"  - Tổng thời lượng thực tế: {timeline_res['total_duration']}s (Mục tiêu video: {video_total_duration}s)")
    for s in timeline_res['adjusted_segments']:
        print(f"    * Câu {s['id']}: Đặt tại [{s['start']}s -> {s['end']}s] với tốc độ {s['applied_speed']}x (Độ dài: {s['final_duration']}s)")

    assert Path(timeline_res['final_audio_path']).exists(), "File audio hoàn chỉnh không tồn tại!"
    assert abs(timeline_res['total_duration'] - video_total_duration) < 0.2, "Độ dài audio lệch so với video!"

    print("\n" + "=" * 60)
    print("🎉 TẤT CẢ CÁC BÀI TEST GIAI ĐOẠN 3 ĐÃ HOÀN THÀNH XUẤT SẮC 100%!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
